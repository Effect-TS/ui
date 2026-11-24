/**
 * SPIKE (EFF-4218), not for release. The DOM host for `Kernel`: nodes, attributes under their HTML or SVG
 * names, properties, and one listener for each event name on the container, which gives a handler the
 * event's typed payload. Controlled form properties are put back after an event the Model didn't follow,
 * keeping a focused field's selection. Updates that ask for a view transition run in one. The document head
 * follows the tree's folded head when the mount is given `head: KernelDom.syncHead`, so an app without a
 * head doesn't carry what writes one. Dialogs, popovers and drag and drop work as `BrowserHost`'s do.
 *
 * Left out, to arrive with what uses it: hydration.
 */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Scope from "effect/Scope"
import type * as Component from "../Component.ts"
import * as Kernel from "../internal/kernel.ts"
import * as transitionRun from "../internal/transitionRun.ts"
import * as View from "../View.ts"
import * as BrowserHost from "./BrowserHost.ts"
import type * as Html from "./Html.ts"
import * as documentServices from "./internal/documentServices.ts"
import { attributeName, svgTags } from "./internal/elements.ts"
import * as headSync from "./internal/head.ts"
import { ownEvents } from "./internal/ownEvents.ts"
import {
  type FieldState,
  fieldStateOf,
  offsetIn,
  payloadOf
} from "./internal/payload.ts"
import { pointerTypeOf } from "./internal/pointer.ts"
import * as submit from "./internal/submit.ts"

const SVG = "http://www.w3.org/2000/svg"

const controlled: ReadonlySet<string> = new Set([
  "value",
  "checked",
  "selected",
  "open",
  "popoverOpen"
])

const restoring: ReadonlySet<string> = new Set([
  "input",
  "change",
  "compositionend",
  "toggle",
  "close",
  "reset"
])

const dropTargetEvents: ReadonlySet<string> = new Set([
  "dragenter",
  "dragleave",
  "dragover",
  "drop"
])

const typesOf = (event: DragEvent): ReadonlyArray<string> =>
  Array.from(event.dataTransfer?.types ?? [], (type) => type.toLowerCase())

const boxOf = (
  event: DragEvent,
  element: globalThis.Element
): Html.DragOverPayload => {
  const rect = element.getBoundingClientRect()
  return {
    x: (event.clientX ?? 0) - rect.left,
    y: (event.clientY ?? 0) - rect.top,
    width: rect.width,
    height: rect.height
  }
}

const isDialog = (node: globalThis.Node): node is HTMLDialogElement =>
  (node as globalThis.Element).localName === "dialog"

const matches = (element: globalThis.Element, selector: string): boolean => {
  try {
    return element.matches(selector)
  } catch {
    return false
  }
}

const inOrder = <A extends globalThis.Node>(nodes: Array<A>): Array<A> =>
  nodes.sort((a, b) => (a.compareDocumentPosition(b) & 4) !== 0 ? -1 : 1)

interface Showing {
  byHost: boolean
  closed: boolean
}

const isRadio = (node: globalThis.Node): node is HTMLInputElement =>
  (node as globalThis.Element).localName === "input" &&
  (node as HTMLInputElement).type === "radio"

const radioGroup = (
  radio: HTMLInputElement
): ReadonlyArray<HTMLInputElement> => {
  if (radio.name === "") return [radio]
  const root = radio.getRootNode() as Document | DocumentFragment
  return Array.from(
    root.querySelectorAll<HTMLInputElement>(`input[type="radio"]`)
  ).filter((other) => other.name === radio.name && other.form === radio.form)
}

const canonicalAttrs = (
  attrs: Readonly<Record<string, string>>
): Readonly<Record<string, string>> => {
  const out: Record<string, string> = Object.create(null)
  for (const name in attrs) {
    const normalized = attributeName(name, false)
    if (normalized !== undefined) out[normalized] = attrs[name]!
  }
  return out
}

const ignore = () => {}

type Node = globalThis.Node & { $r?: Kernel.Rec }

/**
 * Keeps a document's head in sync with a tree's folded head. `warn` reports a shell that conflicts with
 * the head.
 *
 * @stability experimental
 */
export type HeadSync = (
  document: Document,
  warn: (message: string) => void
) => { readonly sync: (head: never) => void; readonly release: () => void }

/**
 * The head sync of `BrowserHost`, for `HostOptions.head`.
 *
 * @stability experimental
 */
export const syncHead: HeadSync = headSync.make

/**
 * What `makeHost` takes: `head` writes the document head, which is otherwise left alone, and
 * `viewTransitions: false` runs the updates that ask for a view transition without one. `warn` reports a
 * shell that conflicts with the head, and defaults to `console.warn`.
 *
 * @stability experimental
 */
export interface HostOptions {
  readonly head?: HeadSync | undefined
  readonly viewTransitions?: boolean | undefined
  readonly warn?: ((message: string) => void) | undefined
  /** @internal */
  readonly step?: ((f: () => boolean) => boolean) | undefined
}

/**
 * A kernel host over `container`'s document, and what removes its listeners.
 *
 * @stability experimental
 */
export const makeHost = (
  container: globalThis.Element,
  options?: HostOptions
): Kernel.Host<globalThis.Node> & { readonly dispose: () => void } => {
  const document = container.ownerDocument
  const view = document.defaultView
  const listening = new Set<string>()
  const wanted = new WeakMap<globalThis.Node, Map<string, unknown>>()
  const composing = new WeakSet<globalThis.Node>()
  const forms = new WeakSet<EventTarget>()
  const edits = new WeakMap<globalThis.Node, Map<string, FieldState>>()
  let pending: {
    readonly node: globalThis.Node
    readonly state: FieldState
    readonly event: Event
  } | undefined
  let scratch: CSSStyleDeclaration | undefined
  const step = options?.step ?? ((f) => f())
  const remember = (node: globalThis.Node, state: FieldState | undefined) => {
    if (state === undefined) return
    let states = edits.get(node)
    if (states === undefined) edits.set(node, states = new Map())
    states.set(state.value, state)
  }
  let lastPointer: Html.PointerType | undefined
  let restore: Set<globalThis.Node> | undefined
  let transition: ViewTransition | undefined
  const later: (f: () => void) => void =
    typeof view?.requestAnimationFrame === "function"
      ? (f) => view.requestAnimationFrame(f)
      : (f) => setTimeout(f, 0)

  const writeControlled = (element: any, name: string, value: unknown) => {
    if (
      name === "value" &&
      (composing.has(element) || (value !== "" && element.type === "file"))
    ) return
    const state =
      name === "value" && element.getRootNode().activeElement === element
        ? fieldStateOf(element)
        : undefined
    if (state === undefined) {
      element[name] = value
      return
    }
    const { scrollLeft, scrollTop } = element
    element.value = value
    const shown: string = element.value
    const before = edits.get(element)?.get(shown)
    if (before !== undefined) {
      element.setSelectionRange(before.start, before.end, before.direction)
    } else if (state.start !== state.end || state.end !== state.value.length) {
      const start = offsetIn(state.value, shown, state.start)
      element.setSelectionRange(
        start,
        state.end === state.start
          ? start
          : offsetIn(state.value, shown, state.end),
        state.direction
      )
    } else return
    element.scrollLeft = scrollLeft
    element.scrollTop = scrollTop
  }

  const keepingScroll = (show: () => void) => {
    const focused = document.activeElement
    const left = view?.scrollX ?? 0
    const top = view?.scrollY ?? 0
    show()
    if (document.activeElement !== focused) {
      view?.scrollTo?.({ left, top, behavior: "instant" })
    }
  }

  const modals = new WeakSet<globalThis.Node>()
  const showings = new WeakMap<globalThis.Node, Array<Showing>>()
  const modalWanted = new Set<HTMLDialogElement>()
  const shown = new Set<HTMLDialogElement>()
  let modalPseudo: boolean | undefined
  const showingsOf = (dialog: globalThis.Node) => {
    let list = showings.get(dialog)
    if (list === undefined) showings.set(dialog, list = [])
    return list
  }
  const adoptShowing = (dialog: HTMLDialogElement) => {
    if (!dialog.open) return
    const list = showingsOf(dialog)
    if (list.at(-1)?.closed !== false) {
      list.push({ byHost: false, closed: false })
    }
    shown.add(dialog)
  }
  const closeDialog = (dialog: HTMLDialogElement, byHost: boolean) => {
    if (!dialog.open) return
    modals.delete(dialog)
    adoptShowing(dialog)
    shown.delete(dialog)
    const current = showingsOf(dialog).at(-1)!
    current.closed = true
    current.byHost = byHost
    dialog.close()
  }
  const closeShownIn = (node: globalThis.Node, self: boolean) => {
    for (const dialog of [...shown].reverse()) {
      if ((self || dialog !== node) && node.contains(dialog)) {
        closeDialog(dialog, true)
      }
    }
  }
  const showDialog = (dialog: HTMLDialogElement, want: unknown) => {
    adoptShowing(dialog)
    const current = !dialog.open
      ? false
      : modals.has(dialog) &&
          (modalPseudo !== true || matches(dialog, ":modal"))
      ? "modal"
      : true
    if (current === want) return
    if (want === false) return closeDialog(dialog, false)
    if (current !== false) closeDialog(dialog, true)
    if (want === "modal") {
      keepingScroll(() => dialog.showModal())
      modals.add(dialog)
      modalPseudo ??= matches(dialog, ":modal")
    } else dialog.show()
    showingsOf(dialog).push({ byHost: false, closed: false })
    shown.add(dialog)
  }

  const popoversToShow = new Set<HTMLElement>()
  const manualPopovers = new Set<HTMLElement>()
  const popoverModes = new WeakMap<globalThis.Node, string | null>()
  const applyPopover = (element: HTMLElement, want: unknown, now?: boolean) => {
    if (want !== true) {
      popoversToShow.delete(element)
      if (matches(element, ":popover-open")) element.hidePopover()
    } else if (!now) popoversToShow.add(element)
    else if (
      element.isConnected && element.hasAttribute("popover") &&
      !matches(element, ":popover-open")
    ) keepingScroll(() => element.showPopover())
  }

  const restoreNode = (node: globalThis.Node) => {
    const values = wanted.get(node)
    if (values === undefined) return
    for (const [name, value] of values) {
      if (name === "open" && isDialog(node)) {
        if (node.isConnected) showDialog(node, value)
      } else if (name === "popoverOpen") {
        if ((node as globalThis.Element).getAttribute("popover") === "manual") {
          applyPopover(node as HTMLElement, value, true)
        }
      } else if ((node as any)[name] !== value) {
        writeControlled(node, name, value)
      }
    }
  }

  const restoreAffected = (node: globalThis.Node): void => {
    restoreNode(node)
    const element = node as globalThis.Element
    if (isRadio(element)) {
      for (const other of radioGroup(element)) restoreNode(other)
    } else if (element.localName === "select") {
      for (const option of (node as HTMLSelectElement).options) {
        restoreNode(option)
      }
    } else if (element.localName === "form") {
      for (const control of (node as HTMLFormElement).elements) {
        restoreAffected(control)
      }
    }
  }

  const restoreSoon = (target: globalThis.Node) => {
    if (restore === undefined) {
      const nodes = restore = new Set()
      later(() => {
        restore = undefined
        for (const node of nodes) {
          restoreAffected(node)
          if (!composing.has(node)) edits.delete(node)
        }
      })
    }
    restore.add(target)
  }

  const elementOf = (node: globalThis.Node) =>
    (node as Node).$r?.v as View.Element<any, any> | undefined

  const dispatch = (
    node: globalThis.Node,
    name: string,
    payload: () => unknown,
    event?: Event
  ): boolean => {
    const rec = (node as Node).$r
    const element = rec?.v as View.Element<any, any> | undefined
    const handler = element?.handlers[name]
    if (handler === undefined) return false
    const prevents = element!.eventOptions[name]?.preventDefault
    if (prevents === "always") event?.preventDefault()
    const inst = rec!.inst
    step(() => {
      if (inst.closed) return false
      let message = handler
      if (typeof handler === "function") {
        try {
          message = handler(payload())
        } catch (error) {
          Kernel.fail(inst, "event", Cause.die(error))
          return false
        }
      }
      if (message === undefined) return false
      if (prevents === true) event?.preventDefault()
      Kernel.send(inst, message, name)
      return true
    })
    return true
  }

  let active: globalThis.Element | undefined
  let entered: EventTarget | null = null
  let exitCheck: ReturnType<typeof setTimeout> | undefined
  let droppedHere = false
  let overFrame = false
  let over:
    | readonly [globalThis.Element, Html.DragOverPayload, ReadonlyArray<string>]
    | undefined
  let overSent: Html.DragOverPayload | undefined

  const accepts = (node: globalThis.Node, types: ReadonlyArray<string>) => {
    const element = elementOf(node)
    return element?.handlers.drop !== undefined &&
      (element.eventOptions.drop as Html.DropTargetOptions | undefined)?.accepts
          ?.some((type) => types.includes(type.toLowerCase())) === true
  }

  const dropTargetOf = (event: DragEvent, path: ReadonlyArray<Node>) => {
    const types = typesOf(event)
    for (const node of path) {
      if (node === container) return
      if (accepts(node, types)) return node as globalThis.Element
    }
  }

  const activate = (next: globalThis.Element | undefined) => {
    if (next === active) return
    const previous = active
    active = next
    over = overSent = undefined
    if (previous !== undefined) dispatch(previous, "dragleave", () => ({}))
    if (next !== undefined) dispatch(next, "dragenter", () => ({}))
  }

  const endTargets = () => {
    clearTimeout(exitCheck)
    entered = null
    activate(undefined)
  }

  const queueOver = (element: globalThis.Element, event: DragEvent) => {
    if (elementOf(element)?.handlers.dragover === undefined) return
    over = [element, boxOf(event, element), typesOf(event)]
    if (overFrame) return
    overFrame = true
    later(() => {
      overFrame = false
      const queued = over
      over = undefined
      if (queued === undefined) return
      const [element, next, types] = queued
      if (
        active !== element || !element.isConnected ||
        !accepts(element, types) ||
        (overSent !== undefined && overSent.x === next.x &&
          overSent.y === next.y && overSent.width === next.width &&
          overSent.height === next.height)
      ) return
      overSent = next
      dispatch(element, "dragover", () => next)
    })
  }

  const onDropTarget = (
    name: string,
    event: DragEvent,
    path: ReadonlyArray<Node>
  ) => {
    if (name === "dragleave") {
      if (event.target !== entered) return
      clearTimeout(exitCheck)
      exitCheck = setTimeout(endTargets, 0)
      return
    }
    const target = dropTargetOf(event, path)
    if (name === "drop") {
      if (target !== undefined) {
        event.preventDefault()
        droppedHere = true
        const transfer = event.dataTransfer
        const data: Record<string, string> = Object.create(null)
        for (const type of transfer?.types ?? []) {
          if (type !== "Files") data[type] = transfer!.getData(type)
        }
        const payload: Html.DropPayload = {
          data,
          files: Array.from(transfer?.files ?? []),
          ...boxOf(event, target)
        }
        dispatch(target, "drop", () => payload)
      }
      return endTargets()
    }
    clearTimeout(exitCheck)
    if (name === "dragenter") entered = event.target
    if (target !== undefined) {
      event.preventDefault()
      const dropEffect =
        (elementOf(target)!.eventOptions.drop as Html.DropTargetOptions)
          .dropEffect
      if (dropEffect !== undefined && event.dataTransfer !== null) {
        event.dataTransfer.dropEffect = dropEffect
      }
    }
    activate(target)
    if (name === "dragover" && target !== undefined) queueOver(target, event)
  }

  const startDrag = (event: DragEvent, path: ReadonlyArray<Node>) => {
    droppedHere = false
    const transfer = event.dataTransfer
    if (transfer === null) return
    for (const node of path) {
      if (node === container) return
      const source = elementOf(node)?.eventOptions.dragstart as
        | Html.DragSourceOptions
        | undefined
      if (source?.data !== undefined) {
        for (const type in source.data) {
          transfer.setData(type, source.data[type]!)
        }
        if (source.effectAllowed !== undefined) {
          transfer.effectAllowed = source.effectAllowed
        }
        return
      }
    }
  }

  const listener = (event: Event): void => {
    const name = event.type
    const path = event.composedPath() as Array<Node>
    if (dropTargetEvents.has(name)) {
      return onDropTarget(name, event as DragEvent, path)
    }
    const target = path[0] ?? event.target as Node
    const composed = (event as InputEvent).isComposing === true
    if (isDialog(target)) {
      if (name === "cancel") {
        if (wanted.get(target)?.get("open") === "modal") event.preventDefault()
      } else if (name === "close") {
        const list = showings.get(target)
        const ended = list?.shift()
        if (ended !== undefined && (ended.byHost || list!.length > 0)) return
        if (!target.open) modals.delete(target)
      }
    }
    if (name === "pointerdown") lastPointer = pointerTypeOf(event) || undefined
    else if (name === "beforeinput") {
      const state = composed || composing.has(target)
        ? undefined
        : fieldStateOf(target)
      const edit = pending = state === undefined
        ? undefined
        : { node: target, state, event }
      if (edit !== undefined) {
        setTimeout(() => pending === edit && (pending = undefined), 0)
      }
    } else if (
      name === "compositionstart" || name === "compositionend" ||
      name === "input"
    ) {
      if (name === "compositionstart") remember(target, fieldStateOf(target))
      else if (name === "input") {
        const edit = pending
        pending = undefined
        if (
          edit?.node === target && !edit.event.defaultPrevented &&
          (edit.event as InputEvent).inputType ===
            (event as InputEvent).inputType
        ) remember(target, edit.state)
      }
      if (name === "compositionstart" || composed) composing.add(target)
      else composing.delete(target)
    }
    const owned = name === "submit" && event.target !== null &&
      forms.has(event.target)
    if (owned) {
      event.preventDefault()
      submit.ownedUnhandled.add(event)
    }
    if (name === "dragstart") startDrag(event as DragEvent, path)
    const own = ownEvents.has(name)
    for (let index = 0; index < path.length; index++) {
      const node = path[index]!
      if (node === container) break
      if (
        dispatch(
          node,
          name,
          () =>
            name === "dragend"
              ? {
                dropped: droppedHere ||
                  ((event as DragEvent).dataTransfer?.dropEffect ?? "none") !==
                    "none"
              }
              : payloadOf(
                name,
                event,
                target,
                node as globalThis.Element,
                lastPointer
              ),
          event
        )
      ) {
        if (owned) submit.ownedUnhandled.delete(event)
        break
      }
      if (own) break
    }
    if (name === "dragend") endTargets()
    if (restoring.has(name) && target !== undefined && target !== null) {
      restoreSoon(target)
    }
  }

  const listen = (name: string) => {
    if (listening.has(name)) return
    listening.add(name)
    container.addEventListener(name, listener, true)
  }

  const sync = options?.head?.(
    document,
    // oxlint-disable-next-line no-console
    options?.warn ?? ((message) => console.warn(message))
  )

  const start = (update: () => void, types: ReadonlyArray<string>) => {
    if (
      typeof document.startViewTransition !== "function" ||
      view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    ) return update()
    let ran = false
    const run = () => {
      ran = true
      update()
    }
    try {
      transition = document.startViewTransition(
        types.length > 0 && "types" in (view?.ViewTransition?.prototype ?? {})
          ? { update: run, types: [...types] }
          : run
      )
    } catch (error) {
      if (ran) throw error
      return update()
    }
    transition.ready.catch(ignore)
    transition.finished.catch(ignore)
  }

  return {
    createElement(tag) {
      if (svgTags.has(tag)) return document.createElementNS(SVG, tag)
      const element = document.createElement(tag)
      if (element.localName === "form") {
        forms.add(element)
        listen("submit")
      }
      return element
    },
    createText: (text) => document.createTextNode(text),
    setText(node, text) {
      ;(node as globalThis.Text).data = text
    },
    normalizeAttrs(node, attrs) {
      for (const name in attrs) {
        if (attributeName(name, false) !== name) {
          return (node as globalThis.Element).namespaceURI === SVG
            ? attrs
            : canonicalAttrs(attrs)
        }
      }
      return attrs
    },
    setAttr(node, name, value, previous) {
      const element = node as HTMLElement
      const normalized = attributeName(name, element.namespaceURI === SVG)
      if (normalized === undefined) return
      if (
        normalized !== "style" || element.style === undefined ||
        element.getAttribute("style") === (previous ?? null)
      ) {
        if (value === undefined) element.removeAttribute(normalized)
        else element.setAttribute(normalized, value)
        return
      }
      const style = element.style
      const before = scratch ??= document.createElement("div").style
      before.cssText = previous ?? ""
      const kept: Array<string> = []
      for (let index = 0; index < style.length; index++) {
        const property = style[index]!
        const own = style.getPropertyValue(property)
        const priority = style.getPropertyPriority(property)
        if (
          own !== before.getPropertyValue(property) ||
          priority !== before.getPropertyPriority(property)
        ) {
          kept.push(property, own, priority)
        }
      }
      if (value === undefined) element.removeAttribute("style")
      else element.setAttribute("style", value)
      for (let index = 0; index < kept.length; index += 3) {
        style.setProperty(kept[index]!, kept[index + 1]!, kept[index + 2])
      }
    },
    setProp(node, name, value) {
      const element = node as any
      if (controlled.has(name)) {
        let values = wanted.get(node)
        const dialog = name === "open" && isDialog(node)
        const popover = name === "popoverOpen"
        if (value === undefined && !dialog && !popover) {
          values?.delete(name)
          value = name === "value" ? "" : false
        } else {
          if (values === undefined) wanted.set(node, values = new Map())
          for (const event of restoring) listen(event)
          listen("compositionstart")
          listen("beforeinput")
          if (popover) {
            value = value === true
            const mode = element.getAttribute("popover")
            const same = values.get(name) === value &&
              popoverModes.get(node) === mode
            values.set(name, value)
            popoverModes.set(node, mode)
            manualPopovers[mode === "manual" ? "add" : "delete"](element)
            if (mode !== "auto" || !same) applyPopover(element, value)
            return
          }
          if (dialog) {
            value = value === "modal" ? value : value === true
            values.set(name, value)
            if (value === "modal") {
              modalWanted.add(node)
              listen("cancel")
            } else {
              modalWanted.delete(node)
              showDialog(node, value)
            }
            return
          }
          values.set(name, value)
        }
        if (element[name] !== value) writeControlled(element, name, value)
        if (name === "value" && !composing.has(node)) edits.delete(node)
        return
      }
      element[name] = value === undefined
        ? (typeof element[name] === "string"
          ? ""
          : typeof element[name] === "boolean"
          ? false
          : null)
        : value
    },
    setEvents(node, record, first) {
      if (first) (node as Node).$r = record
      const { eventOptions, handlers } = record.v as View.Element<any, any>
      for (const name in handlers) listen(name)
      if (handlers.drop !== undefined) {
        for (const name of dropTargetEvents) listen(name)
      }
      if (
        handlers.drop !== undefined || handlers.dragend !== undefined ||
        eventOptions.dragstart !== undefined
      ) {
        listen("dragstart")
        listen("dragend")
      }
      if (listening.has("click") || listening.has("pointerdown")) {
        listen("pointerdown")
      }
    },
    insert(parent, node, before) {
      parent.insertBefore(node, before)
    },
    remove(parent, node) {
      if (shown.size > 0) closeShownIn(node, true)
      parent.removeChild(node)
    },
    clear(parent) {
      if (shown.size > 0) closeShownIn(parent, false)
      parent.textContent = ""
    },
    parentOf: (node) => node.parentNode!,
    nextOf: (node) => node.nextSibling,
    controlled,
    runsMounts: true,
    commit() {
      for (const dialog of shown) {
        if (!dialog.open || !dialog.isConnected) shown.delete(dialog)
      }
      for (const dialog of inOrder([...modalWanted])) {
        if (dialog.isConnected) showDialog(dialog, "modal")
        else modalWanted.delete(dialog)
      }
      for (const element of manualPopovers) {
        if (!element.isConnected) manualPopovers.delete(element)
        else if (wanted.get(element)?.get("popoverOpen") === true) {
          popoversToShow.add(element)
        } else applyPopover(element, false)
      }
      const popovers = inOrder([...popoversToShow])
      popoversToShow.clear()
      for (const element of popovers) applyPopover(element, true, true)
    },
    head: sync === undefined ? undefined : (head) => sync.sync(head as never),
    transitions: options?.viewTransitions === false
      ? undefined
      : transitionRun.make(start),
    dispose() {
      transition?.skipTransition()
      transition = undefined
      sync?.release()
      for (const node of container.querySelectorAll("*")) {
        delete (node as Node).$r
      }
      for (const name of listening) {
        container.removeEventListener(name, listener, true)
      }
      listening.clear()
      endTargets()
    }
  }
}

/**
 * What `mountEffect` returns.
 *
 * @stability experimental
 */
export interface Root<Model, Msg> {
  readonly path: string
  readonly model: () => Model | undefined
  readonly send: (message: Msg) => void
}

const report: Kernel.Tree["report"] = (path, where, cause) =>
  globalThis.reportError?.(
    new Error("[@effect/ui] " + path + " failed in " + where, { cause })
  )

/**
 * What a mount takes besides its component: a message log's `record`, what a failed root shows, and the
 * host's options.
 *
 * @stability experimental
 */
export interface Options extends HostOptions {
  // oxlint-disable-next-line effect/no-unused-internal
  readonly log?: Kernel.Recorder | undefined
  readonly fallback?:
    | ((
      failure: AsyncResult.Failure<never, unknown>,
      h: View.Helper<never, {}>
    ) => View.Content<never, any>)
    | undefined
}

/**
 * `mountEffect` with the kernel's mount given: hydration's, which lives in a module of its own.
 *
 * @stability experimental
 */
export const mountWith = <Props, Model, Msg, R = never>(
  component: Component.Members<any, Props, Model, Msg, any, R, any, any>,
  container: globalThis.Element,
  options: Options | undefined,
  start: (
    host: Kernel.Host<globalThis.Node>,
    options: Kernel.Options
  ) => Kernel.Root
): Effect.Effect<Root<Model, Msg>, never, R | Scope.Scope> =>
  Effect.map(
    Effect.acquireRelease(
      Effect.contextWith((context) => {
        const host = makeHost(container, options)
        const fallback = options?.fallback
        const root = start(host, {
          report,
          context,
          log: options?.log,
          fallback: fallback === undefined
            ? undefined
            : (cause: Cause.Cause<unknown>) =>
              View.toNode(
                fallback(
                  AsyncResult.failure(cause),
                  View.makeHelper({}, component.elements()) as any
                )
              )
        })
        return Effect.succeed({ host, root })
      }),
      ({ host, root }) =>
        Effect.sync(() => {
          host.dispose()
          root.close()
        })
    ),
    ({ root }) => ({
      path: root.instance.path,
      model: () => root.instance.model as Model | undefined,
      send: root.send
    })
  )

/**
 * Mounts `component` into `container` until the Scope closes.
 *
 * @stability experimental
 */
export const mountEffect = <Props, Model, Msg, R = never>(
  component: Component.Members<any, Props, Model, Msg, any, R, any, any>,
  props: Props,
  container: globalThis.Element,
  options?: Options
): Effect.Effect<Root<Model, Msg>, never, R | Scope.Scope> =>
  mountWith(
    component,
    container,
    options,
    (host, kernel) =>
      Kernel.mount(
        component as unknown as Kernel.Runnable,
        props,
        container,
        host,
        kernel
      )
  )

/**
 * Mounts `component` into `container` for as long as the Layer is built.
 *
 * @stability experimental
 */
export const mount = <Props, Model, Msg, R = never>(
  component: Component.Members<any, Props, Model, Msg, any, R, any, any>,
  props: Props,
  container: globalThis.Element,
  options?: Options
): Layer.Layer<never, never, R> =>
  Layer.effectDiscard(mountEffect(component, props, container, options))

/**
 * What `BrowserHost.layer` provides besides the host: `Html.Host`, which the ref Commands use, the
 * document's `Query.Visibility` and `Query.Connectivity`, `HtmlSubscription.GlobalEvents` and
 * `HtmlSubscription.AnimationFrames`, and `HtmlImages.Images` and `HtmlFiles.Files`, for the life of the
 * Layer. A mount needs it only when what it shows uses one of them.
 *
 * @stability experimental
 */
export const layer = (
  options?: { readonly document?: Document | undefined }
): Layer.Layer<Html.Host> =>
  Layer.effectContext(
    documentServices.make(
      options?.document ?? globalThis.document,
      BrowserHost.htmlHost
    )
  )
