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
import type * as View from "@effect/ui/View"
import type * as Context from "effect/Context"
import { kinds } from "./internal/kinds.ts"
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

interface EventEntry {
  readonly handlers: Readonly<Record<string, View.Handler<unknown, any>>>
  readonly dispatch: Renderer.Dispatch
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
  /** A scroll view's content container: its only child, holding its children. */
  inner: NativeNode | undefined = undefined
  events: EventEntry | undefined = undefined
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
// Distinct references so restore can tell mounted roots from kept containers.
const surface: Native.ViewKind = { viewName: "" }
const container: Native.ViewKind = { viewName: "" }

let lastTag = 0

const isColor = /(^c|C)olor$/
const none = {}

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
  const setNative = (n: NativeNode, name: string, value: unknown) => {
    // Removing a prop puts back the kind's default, as leaving it out does.
    // Defaults are already in Fabric's form, so only a set colour is processed.
    if (value === undefined) value = defaultsOf(n)?.[name]
    else if (isColor.test(name)) value = color(value)
    if (same(n.props[name], value)) return
    if (value === undefined) delete n.props[name]
    else n.props[name] = value
    // A node not created yet takes all its props at createNode.
    if (n.shadow !== undefined) {
      ;(n.pending ??= {})[name] = value === undefined ? null : value
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
  const view: Native.ViewHost = { os, set: setNative, color, command, fire }
  const root = new NativeNode(surface, view)

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
      shadow = createNode(n.tag, viewName, rootTag, n.props, n)
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
    for (let k = n.first; k !== undefined; k = k.next) {
      // Outside text, the renderer's only text is the empty node a blank
      // view leaves, which native can't lay out.
      if (k.kind === rawText && !textual) continue
      appendChild(shadow, build(k, n.tag))
    }
    return n.shadow = shadow
  }

  const unwrap = (n: NativeNode): NativeNode => n.inner ?? n

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
      if (n.parent !== undefined) host.remove(n)
      parent = unwrap(parent)
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
    parentOf(n) {
      const parent = n.parent
      return parent !== undefined && parent.parent?.inner === parent
        ? parent.parent
        : parent
    },
    nextOf: (n) => n.next,
    setEvents(n, handlers, dispatch) {
      const was: object = n.events?.handlers ?? none
      n.events = { handlers, dispatch }
      for (const name in was) {
        if (!(name in handlers)) setNative(n, propOf(name), undefined)
      }
      for (const name in handlers) {
        if (name in was) continue
        // A flattened view has no native view to receive touches. Native
        // sends other events only to a view whose `onEvent` prop is true.
        if (name === "press") setNative(n, "collapsable", false)
        else setNative(n, propOf(name), true)
      }
    },
    commit() {
      if (root.dirty) {
        root.dirty = false
        root.kidsChanged = false
        const set = ui.createChildSet(rootTag)
        for (let k = root.first; k !== undefined; k = k.next) {
          if (k.kind !== rawText) ui.appendChildToSet(set, build(k, rootTag))
        }
        ui.completeRoot(rootTag, set)
      }
      onCommit?.()
    }
  }
  const operations: Context.Service.Shape<typeof Native.Host> = {
    command,
    focus: (n) => command(n, "focus"),
    blur: (n) => command(n, "blur"),
    scrollTo: (n, x, y, animated = true) =>
      command(n, "scrollTo", [x, y, animated]),
    measure(n) {
      const rect = n.shadow === undefined
        ? undefined
        : ui.getBoundingClientRect(n.shadow, false)
      if (rect == null) return undefined
      const [x, y, width, height] = rect as [number, number, number, number]
      return { x, y, width, height }
    }
  }
  return { host, root, operations }
}

// An inline object, such as a `transform` array, is a new one each render, so
// objects compare by value to skip committing an unchanged prop.
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

const markDirty = (n: NativeNode | undefined) => {
  while (n !== undefined && !n.dirty) {
    n.dirty = true
    n = n.parent
    if (n !== undefined) n.kidsChanged = true
  }
}

const setProp = (n: NativeNode, name: string, value: unknown) => {
  const set = n.kind.props?.[name]
  if (set === undefined) n.host.set(n, name, value)
  else set(n, value, n.host)
}

const fire = (n: NativeNode, name: string, payload: unknown) => {
  const handler = n.events?.handlers[name]
  if (handler !== undefined) n.events!.dispatch(name, handler, payload)
}

const propOf = (name: string): string =>
  "on" + name[0]!.toUpperCase() + name.slice(1)

// Native reports every surface's events through one handler, with the
// instance handle the host gave `createNode`.
const listening = new WeakSet<UIManager>()

// How far, in points, a touch may end outside the pressed view and still
// press it, as React Native's `Pressable` allows by default.
const slop = 20

const listen = (ui: UIManager) => {
  if (listening.has(ui)) return
  listening.add(ui)
  let pressed: NativeNode | undefined
  const within = (n: NativeNode, x: number, y: number) => {
    const rect = n.shadow === undefined
      ? undefined
      : ui.getBoundingClientRect(n.shadow, true)
    if (rect == null) return true
    const [left, top, width, height] = rect as [number, number, number, number]
    return x >= left - slop && x <= left + width + slop &&
      y >= top - slop && y <= top + height + slop
  }
  ui.registerEventHandler((handle, type, payload) => {
    if (!(handle instanceof NativeNode)) return
    switch (type) {
      case "topTouchStart": {
        let n: NativeNode | undefined = handle
        while (n !== undefined && n.events?.handlers.press === undefined) {
          n = n.parent
        }
        pressed = n
        return
      }
      case "topTouchCancel": {
        pressed = undefined
        return
      }
      case "topTouchEnd": {
        const target = pressed
        pressed = undefined
        if (target === undefined) return
        const touch = (payload as any)?.changedTouches?.[0]
        const x = touch?.pageX ?? 0
        const y = touch?.pageY ?? 0
        let n: NativeNode | undefined = handle
        while (n !== undefined && n !== target) n = n.parent
        if (n !== undefined && within(target, x, y)) {
          fire(target, "press", { x, y })
        }
        return
      }
    }
    const hook = handle.kind.events?.[type]
    // Strip Fabric's "top" prefix: topLayout -> layout.
    if (hook === undefined) {
      return fire(handle, type[3]!.toLowerCase() + type.slice(4), payload)
    }
    hook(handle, payload, handle.host)
    // After the microtask render, restore rejected controlled edits if still mounted.
    if (handle.value !== undefined) {
      setTimeout(() => {
        let n = handle
        while (n.parent !== undefined) n = n.parent
        if (n.kind === surface) setProp(handle, "value", handle.value)
      }, 0)
    }
  })
}
