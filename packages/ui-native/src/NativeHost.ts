/**
 * A `Renderer.Host` over React Native's Fabric renderer
 * (`global.nativeFabricUIManager`), with no React.
 *
 * Fabric's shadow tree is persistent: a committed node never changes, and
 * changing it means cloning it and every ancestor. The Host contract is a
 * mutable tree, so this host keeps a mirror of `NativeNode`s that the
 * renderer mutates, marks what changed, and at `commit` clones only the
 * changed paths and calls `completeRoot` once. Shadow nodes are created at
 * the first commit that includes them, so props set before it cost nothing.
 *
 * Fabric diffs committed trees in C++ and unmounts the views a tree no longer
 * holds, so the host needs no destroy signal: a node the mirror drops is
 * collected.
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Renderer from "@effect/ui/Renderer"
import type * as Context from "effect/Context"
import { focus } from "./internal/focus.ts"
import {
  commits,
  flushInputs,
  kinds,
  layouts,
  props
} from "./internal/kinds.ts"
import {
  container,
  isColor,
  markDirty,
  mounted,
  surface
} from "./internal/node.ts"
import { drop, fire, rectOf, route } from "./internal/touch.ts"
import * as Native from "./Native.ts"

/**
 * The part of `nativeFabricUIManager` the host uses.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
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
  dispatchCommand(
    node: unknown,
    command: string,
    args: ReadonlyArray<unknown>
  ): void
  getBoundingClientRect(
    node: unknown,
    includeTransform: boolean
  ): ReadonlyArray<number> | null | undefined
  sendAccessibilityEvent(node: unknown, eventType: string): void
  /**
   * Marks the node as the JS responder, which stops native views inside it
   * from handling the touch and, with `blockNativeResponder` on Android, a
   * scroll view around it from taking it.
   */
  setIsJSResponder(
    node: unknown,
    isJSResponder: boolean,
    blockNativeResponder: boolean
  ): void
  configureNextLayoutAnimation(
    config: object,
    onEnd: () => void,
    onFail: () => void
  ): void
}

/**
 * Options accepted by {@link make}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options {
  readonly ui: UIManager
  /** The surface the host renders into, as native passes it to `runApplication`. */
  readonly rootTag: number
  /** `Platform.OS` of the running app. */
  readonly os: string
  /** Turns a CSS colour into the value Fabric parses, as React Native's `processColor`. */
  readonly processColor: (color: unknown) => unknown
  /** Called after every `commit`, whether or not it changed anything. */
  readonly onCommit?: (() => void) | undefined
}

/**
 * A node of the host's mirror tree. The renderer only ever sees these.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class NativeNode {
  parent: NativeNode | undefined = undefined
  first: NativeNode | undefined = undefined
  last: NativeNode | undefined = undefined
  prev: NativeNode | undefined = undefined
  next: NativeNode | undefined = undefined
  /** Props changed since the last commit, `null` for a removed one. */
  pending: Record<string, unknown> | undefined = undefined
  /** The committed shadow node, or `undefined` until a commit creates it. */
  shadow: unknown = undefined
  /** The native view name `shadow` was created as. */
  viewName = ""
  /** The tag of the parent `shadow` was created under. */
  parentTag = 0
  /** This node or a descendant changed since the last commit. */
  dirty = true
  /** A child changed, or was inserted or removed, since the last commit. */
  kidsChanged = false
  /** A scroll view's content container, holding its scrollable children. */
  inner: NativeNode | undefined = undefined
  /** A node rendered as this node's first native child, ahead of its children. */
  lead: NativeNode | undefined = undefined
  /** The node rendered around this node, which is its `lead`. */
  outer: NativeNode | undefined = undefined
  events: Renderer.Events | undefined = undefined
  /** A text input's count of edits, which native needs back with its text. */
  eventCount = 0
  /** The `value` the renderer set last, put back when native's edit isn't taken. */
  value: unknown = undefined
  // React Native allocates even tags from 2, which never collide with the
  // surfaces' own tags.
  tag = lastTag += 2
  readonly kind: Native.ViewKind
  readonly host: Native.ViewHost
  /** Props of the shadow node, in Fabric's flat form. */
  readonly props: Record<string, unknown>
  constructor(
    kind: Native.ViewKind,
    host: Native.ViewHost,
    props?: Record<string, unknown>
  ) {
    this.kind = kind
    this.host = host
    this.props = props ?? { ...defaultsOf(this) }
  }
}

const defaultsOf = ({ host, kind: { defaults } }: NativeNode) =>
  typeof defaults === "function" ? defaults(host) : defaults

const rawText: Native.ViewKind = { viewName: "RCTRawText" }

let lastTag = 0

const none = {}
const noop = () => {}

/**
 * Makes a host for the surface `rootTag`, and the node its root mounts in.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = (options: Options): {
  readonly host: Renderer.Host<NativeNode>
  readonly root: NativeNode
  readonly operations: Context.Service.Shape<typeof Native.Host>
} => {
  const { onCommit, os, processColor, rootTag, ui } = options
  // Each read of a binding method makes a new host function, so read once.
  const createNode = ui.createNode
  const cloneProps = ui.cloneNodeWithNewProps
  const cloneChildren = ui.cloneNodeWithNewChildren
  const cloneBoth = ui.cloneNodeWithNewChildrenAndProps
  const appendChild = ui.appendChild
  listen(ui)
  const colors = new Map<string, unknown>()
  const color = (value: unknown) => {
    if (typeof value !== "string") return processColor(value)
    let out = colors.get(value)
    if (out === undefined) {
      if (colors.size > 255) colors.clear()
      colors.set(value, out = processColor(value))
    }
    return out
  }
  const wrapOf = (outer: NativeNode) => outer.kind.attach!(view)!
  // The props a wrapper gives the node it wraps, unless the node sets them.
  // They go in when the node is created: gaining or losing a wrapper changes
  // its native parent, which recreates it.
  const wrapDefaultsOf = (n: NativeNode) =>
    n.outer === undefined ? undefined : wrapOf(n.outer).props
  const setNative = (n: NativeNode, name: string, value: unknown) => {
    // A wrapper holds the outer props of the node it wraps.
    const outer = n.outer
    if (outer !== undefined && wrapOf(outer).outer.test(name)) n = outer
    // Kind defaults are already processed for Fabric, including colours.
    if (value === undefined) value = defaultsOf(n)?.[name]
    else if (isColor.test(name)) value = color(value)
    put(n, name, value)
  }
  const put = (n: NativeNode, name: string, value: unknown) => {
    if (same(n.props[name], value)) return
    if (value === undefined) delete n.props[name]
    else n.props[name] = value
    // A node not created yet takes all its props at createNode.
    if (n.shadow !== undefined) {
      ;(n.pending ??= {})[name] = value ?? wrapDefaultsOf(n)?.[name] ?? null
    }
    markDirty(n)
  }
  const command = (
    n: NativeNode,
    name: string,
    args: ReadonlyArray<unknown> = []
  ) => {
    if (n.shadow !== undefined) ui.dispatchCommand(n.shadow, name, args)
  }
  // The LayoutAnimation config for the next commit that changes the tree.
  let layout: object | undefined
  const commit = () => {
    flushInputs(view)
    if (root.dirty) {
      root.dirty = false
      root.kidsChanged = false
      const set = ui.createChildSet(rootTag)
      for (let k = root.first; k !== undefined; k = k.next) {
        if (k.kind !== rawText && k.kind.attach === undefined) {
          ui.appendChildToSet(set, build(place(k), rootTag))
        }
      }
      if (layout !== undefined) {
        ui.configureNextLayoutAnimation(layout, noop, noop)
      }
      ui.completeRoot(rootTag, set)
    }
    layout = undefined
    for (const hook of commits) hook(view)
    onCommit?.()
  }
  const view: Native.ViewHost = {
    os,
    ui,
    set: setNative,
    color,
    command,
    fire,
    commit,
    // `build` recreates a view whose parent tag changed.
    recreate(n) {
      n.parentTag = 0
      markDirty(n)
    }
  }
  const root = new NativeNode(surface, view)

  const move = (from: NativeNode, to: NativeNode, outer: RegExp) => {
    for (const name in to.props) {
      if (outer.test(name)) put(to, name, undefined)
    }
    for (const name in from.props) {
      if (!outer.test(name)) continue
      put(to, name, from.props[name])
      put(from, name, undefined)
    }
  }
  const attach = (to: NativeNode, n: NativeNode) => {
    const wrap = n.kind.attach!(view)
    if (wrap === undefined) {
      to.lead = n
      return
    }
    // A keyed replacement is inserted before the old node is removed: give
    // back what the old wrapper took, which may differ from what `n` takes.
    if (to.outer !== undefined) detach(to, to.outer)
    to.outer = n
    n.lead = to
    move(to, n, wrap.outer)
  }
  const detach = (to: NativeNode, n: NativeNode) => {
    if (to.lead === n) to.lead = undefined
    else if (to.outer === n) {
      to.outer = undefined
      move(n, to, wrapOf(n).outer)
    }
  }
  // A node with a wrapper renders inside it, so the wrapper changes with it.
  const place = (n: NativeNode): NativeNode => {
    const outer = n.outer
    if (outer === undefined) return n
    if (n.dirty) outer.dirty = outer.kidsChanged = true
    return outer
  }

  const viewNameOf = (n: NativeNode): string => {
    const name = n.kind.viewName
    return typeof name === "string" ? name : name(n, view)
  }

  const build = (n: NativeNode, parentTag: number): unknown => {
    if (!n.dirty && n.parentTag === parentTag) return n.shadow
    n.dirty = false
    let pending = n.pending
    n.pending = undefined
    const viewName = viewNameOf(n)
    if (
      n.shadow !== undefined &&
      (viewName !== n.viewName || n.parentTag !== parentTag)
    ) {
      // Fabric fixes a view's type and parent at creation. Recreate it and
      // its descendants with fresh tags when either changes.
      n.shadow = undefined
      n.tag = lastTag += 2
    }
    let shadow: unknown
    if (n.shadow === undefined) {
      n.viewName = viewName
      n.parentTag = parentTag
      const defaults = wrapDefaultsOf(n)
      shadow = createNode(
        n.tag,
        viewName,
        rootTag,
        defaults === undefined ? n.props : { ...defaults, ...n.props },
        n
      )
    } else if (n.kidsChanged) {
      shadow = pending === undefined
        ? cloneChildren(n.shadow)
        : cloneBoth(n.shadow, pending)
    } else {
      if (pending !== undefined) n.shadow = cloneProps(n.shadow, pending)
      return n.shadow
    }
    pending = undefined
    n.kidsChanged = false
    const textual = n.kind.text === true
    if (n.lead !== undefined) appendChild(shadow, build(n.lead, n.tag))
    for (let k = n.first; k !== undefined; k = k.next) {
      // Outside text, the renderer's only text is the empty node a blank
      // view leaves, which native can't lay out.
      if ((k.kind === rawText && !textual) || k.kind.attach !== undefined) {
        continue
      }
      appendChild(shadow, build(place(k), n.tag))
    }
    return n.shadow = shadow
  }

  const contentOf = (n: NativeNode): NativeNode => n.inner ?? n

  const unlink = (n: NativeNode) => {
    const parent = n.parent
    if (parent === undefined) return
    if (n.kind.attach !== undefined) detach(host.parentOf(n)!, n)
    if (n.prev === undefined) parent.first = n.next
    else n.prev.next = n.next
    if (n.next === undefined) parent.last = n.prev
    else n.next.prev = n.prev
    n.parent = n.prev = n.next = undefined
    parent.kidsChanged = true
    markDirty(parent)
  }
  const host: Renderer.Host<NativeNode> = {
    elements: [Native.name],
    controlled: new Set(["value"]),
    runsMounts: true,
    hot: true,
    createElement(type) {
      const kind = kinds.get(type)
      if (kind === undefined) throw new Error(`<${type}> has no native view`)
      const n = new NativeNode(kind, view)
      if (kind.content !== undefined) {
        const inner = new NativeNode(kind.content, view)
        inner.parent = n
        n.first = n.last = n.inner = inner
      }
      return n
    },
    createText(text) {
      return new NativeNode(rawText, view, { text })
    },
    createContainer() {
      return new NativeNode(container, view)
    },
    setText(n, text) {
      setNative(n, "text", text)
    },
    setAttr(n, name, value) {
      setNative(n, name, value)
    },
    setProp(n, name, value) {
      if (name === "value") n.value = value
      setProp(n, name, value)
    },
    insertBefore(parent, n, ref) {
      if (n.parent !== undefined) unlink(n)
      if (n.kind.attach !== undefined) attach(parent, n)
      parent = contentOf(parent)
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
      drop(n)
      unlink(n)
    },
    parentOf(n) {
      const parent = n.parent
      return parent !== undefined && parent.parent?.inner === parent
        ? parent.parent
        : parent
    },
    nextOf: (n) => n.next,
    setEvents(n, handlers, dispatch, options) {
      const was: object = n.events?.handlers ?? none
      n.events = { handlers, dispatch, options }
      for (const name in was) {
        if (!(name in handlers) && name !== "press") {
          setProp(n, propOf(name), undefined)
        }
      }
      for (const name in handlers) {
        if (name in was) continue
        // A flattened view has no native view to receive touches. Native
        // sends other events only to a view whose `onEvent` prop is true.
        if (name === "press") setNative(n, "collapsable", false)
        else setProp(n, propOf(name), true)
      }
    },
    commit,
    viewTransition(update, types) {
      for (const type of types) layout = layouts.get(type) ?? layout
      update()
    }
  }
  const operations: Context.Service.Shape<typeof Native.Host> = {
    command,
    focus: (n) => command(n, "focus"),
    blur: (n) => command(n, "blur"),
    scrollTo: (n, x, y, animated = true) =>
      command(n, "scrollTo", [x, y, animated]),
    scrollToEnd: (n, animated = true) => command(n, "scrollToEnd", [animated]),
    accessibilityEvent(n, type) {
      if (n.shadow !== undefined) ui.sendAccessibilityEvent(n.shadow, type)
    },
    measure(n) {
      const rect = rectOf(n, false)
      if (rect == null) return undefined
      const [x, y, width, height] = rect as [number, number, number, number]
      return { x, y, width, height }
    }
  }
  return { host, root, operations }
}

// Skip Fabric commits for inline objects whose contents have not changed.
const same = (a: any, b: any): boolean => {
  if (a === b) return true
  if (
    typeof a !== "object" || typeof b !== "object" ||
    a?.constructor !== b?.constructor
  ) return false
  let extra = 0
  for (const key in a) {
    if (!(key in b) || !same(a[key], b[key])) return false
    extra--
  }
  for (const _ in b) extra++
  return !extra
}

const setProp = (n: NativeNode, name: string, value: unknown) => {
  const set = n.kind.props?.[name] ?? props.get(name)
  if (set === undefined) n.host.set(n, name, value)
  else set(n, value, n.host)
}

const propOf = (name: string): string =>
  "on" + name[0]!.toUpperCase() + name.slice(1)

// Native reports every surface's events through one handler, with the
// instance handle the host gave `createNode`.
const listening = new WeakSet<UIManager>()

const listen = (ui: UIManager) => {
  if (listening.has(ui)) return
  listening.add(ui)
  ui.registerEventHandler((handle, type, payload) => {
    if (!(handle instanceof NativeNode)) return
    route(handle, type, payload)
    // Native sends these whether or not the input has a handler.
    if (type === "topFocus") focus.node = handle
    else if (type === "topBlur" && focus.node === handle) focus.node = undefined
    const hook = handle.kind.events?.[type]
    // Strip Fabric's "top" prefix: topLayout -> layout.
    if (hook === undefined) {
      return fire(handle, type[3]!.toLowerCase() + type.slice(4), payload)
    }
    hook(handle, payload, handle.host)
    // After the microtask render, restore rejected controlled edits if still mounted.
    if (handle.value !== undefined) {
      setTimeout(() => {
        if (mounted(handle)) setProp(handle, "value", handle.value)
      }, 0)
    }
  })
}
