/**
 * Hydration: mounts a component tree over the HTML `HtmlServer.renderToHtml`
 * rendered of it, adopting the server's nodes and the Model each instance
 * rendered with. An app that mounts with `BrowserHost.mount` doesn't carry it.
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import type * as Component from "../Component.ts"
import * as hydrateRun from "../internal/hydrateRun.ts"
import type * as Kernel from "../internal/kernel.ts"
import type * as Renderer from "../Renderer.ts"
import type * as View from "../View.ts"
import * as BrowserHost from "./BrowserHost.ts"
import type * as Html from "./Html.ts"
import { attributeName } from "./internal/elements.ts"
import * as markers from "./internal/markers.ts"

const SVG = "http://www.w3.org/2000/svg"
const ELEMENT = 1
const COMMENT = 8

const markerOf = (node: Node) =>
  node.nodeType === COMMENT ? markers.parse((node as Comment).data) : undefined

const isOpen = (node: Node, path: string): boolean => {
  const marker = markerOf(node)
  return marker?._tag === "Open" && marker.path === path
}

const closeOf = (open: Node, path: string): Node | null => {
  let close = open.nextSibling
  while (close !== null) {
    const marker = markerOf(close)
    if (marker?._tag === "Close" && marker.path === path) return close
    close = close.nextSibling
  }
  return null
}

const isText = (node: Node): boolean => node.nodeType === 3

let wantedTag = ""

const isWanted = (node: Node): boolean =>
  node.nodeType === ELEMENT && (node as Element).localName === wantedTag

const emptyValue = (name: string): unknown => name === "value" ? "" : false

/** Input types whose `change` the browser fires when the field loses focus, not when the value changes. */
const changeOnBlur: ReadonlySet<string> = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number"
])

const isRadio = (node: Node): node is HTMLInputElement =>
  (node as Element).localName === "input" &&
  (node as HTMLInputElement).type === "radio"

const radioGroup = (radio: HTMLInputElement): ReadonlyArray<HTMLInputElement> =>
  radio.name === ""
    ? [radio]
    : Array.from(
      (radio.getRootNode() as Document).querySelectorAll<HTMLInputElement>(
        `input[type="radio"]`
      )
    ).filter((other) => other.name === radio.name && other.form === radio.form)

/** The property the user changes on `node`, if it's a control. */
const userProp = (node: Node): string | undefined => {
  switch ((node as Element).localName) {
    case "input": {
      const type = (node as HTMLInputElement).type
      return type === "checkbox" || type === "radio" ? "checked" : "value"
    }
    case "textarea":
    case "select":
      return "value"
    case "option":
      return "selected"
  }
}

const optionDisabled = (option: HTMLOptionElement): boolean =>
  option.disabled ||
  (option.parentElement?.localName === "optgroup" &&
    option.parentElement.hasAttribute("disabled"))

const selectionChanged = (select: HTMLSelectElement): boolean => {
  const options = Array.from(select.options)
  const marked = options.map((option) => option.hasAttribute("selected"))
  if (select.multiple) {
    return options.some((option, i) => option.selected !== marked[i])
  }
  const last = marked.lastIndexOf(true)
  const index = last !== -1
    ? last
    : select.size > 1
    ? -1
    : options.findIndex((option) => !optionDisabled(option))
  return options.some((option, i) => option.selected !== (i === index))
}

/** The control an option's change is reported on and held for: its `select`, if it has one. */
const controlOf = (node: Node): Element =>
  (node as Element).localName === "option"
    ? (node as Element).closest("select") ?? (node as Element)
    : node as Element

class Edits {
  readonly adopted = new WeakSet<Node>()
  readonly defaults = new WeakMap<Node, string>()
  readonly edited = new Set<Element>()
  readonly changedBefore = new Map<Node, boolean>()
  take(node: Node, tag: string): void {
    if (
      tag !== "input" && tag !== "textarea" && tag !== "select" &&
      tag !== "option"
    ) return
    this.adopted.add(node)
    if (tag === "textarea") {
      this.defaults.set(node, (node as HTMLTextAreaElement).defaultValue)
      this.changedBefore.set(node, this.changed(node as Element))
    }
  }
  changed(control: Element): boolean {
    switch (control.localName) {
      case "input":
      case "textarea": {
        const field = control as HTMLInputElement
        return userProp(field) === "checked"
          ? field.checked !== field.defaultChecked
          : field.value !== (this.defaults.get(field) ?? field.defaultValue)
      }
      case "select":
        return selectionChanged(control as HTMLSelectElement)
      default:
        return false
    }
  }
  wasChanged(control: Element): boolean {
    let changed = this.changedBefore.get(control)
    if (changed === undefined) {
      const group = isRadio(control) ? radioGroup(control) : [control]
      changed = group.some((member) => this.changed(member))
      for (const member of group) this.changedBefore.set(member, changed)
    }
    return changed
  }
  keeps(node: Node, name: string, value: unknown): boolean {
    if (name !== userProp(node)) return false
    const control = controlOf(node)
    if (
      !this.edited.has(control) && this.adopted.has(control) &&
      this.wasChanged(control) &&
      (node as any)[name] !== (value === undefined ? emptyValue(name) : value)
    ) this.edited.add(control)
    return this.edited.has(control)
  }
  report(): void {
    this.changedBefore.clear()
    const controls = Array.from(this.edited)
    this.edited.clear()
    for (const control of controls) {
      const field = control as HTMLInputElement
      if (!field.isConnected || (isRadio(field) && !field.checked)) continue
      field.dispatchEvent(new Event("input", { bubbles: true }))
      // A focused text field gets no `change`: the browser fires it when focus leaves.
      const typing = field.localName === "textarea" ||
        (field.localName === "input" && changeOnBlur.has(field.type))
      if (!typing || field.ownerDocument.activeElement !== field) {
        field.dispatchEvent(new Event("change", { bubbles: true }))
      }
    }
  }
}

const keeping = (
  node: Node,
  name: string,
  value: unknown,
  write: () => void
) => {
  Object.defineProperty(node, name, {
    value: value === undefined ? emptyValue(name) : value,
    configurable: true
  })
  try {
    write()
  } finally {
    delete (node as any)[name]
  }
}

interface Opened {
  readonly path: string
  readonly open: Node
}

interface Held {
  readonly first: Node
  readonly last: Node
}

const between = (
  base: Kernel.Host<Node>,
  container: Node,
  start: Node | null,
  end: Node | null,
  edges: ReadonlyArray<Node>,
  holds: Map<Node, Held>,
  edits: Edits
): hydrateRun.Adopting<Node> => {
  let at = start
  let parent = container
  const ranges: Array<Opened> = []
  const passed: Array<Node> = [...edges]
  const span: Array<Node> = []
  for (
    let node = start;
    node !== null && node !== end;
    node = node.nextSibling
  ) span.push(node)
  const last = new WeakMap<Node, Node>()
  if (edges.length > 0) last.set(container, edges[0]!)
  const written = new WeakMap<Node, Array<string>>()
  const fresh = new WeakSet<Node>()
  const taken = new WeakSet<Node>()
  const kept = new WeakSet<Node>()
  let freshDepth = 0
  let holding: Held | undefined
  let bare: Node | undefined
  const missed = new WeakSet<Node>()
  let missing = false
  const ours = new WeakSet<Node>()
  let made = false
  let propped: Node | undefined

  const scopeOf = (node: Node): Node => {
    const list = node.parentNode!
    const range = ranges[ranges.length - 1]
    return range !== undefined && range.open.parentNode === list
      ? range.open
      : list
  }

  const pass = (node: Node): void => {
    const marker = markerOf(node)
    if (marker?._tag === "Open") ranges.push({ path: marker.path, open: node })
    else if (marker !== undefined) ranges.pop()
    passed.push(node)
  }

  const next = (): Node | null => {
    for (;;) {
      if (at === null) {
        if (parent === container) return null
        while (
          ranges.length > 0 && parent.contains(ranges[ranges.length - 1]!.open)
        ) ranges.pop()
        at = parent.nextSibling
        parent = parent.parentNode!
      } else if (at === end) {
        return null
      } else if (at.nodeType === COMMENT) {
        pass(at)
        at = at.nextSibling
      } else if (made && ours.has(at)) {
        at = at.nextSibling
      } else {
        return at
      }
    }
  }

  const resync = (
    first: Node,
    matches: (node: Node) => boolean
  ): Node | null => {
    const list = first.parentNode!
    let from = first
    for (
      let index = ranges.length - 1;
      index >= 0 && ranges[index]!.open.parentNode === list;
      index--
    ) {
      const close = closeOf(from, ranges[index]!.path)
      if (close === null) return null
      let candidate = close.nextSibling
      while (
        candidate !== null && candidate !== end &&
        candidate.nodeType === COMMENT
      ) {
        candidate = candidate.nextSibling
      }
      if (candidate === null || candidate === end) return null
      if (matches(candidate)) {
        let resume: Node | null = null
        for (let node: Node = first; node !== candidate;) {
          const following = node.nextSibling!
          if (node.nodeType === COMMENT) resume ??= node
          else list.removeChild(node)
          node = following
        }
        if (at === first) at = resume ?? candidate
        return candidate
      }
      from = close
    }
    return null
  }

  const drop = (node: Node): void => {
    at = node.nextSibling
    node.parentNode!.removeChild(node)
  }

  const take = (matches: (node: Node) => boolean): Node | null => {
    if (freshDepth > 0) return null
    let node = next()
    if (node === null) return null
    if (node === bare) {
      bare = undefined
      if (!matches(node)) {
        drop(node)
        return null
      }
      if (parent === container) taken.add(node)
      return node
    }
    if ((missing && missed.has(scopeOf(node))) || !matches(node)) {
      const scope = scopeOf(node)
      node = resync(node, matches)
      if (node === null) {
        missed.add(scope)
        missing = true
        return null
      }
      next()
    }
    if (parent === container) taken.add(node)
    return node
  }

  const complete = (element: Element, names: Array<string>): void => {
    written.delete(element)
    const inside = parent === element || element.contains(parent)
    const previous = last.get(element)
    for (
      let node = previous === undefined
        ? element.firstChild
        : previous.nextSibling;
      node !== null;
    ) {
      const following = node.nextSibling
      element.removeChild(node)
      node = following
    }
    if (propped === element || element.attributes.length !== names.length) {
      for (const name of element.getAttributeNames()) {
        if (!names.includes(name)) element.removeAttribute(name)
      }
    }
    if (inside) {
      while (
        ranges.length > 0 && element.contains(ranges[ranges.length - 1]!.open)
      ) ranges.pop()
      at = element.nextSibling
      parent = element.parentNode!
    }
  }

  const host: Kernel.Host<Node> = {
    ...base,
    createElement(tag) {
      wantedTag = tag
      const node = take(isWanted)
      if (node === null) {
        const element = base.createElement(tag)
        fresh.add(element)
        ours.add(element)
        made = true
        freshDepth++
        return element
      }
      written.set(node, [])
      edits.take(node, tag)
      parent = node
      at = node.firstChild
      return node
    },
    createText(text) {
      if (text === "" && holding !== undefined) {
        const node = base.createText(text)
        holds.set(node, holding)
        ours.add(node)
        made = true
        holding = undefined
        return node
      }
      if (bare !== undefined && next() === bare) drop(bare)
      bare = undefined
      const node = text === "" ? null : take(isText) as Text | null
      if (node === null) {
        const fresh = base.createText(text)
        ours.add(fresh)
        made = true
        return fresh
      }
      const data = node.data
      if (data !== text) {
        if (!data.startsWith(text)) {
          drop(node)
          const fresh = base.createText(text)
          ours.add(fresh)
          made = true
          return fresh
        }
        node.splitText(text.length)
      }
      at = node.nextSibling
      return node
    },
    setAttr(node, name, value) {
      const names = written.get(node)
      if (names !== undefined) {
        const element = node as Element
        const normalized = attributeName(name, element.namespaceURI === SVG)
        if (normalized === undefined) return
        if (value !== undefined) names.push(normalized)
        const served = element.getAttribute(normalized)
        if (value === undefined ? served === null : served === value) return
        return base.setAttr(node, name, value, served ?? undefined)
      }
      base.setAttr(node, name, value)
    },
    setProp(node, name, value) {
      const names = written.get(node)
      if (names !== undefined) {
        names.push(name.toLowerCase())
        propped = node
      }
      if (edits.keeps(node, name, value)) {
        return keeping(node, name, value, () => base.setProp(node, name, value))
      }
      if (
        names !== undefined && (node as any)[name] === value &&
        base.controlled?.has(name) !== true
      ) return
      base.setProp(node, name, value)
    },
    made(node) {
      if (fresh.delete(node)) freshDepth--
    },
    insert(into, node, before) {
      if (before !== null) return base.insert(into, node, before)
      const held = holds.get(node)
      if (held !== undefined && held.first.parentNode === into) {
        into.insertBefore(node, held.first)
        last.set(into, held.last)
        return
      }
      const previous = last.get(into)
      let ref = previous === undefined ? into.firstChild : previous.nextSibling
      while (ref !== null && ref !== end && ref.nodeType === COMMENT) {
        if (!kept.has(ref)) passed.push(ref)
        ref = ref.nextSibling
      }
      if (ref !== node) into.insertBefore(node, ref)
      last.set(into, node)
      const names = written.get(node)
      if (names !== undefined) complete(node as Element, names)
    }
  }

  return {
    host,
    child(path, served) {
      bare = undefined
      if (freshDepth > 0) return
      let node = at
      while (node !== null && node !== end && node.nodeType === COMMENT) {
        if (isOpen(node, path)) return
        node = node.nextSibling
      }
      if (node === null || node === end || node.nodeType !== ELEMENT) return
      for (
        let after = node.nextSibling;
        after !== null && after.nodeType === COMMENT;
        after = after.nextSibling
      ) if (isOpen(after, path)) return
      if (!served) {
        missed.add(scopeOf(node))
        missing = true
      } else if (!missing || !missed.has(scopeOf(node))) bare = node
    },
    has(path) {
      for (
        let node = freshDepth > 0 ? null : at;
        node !== null && node !== end && node.nodeType === COMMENT;
        node = node.nextSibling
      ) if (isOpen(node, path)) return true
      return false
    },
    hold(path) {
      holding = undefined
      if (freshDepth > 0) return
      while (
        at !== null && at !== end && at.nodeType === COMMENT &&
        !isOpen(at, path)
      ) {
        pass(at)
        at = at.nextSibling
      }
      if (at === null || at === end) return
      const close = at.nodeType === COMMENT
        ? closeOf(at, path)
        : at.nodeType === ELEMENT
        ? at
        : null
      if (close === null) return
      holding = { first: at, last: close }
      for (
        let node: Node | null = at;
        node !== null;
        node = node === close ? null : node.nextSibling
      ) kept.add(node)
      at = close.nextSibling
    },
    done() {
      for (const node of span) {
        if (!taken.has(node) && !kept.has(node)) {
          node.parentNode?.removeChild(node)
        }
      }
      for (const node of passed) node.parentNode?.removeChild(node)
      edits.report()
    }
  }
}

/** @internal */
export const adopt: hydrateRun.Adopt<Node> = (base, container, path) => {
  const holds = new Map<Node, Held>()
  const edits = new Edits()
  let open = container.firstChild
  while (open !== null && !isOpen(open, path)) open = open.nextSibling
  const close = open === null ? null : closeOf(open, path)
  return {
    root: open === null || close === null
      ? undefined
      : between(
        base,
        container,
        open.nextSibling,
        close,
        [open, close],
        holds,
        edits
      ),
    resume(placeholder) {
      const held = holds.get(placeholder)
      if (held === undefined) return undefined
      holds.delete(placeholder)
      const list = held.first.parentNode
      if (list === null) return undefined
      return held.first === held.last
        ? between(
          base,
          list,
          held.first,
          held.last.nextSibling,
          [],
          holds,
          edits
        )
        : between(
          base,
          list,
          held.first.nextSibling,
          held.last,
          [
            held.first,
            held.last
          ],
          holds,
          edits
        )
    },
    live(nodes) {
      for (const [node, rec] of nodes) {
        const name = userProp(node)
        if (name === undefined || !edits.adopted.has(node)) continue
        edits.keeps(node, name, (rec.v as View.Element<any, any>).props[name])
      }
      edits.report()
    }
  }
}

/**
 * Mounts a component tree over the HTML `HtmlServer.renderToHtml` rendered of
 * it in `container`, for the life of the current Scope, and returns its root.
 *
 * **When to use**
 *
 * Use when the caller needs the root: to read its Model, send it a message,
 * or wait for `root.adopted`, which completes when no hydrating instance is
 * still waiting. `hydrate` is the form that runs an app.
 *
 * **Details**
 *
 * It mounts, checks the root and hydrates exactly as `hydrate` does.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const hydrateEffect = <
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
    & BrowserHost.HtmlRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  container: globalThis.Element,
  state: Renderer.State,
  options?: BrowserHost.MountOptions<V, RF>
): Effect.Effect<
  Renderer.Root<Model, Msg>,
  never,
  Exclude<R | RF | RP, Html.Host> | Scope.Scope
> =>
  BrowserHost.mountRoot(
    component as unknown as Component.Any,
    props,
    container,
    options,
    hydrateRun.hydrating(state, adopt)
  ) as any

/**
 * A Layer that mounts a component tree over the HTML
 * `HtmlServer.renderToHtml` rendered of it in `container`, for as long as
 * the Layer is built. It provides no service: launch it with
 * `Layer.launch`, or merge it into the app's Layer.
 *
 * **When to use**
 *
 * Use to run a server-rendered app in the browser, in place of
 * `BrowserHost.mount`. Reach for `hydrateEffect` when the caller needs the
 * root, to send it messages or to wait for `root.adopted`.
 *
 * **Details**
 *
 * Pass the `state` from `HtmlServer.renderToHtml`, with the server's HTML
 * already in `container` and the same props, to adopt the server's nodes
 * instead of building them. `Router.props` gives the same props on both
 * sides when both Routers are at the same URL. Everything else, the options
 * included, is as `BrowserHost.mount`.
 *
 * Each instance adopts its server Model and replays `init` only to recover
 * its Commands; server Commands the Model already has the result of are
 * skipped, and those that missed the budget run now. `onMount` fires on
 * adoption. Where an instance's view stops matching the server's nodes, the
 * nodes before stay adopted and the rest is built fresh, and an instance the
 * server deferred is built fresh. An instance whose state decodes only
 * asynchronously keeps the server's nodes until it has.
 *
 * An instance the server rendered with its provided Layer ready, whose
 * Layer is still building here, keeps the server's nodes until the Layer is
 * ready, and everything else is live at once. Its `LayerPending` entry says
 * `Awaiting`. One whose Layer was pending or failed on the server adopts at
 * once, and its feature slots keep the server's `fallback` nodes while their
 * status is the one the server shipped. A waiting instance is inert: its
 * buttons do nothing, links still navigate through the Router, and a
 * `<form>` submits natively. What the user types or picks in its fields
 * stays, and reaches the fields' `onInput` and `onChange` when it adopts.
 * Head sync starts once no instance is waiting.
 *
 * The cache hydrates from the state's `~query` entries. Until `adopted`
 * completes or the Router first navigates, a watch, `get` or `prefetch`
 * over a hydrated entry doesn't fetch, even when it is stale.
 *
 * **Example** (Hydrating a server-rendered app)
 *
 * ```ts
 * import { HtmlHydrate, Html } from "@effect/ui/html"
 * import { Effect, Layer, Schema } from "effect"
 * import { Component, Renderer } from "@effect/ui"
 *
 * const App = Component.define({
 *   name: "App",
 *   model: Schema.Struct({}),
 *   message: Schema.Never,
 *   elements: Html
 * }).make({
 *   init: () => ({}),
 *   update: ($) => $.model,
 *   view: (h) => h.h1("Hello")
 * })
 *
 * // The page embeds the state `HtmlServer.renderToHtml` returned.
 * declare const state: Renderer.State
 *
 * // In the browser entry module.
 * Effect.runFork(Layer.launch(HtmlHydrate.hydrate(App, {}, document.getElementById("app")!, state)))
 * ```
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const hydrate = <
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
    & BrowserHost.HtmlRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  container: globalThis.Element,
  state: Renderer.State,
  options?: BrowserHost.MountOptions<V, RF>
): Layer.Layer<never, never, Exclude<R | RF | RP, Html.Host>> =>
  Layer.effectDiscard(
    hydrateEffect(component, props, container, state, options)
  ) as any
