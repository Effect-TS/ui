/**
 * Spike: a `Renderer.Host` over React Native's Fabric UIManager binding
 * (`global.nativeFabricUIManager`), with no React.
 *
 * Fabric's shadow tree is persistent: a node is immutable once committed, and
 * changing it means cloning it and every ancestor. Our Host contract is a
 * mutable tree, so this host keeps a JS mirror (`FabricNode`) that the
 * renderer mutates, marks what changed, and at `commit` clones the changed
 * paths and calls `completeRoot` once. Shadow nodes are created lazily at
 * commit, so props set before the first commit cost nothing extra.
 *
 * Fabric diffs the committed tree in C++ and unmounts removed views itself, so
 * the host needs no destroy signal: a node the mirror drops is collected.
 */
import type * as Renderer from "@effect/ui/Renderer"
import type * as View from "@effect/ui/View"

/** The subset of `nativeFabricUIManager` the spike uses. */
export interface UIManager {
  createNode(
    tag: number,
    viewName: string,
    rootTag: number,
    props: object,
    instanceHandle: unknown
  ): unknown
  cloneNodeWithNewProps(node: unknown, props: object): unknown
  cloneNodeWithNewChildren(node: unknown): unknown
  cloneNodeWithNewChildrenAndProps(node: unknown, props: object): unknown
  appendChild(parent: unknown, child: unknown): unknown
  createChildSet(rootTag: number): unknown
  appendChildToSet(set: unknown, child: unknown): void
  completeRoot(rootTag: number, set: unknown): void
  registerEventHandler(
    handler: (instanceHandle: unknown, type: string, payload: unknown) => void
  ): void
}

export interface Platform {
  readonly OS: string
}

interface EventEntry {
  readonly handlers: Readonly<Record<string, View.Handler<unknown, any>>>
  readonly dispatch: Renderer.Dispatch
}

/** A node of the JS mirror. The renderer only ever sees these. */
export class FabricNode {
  parent: FabricNode | undefined = undefined
  first: FabricNode | undefined = undefined
  last: FabricNode | undefined = undefined
  prev: FabricNode | undefined = undefined
  next: FabricNode | undefined = undefined
  /** Props changed since the last commit, `null` for a removed one. */
  pending: Record<string, unknown> | undefined = undefined
  style: Readonly<Record<string, unknown>> | undefined = undefined
  /** The committed shadow node, or `undefined` before the first commit. */
  shadow: unknown = undefined
  /** This node or a descendant changed since the last commit. */
  dirty = true
  /** A child changed, or was inserted or removed, since the last commit. */
  kidsChanged = false
  /** A scroll view's content container: its only child, holding its children. */
  inner: FabricNode | undefined = undefined
  events: EventEntry | undefined = undefined
  readonly tag: string
  viewName: string
  reactTag: number
  /** Props of the shadow node, already in Fabric's flat form. */
  readonly props: Record<string, unknown>
  constructor(
    tag: string,
    viewName: string,
    reactTag: number,
    props: Record<string, unknown>
  ) {
    this.tag = tag
    this.viewName = viewName
    this.reactTag = reactTag
    this.props = props
  }
}

const colorProp = /(^c|C)olor$/

/**
 * Makes a host for the surface `rootTag`. `processColor` turns a CSS color
 * string into the integer Fabric parses.
 */
export const make = (options: {
  readonly ui: UIManager
  readonly rootTag: number
  readonly platform: Platform
  readonly processColor: (color: unknown) => unknown
  /** Called after every `commit`, whether or not anything changed. */
  readonly onCommit?: (() => void) | undefined
}): { readonly host: Renderer.Host<FabricNode>; readonly root: FabricNode } => {
  const { onCommit, platform, processColor, rootTag, ui } = options
  // React Native allocates even tags from 2, so ours never collide with surface ids.
  let nextTag = 2
  const node = (
    tag: string,
    viewName: string,
    props: Record<string, unknown> = {}
  ) => {
    const n = new FabricNode(tag, viewName, nextTag, props)
    nextTag += 2
    return n
  }
  const root = node("#root", "")
  const viewNames: Record<string, string> = {
    view: "RCTView",
    text: "RCTText",
    scroll: "RCTScrollView",
    input: platform.OS === "ios"
      ? "RCTSinglelineTextInputView"
      : "AndroidTextInput"
  }

  // Marks `n` changed, so that every ancestor is cloned with its children.
  const markDirty = (n: FabricNode | undefined) => {
    while (n !== undefined && !n.dirty) {
      n.dirty = true
      n = n.parent
      if (n !== undefined) n.kidsChanged = true
    }
  }

  // Fabric can't move a mounted view to another parent under the same tag:
  // the old parent's diff deletes the tag the new one creates, and the view
  // gets no more events. So a node that changes parent is made again, with
  // its subtree, under new tags, as React remounts it.
  const remount = (n: FabricNode) => {
    n.shadow = n.pending = undefined
    n.reactTag = nextTag
    nextTag += 2
    n.dirty = true
    n.kidsChanged = false
    for (let k = n.first; k; k = k.next) remount(k)
  }

  const setNative = (n: FabricNode, name: string, value: unknown) => {
    if (value !== undefined && colorProp.test(name)) value = processColor(value)
    if (n.props[name] === value) return
    if (value === undefined) delete n.props[name]
    else n.props[name] = value
    // A node not built yet takes its props at createNode.
    if (n.shadow !== undefined) {
      ;(n.pending ??= {})[name] = value === undefined ? null : value
    }
    markDirty(n)
  }

  // Builds the shadow node of `n`, cloning it only if it or a child changed.
  const build = (n: FabricNode): unknown => {
    if (!n.dirty) return n.shadow
    n.dirty = false
    const pending = n.pending
    n.pending = undefined
    let shadow: unknown
    if (n.shadow === undefined) {
      shadow = ui.createNode(n.reactTag, n.viewName, rootTag, n.props, n)
    } else if (n.kidsChanged) {
      shadow = pending === undefined
        ? ui.cloneNodeWithNewChildren(n.shadow)
        : ui.cloneNodeWithNewChildrenAndProps(n.shadow, pending)
    } else {
      if (pending !== undefined) {
        n.shadow = ui.cloneNodeWithNewProps(n.shadow, pending)
      }
      return n.shadow
    }
    n.kidsChanged = false
    for (let k = n.first; k; k = k.next) ui.appendChild(shadow, build(k))
    return n.shadow = shadow
  }

  const commit = () => {
    if (root.dirty) {
      root.dirty = false
      root.kidsChanged = false
      const set = ui.createChildSet(rootTag)
      for (let k = root.first; k; k = k.next) {
        ui.appendChildToSet(set, build(k))
      }
      ui.completeRoot(rootTag, set)
    }
    onCommit?.()
  }

  // Events: Fabric hands back the instance handle we gave createNode.
  const pathOf = (n: FabricNode | undefined) => {
    const path: Array<FabricNode> = []
    for (; n !== undefined; n = n.parent) path.push(n)
    return path
  }
  const fire = (
    path: ReadonlyArray<FabricNode>,
    name: string,
    payload: unknown
  ) => {
    for (const n of path) {
      const handler = n.events?.handlers[name]
      if (handler !== undefined) {
        return n.events!.dispatch(name, handler, payload)
      }
    }
    return false
  }
  let pressed: FabricNode | undefined
  ui.registerEventHandler((handle, type, payload) => {
    if (!(handle instanceof FabricNode)) return
    const path = pathOf(handle)
    const event = payload as any
    switch (type) {
      case "topTouchStart": {
        pressed = path.find((n) => n.events?.handlers.press !== undefined)
        return
      }
      case "topTouchCancel": {
        pressed = undefined
        return
      }
      case "topTouchEnd": {
        const target = pressed
        pressed = undefined
        if (target !== undefined && path.includes(target)) {
          const touch = event?.changedTouches?.[0]
          fire([target], "press", {
            x: touch?.pageX ?? 0,
            y: touch?.pageY ?? 0
          })
        }
        return
      }
      case "topChange": {
        fire(path, "input", { value: event?.text ?? "" })
        return
      }
      case "topScroll": {
        const offset = event?.contentOffset
        fire(path, "scroll", { x: offset?.x ?? 0, y: offset?.y ?? 0 })
        return
      }
    }
  })

  const host: Renderer.Host<FabricNode> = {
    elements: ["fabric-spike"],
    controlled: new Set(),
    runsMounts: true,
    createElement(tag) {
      const viewName = viewNames[tag]
      if (viewName === undefined) throw new Error(`Unknown element <${tag}>`)
      const n = node(tag, viewName)
      if (tag === "scroll") {
        const inner = node("#content", "RCTScrollContentView", {
          collapsable: false
        })
        inner.parent = n
        n.first = n.last = n.inner = inner
      }
      return n
    },
    createText(text) {
      return node("#text", "RCTRawText", { text })
    },
    setText(n, text) {
      setNative(n, "text", text)
    },
    setAttr(n, name, value) {
      setNative(n, name, value)
    },
    setProp(n, name, value) {
      if (name !== "style") return setNative(n, name, value)
      const next = (value ?? {}) as Readonly<Record<string, unknown>>
      const previous = n.style ?? {}
      n.style = next
      for (const key in previous) {
        if (!(key in next)) setNative(n, key, undefined)
      }
      for (const key in next) setNative(n, key, next[key])
    },
    insertBefore(parent, n, ref) {
      parent = parent.inner ?? parent
      if (n.parent !== parent) {
        if (n.shadow !== undefined) remount(n)
        // Text inside text is a span, which Fabric calls virtual text.
        if (n.tag === "text") {
          n.viewName = parent.tag === "text" ? "RCTVirtualText" : "RCTText"
        }
      }
      if (n.parent !== undefined) host.remove(n)
      const prev = ref === undefined ? parent.last : ref.prev
      n.parent = parent
      n.prev = prev
      n.next = ref
      if (prev === undefined) parent.first = n
      else prev.next = n
      if (ref === undefined) parent.last = n
      else ref.prev = n
      parent.kidsChanged = true
      markDirty(parent)
    },
    remove(n) {
      const parent = n.parent
      if (parent === undefined) return
      if (n.prev === undefined) parent.first = n.next
      else n.prev.next = n.next
      if (n.next === undefined) parent.last = n.prev
      else n.next.prev = n.prev
      n.parent = n.prev = n.next = undefined
      parent.kidsChanged = true
      markDirty(parent)
    },
    // `nodes` are all of `parent`'s children, as the Host contract says.
    removeChildren(parent, nodes) {
      parent = parent.inner ?? parent
      for (const n of nodes) n.parent = n.prev = n.next = undefined
      parent.first = parent.last = undefined
      parent.kidsChanged = true
      markDirty(parent)
    },
    parentOf: (n) => n.parent?.tag === "#content" ? n.parent.parent : n.parent,
    nextOf: (n) => n.next,
    setEvents(n, handlers, dispatch) {
      n.events = { handlers, dispatch }
      // A view that gets touches must not be flattened away.
      if (handlers.press !== undefined && n.props.collapsable !== false) {
        setNative(n, "collapsable", false)
      }
    },
    createContainer: () => node("#container", ""),
    commit
  }
  return { host, root }
}
