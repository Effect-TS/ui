/**
 * The OpenTUI host for `@effect/ui`: mounts a component tree onto an OpenTUI
 * `CliRenderer` (or test renderer), manages controlled input/select/focus
 * state, bridges global terminal events, and owns the renderer's lifecycle.
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Component from "@effect/ui/Component"
import * as Renderer from "@effect/ui/Renderer"
import type * as View from "@effect/ui/View"
import * as OT from "@opentui/core"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Scope from "effect/Scope"
import * as OpenTui from "./OpenTui.ts"
import * as OpenTuiSubscription from "./OpenTuiSubscription.ts"

/**
 * Constructor type for custom OpenTUI renderables registered through
 * `renderables` on {@link makeHost} or {@link layer}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type RenderableConstructor = new(
  ctx: OT.RenderContext,
  options: any
) => OT.BaseRenderable

/**
 * Options accepted by {@link makeHost}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MakeHostOptions {
  readonly renderables?: Readonly<Record<string, RenderableConstructor>> | undefined
  readonly onTitle?: ((title: string) => void) | undefined
}

/**
 * Configuration accepted by {@link layer}, {@link mount}, {@link mountEffect},
 * and {@link run}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface LayerConfig extends OT.CliRendererConfig {
  readonly renderables?: Readonly<Record<string, RenderableConstructor>> | undefined
}

/**
 * Passes when a root component renders OpenTUI elements or is host-neutral,
 * and otherwise names the host its vocabulary requires.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type OpenTuiRoot<V> = [Renderer.HostOf<V>] extends [OpenTui.Host]
  ? unknown
  : {
    readonly "OpenTuiHost.mount shows OpenTUI elements. This root's vocabulary needs":
      Renderer.HostOf<V>
  }

/**
 * Options accepted by {@link mount}, {@link mountEffect}, and {@link run}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MountOptions<V extends View.Elements, RF = never> {
  readonly fallback?:
    | ((
      failure: AsyncResult.Failure<never, unknown>,
      h: View.WithTags<never, {}, V>
    ) => View.Content<never, RF>)
    | undefined
  readonly query?: Renderer.QueryOptions | undefined
  readonly head?: boolean | undefined
  readonly renderer?: LayerConfig | undefined
}

const builtInCatalogue: Readonly<Record<string, RenderableConstructor>> = {
  box: OT.BoxRenderable,
  scrollbox: OT.ScrollBoxRenderable,
  text: OT.TextRenderable,
  input: OT.InputRenderable,
  textarea: OT.TextareaRenderable,
  select: OT.SelectRenderable
}

const textTagAttributes: Readonly<Record<string, number>> = {
  span: OT.TextAttributes.NONE,
  b: OT.TextAttributes.BOLD,
  i: OT.TextAttributes.ITALIC,
  u: OT.TextAttributes.UNDERLINE,
  a: OT.TextAttributes.NONE
}

const mouseEventProps: Readonly<Record<string, string>> = {
  mousedown: "onMouseDown",
  mouseup: "onMouseUp",
  mousemove: "onMouseMove",
  mouseover: "onMouseOver",
  mouseout: "onMouseOut",
  mousescroll: "onMouseScroll"
}

const controlledProps: ReadonlySet<string> = new Set([
  "value",
  "selectedIndex",
  "focused"
])

const textDecoder = new TextDecoder()

class Slot {
  readonly text: OT.TextNodeRenderable
  layout: OT.BoxRenderable | undefined = undefined
  parent: HostNode | undefined = undefined
  constructor(text: OT.TextNodeRenderable) {
    this.text = text
  }
}

class Container {
  readonly children: Array<HostNode> = []
}

type HostNode = OT.BaseRenderable | Slot | Container

const destroyRenderable = (node: OT.BaseRenderable | undefined): void => {
  if (node === undefined) return
  if (node instanceof OT.Renderable && node.isDestroyed) return
  node.destroyRecursively()
}

const destroyHostNode = (node: HostNode): void => {
  if (node instanceof Container) {
    for (const child of node.children.splice(0)) destroyHostNode(child)
    return
  }
  if (node instanceof Slot) {
    destroyRenderable(node.layout)
    destroyRenderable(node.text)
    return
  }
  destroyRenderable(node)
}

// Reclaims native handles for keepAlive subtrees discarded while parked in a Container.
const containerRegistry = new FinalizationRegistry<Array<HostNode>>(
  (children) => {
    for (const child of children.splice(0)) destroyHostNode(child)
  }
)

const isTextParent = (node: HostNode): boolean =>
  node instanceof OT.TextRenderable || OT.isTextNodeRenderable(node)

const realParent = (node: OT.BaseRenderable): OT.BaseRenderable | undefined => {
  const parent = node.parent ?? undefined
  if (parent instanceof OT.RootTextNodeRenderable) return parent.textParent
  return parent
}

const childrenOf = (node: OT.BaseRenderable): ReadonlyArray<OT.BaseRenderable> =>
  node instanceof OT.TextRenderable ? node.getTextChildren() : node.getChildren()

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true
  if (
    typeof a !== "object" || a === null ||
    typeof b !== "object" || b === null
  ) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  if (Array.isArray(b)) return false
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false
  const proto = Object.getPrototypeOf(a)
  if (proto !== Object.prototype && proto !== null) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]!
    if (
      !Object.hasOwn(b, key) ||
      !deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    ) return false
  }
  return true
}

const keyPayloadOf = (
  key: OT.KeyEvent,
  renderer: OT.CliRenderer
): OpenTui.KeyPayload => ({
  key: key.name,
  sequence: key.sequence,
  ctrl: key.ctrl,
  shift: key.shift,
  meta: key.meta,
  option: key.option,
  repeat: key.repeated === true || key.eventType === "repeat",
  eventType: key.eventType,
  editable: renderer.currentFocusedEditor !== null
})

const mousePayloadOf = (event: OT.MouseEvent): OpenTui.MousePayload => ({
  x: event.x,
  y: event.y,
  button: event.button,
  shift: event.modifiers.shift,
  alt: event.modifiers.alt,
  ctrl: event.modifiers.ctrl,
  ...(event.scroll !== undefined
    ? {
      scroll: {
        direction: event.scroll.direction,
        delta: event.scroll.delta
      }
    }
    : {})
})

const pastePayloadOf = (event: OT.PasteEvent): OpenTui.PastePayload => ({
  text: textDecoder.decode(event.bytes)
})

const resetDefault = (
  node: OT.BaseRenderable,
  name: string,
  baseAttributes: WeakMap<OT.TextNodeRenderable, number>
): unknown => {
  switch (name) {
    case "border":
      return false
    case "borderStyle":
      return "single"
    case "shouldFill":
      return true
    case "visible":
      return true
    case "opacity":
      return 1
    case "wrapMode":
      return "none"
    case "textAlign":
      return "left"
    case "truncate":
      return false
    case "showDescription":
      return true
    case "showSelectionIndicator":
      return true
    case "showScrollIndicator":
      return false
    case "wrapSelection":
      return false
    case "stickyScroll":
      return false
    case "scrollX":
      return false
    case "scrollY":
      return true
    case "titleAlignment":
    case "bottomTitleAlignment":
      return "left"
    case "attributes":
      return OT.isTextNodeRenderable(node)
        ? (baseAttributes.get(node) ?? OT.TextAttributes.NONE)
        : OT.TextAttributes.NONE
    default:
      return undefined
  }
}

interface EventEntry {
  handlers: Readonly<Record<string, View.Handler<unknown, any>>>
  options: Readonly<Record<string, View.EventOptions>>
  dispatch: Renderer.Dispatch
  readonly wired: Set<string>
}

/**
 * Builds the `OpenTui.Host` service over a `CliRenderer`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const makeHostService = (
  renderer: OT.CliRenderer
): Context.Service.Shape<typeof OpenTui.Host> => ({
  focus: (node) => {
    if (!node.isDestroyed) node.focus()
  },
  blur: (node) => {
    if (!node.isDestroyed) node.blur()
  },
  scrollTo: (node, position) => {
    if (!node.isDestroyed) node.scrollTo(position as any)
  },
  scrollBy: (node, delta) => {
    if (!node.isDestroyed) node.scrollBy(delta as any)
  },
  measure: (node) => ({
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height
  }),
  quit: () => {
    if (!renderer.isDestroyed) renderer.destroy()
  }
})

/**
 * Builds an `OpenTuiSubscription.GlobalEvents` source wired to `renderer`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const makeGlobalEvents = (
  renderer: OT.CliRenderer
): OpenTuiSubscription.GlobalEvents => ({
  listen: (event, listener) => {
    if (event === "keypress" || event === "keyrelease") {
      const keyEvent: "keypress" | "keyrelease" = event
      const handler = (key: OT.KeyEvent) => {
        const payload = {
          ...keyPayloadOf(key, renderer),
          defaultPrevented: key.defaultPrevented
        }
        listener(payload as any, () => key.preventDefault())
      }
      renderer.keyInput.on(keyEvent, handler)
      return () => {
        renderer.keyInput.off(keyEvent, handler)
      }
    }
    if (event === "paste") {
      const handler = (paste: OT.PasteEvent) => {
        const payload = {
          ...pastePayloadOf(paste),
          defaultPrevented: paste.defaultPrevented
        }
        listener(payload as any, () => paste.preventDefault())
      }
      renderer.keyInput.on("paste", handler)
      return () => {
        renderer.keyInput.off("paste", handler)
      }
    }
    const handler = (width: number, height: number) => {
      listener(
        { width, height, defaultPrevented: false } as any,
        () => {}
      )
    }
    renderer.on(OT.CliRenderEvents.RESIZE, handler)
    return () => {
      renderer.off(OT.CliRenderEvents.RESIZE, handler)
    }
  }
})

/**
 * Builds a `Renderer.Host` over an OpenTUI `CliRenderer`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const makeHost = (
  renderer: OT.CliRenderer,
  options?: MakeHostOptions | undefined
): Renderer.Host<HostNode> => {
  const catalogue: Record<string, RenderableConstructor> = {
    ...builtInCatalogue,
    ...options?.renderables
  }
  // OpenTUI's RenderContext omits `| undefined` under exactOptionalPropertyTypes.
  const renderCtx = renderer as unknown as OT.RenderContext
  let nextId = 0
  let lastTitle: string | undefined

  const slots = new WeakMap<OT.BaseRenderable, Slot>()
  const containerParent = new WeakMap<HostNode, Container>()
  const baseAttributes = new WeakMap<OT.TextNodeRenderable, number>()
  const events = new WeakMap<OT.BaseRenderable, EventEntry>()
  const wanted = new WeakMap<OT.BaseRenderable, Map<string, unknown>>()
  const lastProps = new WeakMap<OT.BaseRenderable, Map<string, unknown>>()
  const controlledWired = new WeakSet<OT.BaseRenderable>()
  const suppressing = new WeakSet<OT.BaseRenderable>()

  const detached = new Set<HostNode>()
  const pendingFocus = new Set<OT.Renderable>()
  const pendingRevert = new Set<OT.BaseRenderable>()
  let revertScheduled = false

  const real = (node: HostNode, parent?: HostNode): OT.BaseRenderable => {
    if (!(node instanceof Slot)) return node as OT.BaseRenderable
    if (parent === undefined) return node.layout ?? node.text
    if (isTextParent(parent)) return node.text
    if (node.layout === undefined) {
      node.layout = new OT.BoxRenderable(renderCtx, {
        id: `slot-${nextId++}`,
        visible: false,
        width: 0,
        height: 0
      })
      slots.set(node.layout, node)
    }
    return node.layout
  }

  const wrap = (renderable: OT.BaseRenderable): HostNode =>
    slots.get(renderable) ?? renderable

  const isAttachedToLiveTree = (node: OT.Renderable): boolean => {
    let at: HostNode | undefined = node
    while (at !== undefined) {
      if (at === renderer.root) return true
      if (at instanceof Container) return false
      const parked = containerParent.get(at)
      if (parked !== undefined) return false
      at = at instanceof Slot ? at.parent : realParent(at)
    }
    return false
  }

  const writeInputValue = (node: OT.InputRenderable, value: string): void => {
    if (node.value === value) return
    const prevValue = node.value
    const prevCursor = node.cursorOffset
    suppressing.add(node)
    try {
      node.value = value
      node.cursorOffset = prevCursor >= prevValue.length
        ? value.length
        : Math.min(prevCursor, value.length)
    } finally {
      suppressing.delete(node)
    }
  }

  const writeTextareaValue = (
    node: OT.TextareaRenderable,
    value: string
  ): void => {
    if (node.plainText === value) return
    const prevText = node.plainText
    const prevCursor = node.cursorOffset
    suppressing.add(node)
    try {
      node.setText(value)
      node.cursorOffset = prevCursor >= prevText.length
        ? value.length
        : Math.min(prevCursor, value.length)
    } finally {
      suppressing.delete(node)
    }
  }

  const writeSelectIndex = (
    node: OT.SelectRenderable,
    index: number
  ): void => {
    if (node.getSelectedIndex() === index) return
    suppressing.add(node)
    try {
      node.setSelectedIndex(index)
    } finally {
      suppressing.delete(node)
    }
  }

  const revertNode = (node: OT.BaseRenderable): boolean => {
    if (node instanceof OT.Renderable && node.isDestroyed) return false
    const map = wanted.get(node)
    if (map === undefined) return false
    if (node instanceof OT.InputRenderable && map.has("value")) {
      const expected = String(map.get("value") ?? "")
      if (node.value !== expected) {
        writeInputValue(node, expected)
        return true
      }
    } else if (node instanceof OT.TextareaRenderable && map.has("value")) {
      const expected = String(map.get("value") ?? "")
      if (node.plainText !== expected) {
        writeTextareaValue(node, expected)
        return true
      }
    } else if (
      node instanceof OT.SelectRenderable && map.has("selectedIndex")
    ) {
      const expected = Number(map.get("selectedIndex") ?? 0)
      if (node.getSelectedIndex() !== expected) {
        writeSelectIndex(node, expected)
        return true
      }
    }
    return false
  }

  const flushReverts = (): void => {
    revertScheduled = false
    let changed = false
    for (const node of pendingRevert) {
      if (revertNode(node)) changed = true
    }
    pendingRevert.clear()
    if (changed && !renderer.isDestroyed) renderer.requestRender()
  }

  const scheduleRevert = (node: OT.BaseRenderable): void => {
    pendingRevert.add(node)
    if (!revertScheduled) {
      revertScheduled = true
      queueMicrotask(flushReverts)
    }
  }

  const fire = (
    node: OT.BaseRenderable,
    name: string,
    payload: unknown,
    onMessage?: (() => void) | undefined
  ): boolean => {
    const entry = events.get(node)
    if (entry === undefined) return false
    const handler = entry.handlers[name]
    if (handler === undefined) return false
    return entry.dispatch(name, handler, payload, onMessage)
  }

  const ensureControlledListener = (node: OT.BaseRenderable): void => {
    if (controlledWired.has(node)) return
    controlledWired.add(node)
    if (node instanceof OT.InputRenderable) {
      node.on(OT.InputRenderableEvents.INPUT, (value: string) => {
        if (suppressing.has(node)) return
        const handled = fire(node, "input", { value: value ?? node.value })
        if (wanted.get(node)?.has("value")) {
          if (!handled) {
            if (revertNode(node) && !renderer.isDestroyed) {
              renderer.requestRender()
            }
          } else {
            scheduleRevert(node)
          }
        }
      })
    } else if (node instanceof OT.TextareaRenderable) {
      node.onContentChange = () => {
        if (suppressing.has(node)) return
        const handled = fire(node, "input", { value: node.plainText })
        if (wanted.get(node)?.has("value")) {
          if (!handled) {
            if (revertNode(node) && !renderer.isDestroyed) {
              renderer.requestRender()
            }
          } else {
            scheduleRevert(node)
          }
        }
      }
    } else if (node instanceof OT.SelectRenderable) {
      node.on(
        OT.SelectRenderableEvents.SELECTION_CHANGED,
        (index: number, option: OT.SelectOption | null) => {
          if (suppressing.has(node)) return
          const handled = fire(node, "selectionChanged", {
            index,
            option: option ?? null
          })
          if (wanted.get(node)?.has("selectedIndex")) {
            if (!handled) {
              if (revertNode(node) && !renderer.isDestroyed) {
                renderer.requestRender()
              }
            } else {
              scheduleRevert(node)
            }
          }
        }
      )
    }
  }

  const wantedMapOf = (node: OT.BaseRenderable): Map<string, unknown> => {
    let map = wanted.get(node)
    if (map === undefined) {
      map = new Map()
      wanted.set(node, map)
    }
    return map
  }

  const detachFromContainer = (node: HostNode): void => {
    const container = containerParent.get(node)
    if (container === undefined) return
    const index = container.children.indexOf(node)
    if (index >= 0) container.children.splice(index, 1)
    containerParent.delete(node)
  }

  return {
    createElement(tag) {
      if (tag === "br") {
        return OT.TextNodeRenderable.fromString("\n", { id: `br-${nextId++}` })
      }
      if (tag in textTagAttributes) {
        const attr = textTagAttributes[tag]!
        const node = new OT.TextNodeRenderable({
          id: `${tag}-${nextId++}`,
          attributes: attr
        })
        baseAttributes.set(node, attr)
        return node
      }
      const Ctor = catalogue[tag]
      if (Ctor === undefined) {
        throw new Error(`Unknown OpenTUI tag: <${tag}>`)
      }
      return new Ctor(renderCtx, { id: `${tag}-${nextId++}` })
    },

    createText(text) {
      const node = OT.TextNodeRenderable.fromString(text, {
        id: `t-${nextId++}`
      })
      const slot = new Slot(node)
      slots.set(node, slot)
      return slot
    },

    setText(node, text) {
      if (node instanceof Slot) {
        node.text.children = [text]
      }
    },

    setAttr(node, name, value) {
      if (node instanceof Slot || node instanceof Container) return
      ;(node as unknown as Record<string, unknown>)[name] = value
    },

    setProp(node, name, value) {
      if (node instanceof Slot || node instanceof Container) return
      if (name === "focused") {
        if (!(node instanceof OT.Renderable)) return
        wantedMapOf(node).set("focused", Boolean(value))
        pendingFocus.add(node)
        return
      }
      if (name === "value") {
        if (node instanceof OT.InputRenderable) {
          ensureControlledListener(node)
          if (value === undefined) {
            wanted.get(node)?.delete("value")
            return
          }
          const str = String(value)
          wantedMapOf(node).set("value", str)
          writeInputValue(node, str)
          return
        }
        if (node instanceof OT.TextareaRenderable) {
          ensureControlledListener(node)
          if (value === undefined) {
            wanted.get(node)?.delete("value")
            return
          }
          const str = String(value)
          wantedMapOf(node).set("value", str)
          writeTextareaValue(node, str)
          return
        }
      }
      if (name === "selectedIndex" && node instanceof OT.SelectRenderable) {
        ensureControlledListener(node)
        if (value === undefined) {
          wanted.get(node)?.delete("selectedIndex")
          return
        }
        const index = Number(value)
        wantedMapOf(node).set("selectedIndex", index)
        writeSelectIndex(node, index)
        return
      }
      let prevMap = lastProps.get(node)
      if (prevMap === undefined) {
        prevMap = new Map()
        lastProps.set(node, prevMap)
      }
      const prev = prevMap.get(name)
      if (prevMap.has(name) && deepEqual(prev, value)) return
      prevMap.set(name, value)
      if (name === "attributes" && OT.isTextNodeRenderable(node)) {
        const base = baseAttributes.get(node) ?? OT.TextAttributes.NONE
        node.attributes = base | (typeof value === "number" ? value : 0)
        return
      }
      const nextValue = value === undefined
        ? resetDefault(node, name, baseAttributes)
        : value
      ;(node as unknown as Record<string, unknown>)[name] = nextValue
    },

    insertBefore(parent, node, ref) {
      detached.delete(node)
      detachFromContainer(node)
      if (parent instanceof Container) {
        const child = real(node)
        realParent(child)?.remove(child)
        if (node instanceof Slot) node.parent = parent
        containerParent.set(node, parent)
        const index = ref === undefined ? -1 : parent.children.indexOf(ref)
        if (index < 0) parent.children.push(node)
        else parent.children.splice(index, 0, node)
        return
      }
      if (node instanceof Slot) node.parent = parent
      const child = real(node, parent)
      const target = parent as OT.BaseRenderable
      if (ref === undefined) target.add(child)
      else target.insertBefore(child, real(ref, parent))
    },

    remove(node) {
      if (containerParent.has(node)) {
        detachFromContainer(node)
        if (node instanceof Slot) node.parent = undefined
        detached.add(node)
        return
      }
      const child = real(node)
      realParent(child)?.remove(child)
      if (node instanceof Slot) node.parent = undefined
      detached.add(node)
    },

    parentOf(node) {
      const container = containerParent.get(node)
      if (container !== undefined) return container
      if (node instanceof Slot) return node.parent
      if (node instanceof Container) return undefined
      return realParent(node)
    },

    nextOf(node) {
      const container = containerParent.get(node)
      if (container !== undefined) {
        const index = container.children.indexOf(node)
        return index >= 0 ? container.children[index + 1] : undefined
      }
      if (node instanceof Container) return undefined
      const child = real(node)
      const parent = realParent(child)
      if (parent === undefined) return undefined
      const siblings = childrenOf(parent)
      const index = siblings.indexOf(child)
      if (index < 0) return undefined
      const next = siblings[index + 1]
      return next === undefined ? undefined : wrap(next)
    },

    setEvents(node, handlers, dispatch, eventOptions) {
      if (node instanceof Slot || node instanceof Container) return
      let entry = events.get(node)
      if (entry === undefined) {
        entry = {
          handlers,
          options: eventOptions,
          dispatch,
          wired: new Set()
        }
        events.set(node, entry)
      } else {
        entry.handlers = handlers
        entry.options = eventOptions
        entry.dispatch = dispatch
      }
      for (const name of Object.keys(handlers)) {
        if (entry.wired.has(name)) continue
        entry.wired.add(name)
        if (name in mouseEventProps) {
          const prop = mouseEventProps[name]!
          ;(node as unknown as Record<string, unknown>)[prop] = (
            event: OT.MouseEvent
          ) => {
            const current = events.get(node)
            const handler = current?.handlers[name]
            if (handler === undefined) return
            // Renderer.Host contract: only the innermost element with a handler receives an event.
            event.stopPropagation()
            const opt = current!.options[name]
            if (opt?.preventDefault === "always") event.preventDefault()
            current!.dispatch(
              name,
              handler,
              mousePayloadOf(event),
              opt?.preventDefault === true
                ? () => event.preventDefault()
                : undefined
            )
          }
        } else if (name === "keydown") {
          ;(node as OT.Renderable).onKeyDown = (key: OT.KeyEvent) => {
            const current = events.get(node)
            const handler = current?.handlers[name]
            if (handler === undefined) return
            key.stopPropagation()
            const opt = current!.options[name]
            if (opt?.preventDefault === "always") key.preventDefault()
            current!.dispatch(
              name,
              handler,
              keyPayloadOf(key, renderer),
              opt?.preventDefault === true
                ? () => key.preventDefault()
                : undefined
            )
          }
        } else if (name === "paste") {
          ;(node as OT.Renderable).onPaste = (paste: OT.PasteEvent) => {
            const current = events.get(node)
            const handler = current?.handlers[name]
            if (handler === undefined) return
            paste.stopPropagation()
            const opt = current!.options[name]
            if (opt?.preventDefault === "always") paste.preventDefault()
            current!.dispatch(
              name,
              handler,
              pastePayloadOf(paste),
              opt?.preventDefault === true
                ? () => paste.preventDefault()
                : undefined
            )
          }
        } else if (name === "focus") {
          node.on(OT.RenderableEvents.FOCUSED, () => {
            fire(node, "focus", {})
          })
        } else if (name === "blur") {
          node.on(OT.RenderableEvents.BLURRED, () => {
            fire(node, "blur", {})
          })
        } else if (name === "input" || name === "selectionChanged") {
          ensureControlledListener(node)
        } else if (name === "change" || name === "enter") {
          node.on(name, (value?: string) => {
            if (suppressing.has(node)) return
            fire(node, name, {
              value: value ??
                (node instanceof OT.InputRenderable ? node.value : "")
            })
          })
        } else if (name === "submit" && node instanceof OT.TextareaRenderable) {
          node.onSubmit = () => {
            fire(node, "submit", { value: node.plainText })
          }
        } else if (name === "itemSelected") {
          node.on(
            OT.SelectRenderableEvents.ITEM_SELECTED,
            (index: number, option: OT.SelectOption | null) => {
              fire(node, "itemSelected", { index, option: option ?? null })
            }
          )
        }
      }
    },

    elements: [OpenTui.name],
    controlled: controlledProps,
    runsMounts: true,

    createContainer() {
      const container = new Container()
      containerRegistry.register(container, container.children)
      return container
    },

    commit() {
      for (const node of detached) {
        if (containerParent.has(node)) continue
        const child = real(node)
        if (realParent(child) === undefined) destroyHostNode(node)
      }
      detached.clear()
      for (const node of pendingFocus) {
        if (node.isDestroyed) continue
        if (wanted.get(node)?.get("focused") === false && node.focused) {
          node.blur()
        }
      }
      for (const node of pendingFocus) {
        if (node.isDestroyed) continue
        if (
          wanted.get(node)?.get("focused") === true &&
          !node.focused &&
          isAttachedToLiveTree(node)
        ) {
          node.focus()
        }
      }
      pendingFocus.clear()
      if (!renderer.isDestroyed) renderer.requestRender()
    },

    head(head) {
      const title = (head as { readonly title?: string | undefined } | undefined)
        ?.title
      if (title !== undefined && title !== lastTitle) {
        lastTitle = title
        if (options?.onTitle !== undefined) options.onTitle(title)
        else if (!renderer.isDestroyed) renderer.setTerminalTitle(title)
      }
    }
  }
}

/**
 * Provides `Renderer.Renderer`, `OpenTui.Host`, and
 * `OpenTuiSubscription.GlobalEvents` for an existing `CliRenderer`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layerFromRenderer = (
  renderer: OT.CliRenderer,
  options?: MakeHostOptions | undefined
): Layer.Layer<Renderer.Renderer | OpenTui.Host> =>
  Layer.succeedContext(
    Context.make(Renderer.Renderer, { host: makeHost(renderer, options) })
      .pipe(
        Context.add(OpenTui.Host, makeHostService(renderer)),
        Context.add(
          OpenTuiSubscription.GlobalEvents,
          makeGlobalEvents(renderer)
        )
      )
  )

/**
 * Creates and owns a `CliRenderer` for the life of the Layer, providing
 * `Renderer.Renderer`, `OpenTui.Host`, and `OpenTuiSubscription.GlobalEvents`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = (
  config?: LayerConfig | undefined
): Layer.Layer<Renderer.Renderer | OpenTui.Host> =>
  Layer.effectContext(
    Effect.gen(function*() {
      const { renderables, ...rendererConfig } = config ?? {}
      const renderer = yield* Effect.acquireRelease(
        Effect.promise(() => OT.createCliRenderer(rendererConfig)),
        (r) =>
          Effect.promise(async () => {
            if (!r.isDestroyed) r.destroy()
            await r.closed
          })
      )
      return Context.make(Renderer.Renderer, {
        host: makeHost(renderer, { renderables })
      }).pipe(
        Context.add(OpenTui.Host, makeHostService(renderer)),
        Context.add(
          OpenTuiSubscription.GlobalEvents,
          makeGlobalEvents(renderer)
        )
      )
    })
  )

/**
 * Mounts an OpenTUI component tree onto a `CliRenderer` owned for the life of
 * the current Scope, returning its `Renderer.Root`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const mountEffect = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component:
    & Component.Members<Name, Props, Model, Msg, Events, R, V, any>
    & OpenTuiRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  options?: MountOptions<V, RF> | undefined
): Effect.Effect<
  Renderer.Root<Model, Msg>,
  never,
  Exclude<R | RF | RP, OpenTui.Host> | Scope.Scope
> =>
  Effect.gen(function*() {
    const { renderables, ...rendererConfig } = options?.renderer ?? {}
    const renderer = yield* Effect.acquireRelease(
      Effect.promise(() => OT.createCliRenderer(rendererConfig)),
      (r) =>
        Effect.promise(async () => {
          if (!r.isDestroyed) r.destroy()
          await r.closed
        })
    )
    const hostContext = Context.make(Renderer.Renderer, {
      host: makeHost(renderer, { renderables })
    }).pipe(
      Context.add(OpenTui.Host, makeHostService(renderer)),
      Context.add(OpenTuiSubscription.GlobalEvents, makeGlobalEvents(renderer))
    )
    const outer = yield* Effect.context<Scope.Scope>()
    return yield* Effect.provideContext(
      Renderer.mount(component as any, props as any, renderer.root, options),
      Context.merge(outer, hostContext)
    )
  }) as any

/**
 * A Layer that creates a `CliRenderer` and mounts `component` for as long as
 * the Layer is alive.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const mount = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component:
    & Component.Members<Name, Props, Model, Msg, Events, R, V, any>
    & OpenTuiRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  options?: MountOptions<V, RF> | undefined
): Layer.Layer<never, never, Exclude<R | RF | RP, OpenTui.Host>> =>
  Layer.effectDiscard(mountEffect(component, props, options)) as any

/**
 * Runs an OpenTUI application until the terminal renderer is destroyed (via
 * Ctrl+C, an exit signal, or `OpenTuiCommand.quit()`), then closes its Scope.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const run = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component:
    & Component.Members<Name, Props, Model, Msg, Events, R, V, any>
    & OpenTuiRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  options?: MountOptions<V, RF> | undefined
): Effect.Effect<void, never, Exclude<R | RF | RP, OpenTui.Host>> =>
  Effect.scoped(
    Effect.gen(function*() {
      const { renderables, ...rendererConfig } = options?.renderer ?? {}
      const done = yield* Deferred.make<void>()
      const renderer = yield* Effect.acquireRelease(
        Effect.promise(() =>
          OT.createCliRenderer({
            ...rendererConfig,
            onDestroy: () => {
              rendererConfig.onDestroy?.()
              Deferred.doneUnsafe(done, Exit.void)
            }
          })
        ),
        (r) =>
          Effect.promise(async () => {
            if (!r.isDestroyed) r.destroy()
            await r.closed
          })
      )
      const hostContext = Context.make(Renderer.Renderer, {
        host: makeHost(renderer, { renderables })
      }).pipe(
        Context.add(OpenTui.Host, makeHostService(renderer)),
        Context.add(
          OpenTuiSubscription.GlobalEvents,
          makeGlobalEvents(renderer)
        )
      )
      const outer = yield* Effect.context<Scope.Scope>()
      yield* Effect.provideContext(
        Renderer.mount(component as any, props as any, renderer.root, options),
        Context.merge(outer, hostContext)
      )
      if (!renderer.isDestroyed) {
        yield* Deferred.await(done)
      }
    })
  ) as any
