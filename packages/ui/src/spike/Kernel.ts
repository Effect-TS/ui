/**
 * SPIKE (EFF-4218), not for release. A kernel for the runtime: the instance tree, the flush, element and
 * text diffing, event dispatch and failure, and nothing else. It runs components made with today's
 * `Component.define(...).make(...)` that use no feature: a Command, a Subscription, a query, a Layer, a
 * slot, a mount, a ref or a head makes it throw.
 *
 * It imports nothing a feature would need. What a feature needs of an instance is `closers`.
 */
import { propsEqual } from "../internal/equal.ts"
import * as View from "../View.ts"

/**
 * What the kernel asks of a host for nodes of type `N`.
 *
 * @stability experimental
 */
export interface Host<N = any> {
  readonly createElement: (tag: string) => N
  readonly createText: (text: string) => N
  readonly setText: (node: N, text: string) => void
  readonly setAttr: (node: N, name: string, value: string | undefined) => void
  readonly setProp: (node: N, name: string, value: unknown) => void
  /** `record`'s element has handlers now. `first` when it had none before: the host ties the record to the node. */
  readonly setEvents: (node: N, record: Rec, first: boolean) => void
  readonly insert: (parent: N, node: N, before: N | null) => void
  readonly remove: (parent: N, node: N) => void
  /** Removes every child of `parent`. */
  readonly clear: (parent: N) => void
  readonly parentOf: (node: N) => N
}

/**
 * A component as the kernel runs it: what `make` returns, read structurally.
 *
 * @stability experimental
 */
export interface Runnable {
  readonly definition: { readonly name: string }
  readonly init: (props: any) => Next
  readonly update: (model: any, message: never, props: any) => Next | undefined
  readonly view: Function
}

interface Next {
  readonly model: unknown
  readonly commands: ReadonlyArray<unknown>
  readonly events: ReadonlyArray<unknown>
}

/**
 * Where a failure came from.
 *
 * @stability experimental
 */
export type FailedIn = "init" | "update" | "view" | "event" | "onEmit"

/**
 * One tree: its host, what is dirty, and where failures go.
 *
 * @stability experimental
 */
export interface Tree {
  readonly host: Host
  readonly report: (path: string, where: FailedIn, error: unknown) => void
  dirty: Array<Instance>
  scheduled: boolean
  closed: boolean
}

/**
 * What a view node rendered to. `node` is the host node of an element or a text. `inst` is the instance
 * a child node mounted, and for an element the instance whose view built it, which takes its events.
 *
 * @stability experimental
 */
export class Rec {
  v: View.Node<any, any>
  node: any
  kids: Array<Rec> | undefined
  inst: Instance
  constructor(v: View.Node<any, any>, node: unknown, kids: Array<Rec> | undefined, inst: Instance) {
    this.v = v
    this.node = node
    this.kids = kids
    this.inst = inst
  }
}

/**
 * A mounted component. A view reads its `path` and keeps its `h.lazy` entries on it.
 *
 * @stability experimental
 */
export class Instance {
  readonly tree: Tree
  readonly component: Runnable
  readonly parent: Instance | undefined
  readonly key: string
  readonly depth: number
  props: unknown
  model: unknown = undefined
  onEmit: ((event: unknown) => unknown) | undefined
  rendered: Rec | undefined = undefined
  dirty = false
  closed = false
  /** How many instances its view mounted and still holds. */
  live = 0
  lazy: unknown = undefined
  /** What a feature runs when the instance leaves the tree. */
  closers: Array<() => void> | undefined = undefined
  constructor(
    tree: Tree,
    component: Runnable,
    parent: Instance | undefined,
    key: string,
    props: unknown,
    onEmit: ((event: unknown) => unknown) | undefined
  ) {
    this.tree = tree
    this.component = component
    this.parent = parent
    this.key = key
    this.depth = parent === undefined ? 0 : parent.depth + 1
    this.props = props
    this.onEmit = onEmit
  }
  get path(): string {
    const own = "/" + this.component.definition.name + (this.key === "" ? "" : "[" + this.key + "]")
    return this.parent === undefined ? own : this.parent.path + own
  }
  /** A host calls it for an event on an element this instance's view built. */
  fire(handler: unknown, payload: unknown): boolean {
    if (this.closed) return false
    let message = handler
    if (typeof handler === "function") {
      try {
        message = handler(payload)
      } catch (error) {
        fail(this, "event", error)
        return false
      }
    }
    if (message === undefined) return false
    send(this, message)
    return true
  }
}

// -- failure ------------------------------------------------------------------

const emptyText = View.text("")

/** A failed instance shows nothing and takes no more messages. Its parent goes on. */
const fail = (inst: Instance, where: FailedIn, error: unknown): void => {
  const tree = inst.tree
  const path = inst.path
  const old = inst.rendered
  if (old !== undefined && !inst.closed) {
    const host = tree.host
    const at = nodeOf(old)
    const parent = host.parentOf(at)
    const blank = new Rec(emptyText, host.createText(""), undefined, inst)
    host.insert(parent, blank.node, at)
    release(inst, old)
    host.remove(parent, at)
    inst.rendered = blank
  }
  close(inst)
  tree.report(path, where, error)
}

// -- messages -----------------------------------------------------------------

/**
 * Runs `update` for a message to `inst`, and delivers what it emits to the parent.
 *
 * @stability experimental
 */
export const send = (inst: Instance, message: unknown): void => {
  if (inst.closed) return
  let next: Next | undefined
  try {
    next = inst.component.update(inst.model, message as never, inst.props)
  } catch (error) {
    return fail(inst, "update", error)
  }
  if (next === undefined) return
  if (next.model !== inst.model) {
    inst.model = next.model
    markDirty(inst)
  }
  apply(inst, next)
}

const apply = (inst: Instance, next: Next): void => {
  if (next.commands.length > 0) throw new Error("spike: Commands aren't part of the kernel")
  const events = next.events
  if (events.length === 0) return
  const parent = inst.parent
  if (parent === undefined || inst.onEmit === undefined) return
  for (let index = 0; index < events.length; index++) {
    if (inst.closed) return
    let message: unknown
    try {
      message = inst.onEmit(events[index])
    } catch (error) {
      fail(parent, "onEmit", error)
      return
    }
    if (message !== undefined) send(parent, message)
  }
}

// -- flush --------------------------------------------------------------------

const markDirty = (inst: Instance): void => {
  if (inst.dirty) return
  inst.dirty = true
  const tree = inst.tree
  tree.dirty.push(inst)
  if (!tree.scheduled) {
    tree.scheduled = true
    queueMicrotask(() => flush(tree))
  }
}

const byDepth = (a: Instance, b: Instance): number => a.depth - b.depth

/**
 * Renders what is dirty, parents first: a parent's render brings its children's props up to date.
 *
 * @stability experimental
 */
export const flush = (tree: Tree): void => {
  tree.scheduled = false
  while (tree.dirty.length > 0 && !tree.closed) {
    const batch = tree.dirty
    tree.dirty = []
    if (batch.length > 1) batch.sort(byDepth)
    for (let index = 0; index < batch.length; index++) {
      const inst = batch[index]!
      if (inst.dirty && !inst.closed) render(inst)
    }
  }
}

// -- instances ----------------------------------------------------------------

const viewOf = (inst: Instance): View.Node<any, any> | undefined => {
  const component = inst.component
  try {
    // The arguments `make`'s view takes: no running Commands, no query results, no shared state.
    return Reflect.apply(component.view, component, [
      inst.model,
      inst.props,
      undefined,
      undefined,
      inst,
      undefined,
      inst
    ])
  } catch (error) {
    fail(inst, "view", error)
    return undefined
  }
}

const unsupported = (component: any): boolean =>
  component.subscriptions !== undefined || component.head !== undefined || component.layer !== undefined

/** Starts an instance and builds its nodes. `undefined` when it failed, having reported it. */
const start = (inst: Instance): Rec | undefined => {
  let first: Next
  try {
    if (unsupported(inst.component)) throw new Error("spike: " + inst.path + " uses a feature the kernel doesn't have")
    first = inst.component.init(inst.props)
  } catch (error) {
    fail(inst, "init", error)
    return undefined
  }
  inst.model = first.model
  const tree = viewOf(inst)
  if (tree === undefined) return undefined
  try {
    inst.rendered = create(inst, tree)
  } catch (error) {
    fail(inst, "view", error)
    return undefined
  }
  apply(inst, first)
  return inst.rendered
}

const render = (inst: Instance): void => {
  inst.dirty = false
  const tree = viewOf(inst)
  if (tree === undefined) return
  try {
    inst.rendered = patch(inst, inst.rendered!, tree)
  } catch (error) {
    fail(inst, "view", error)
  }
}

/** Marks an instance and the instances below it as gone. Its nodes are the caller's to remove. */
const close = (inst: Instance): void => {
  if (inst.closed) return
  inst.closed = true
  inst.lazy = undefined
  if (inst.parent !== undefined) inst.parent.live--
  const closers = inst.closers
  if (closers !== undefined) { for (let index = closers.length - 1; index >= 0; index--) closers[index]!() }
  if (inst.rendered !== undefined && inst.live > 0) release(inst, inst.rendered)
}

/** Closes the instances under a record that `owner`'s view built. */
const release = (owner: Instance, rec: Rec): void => {
  if (owner.live === 0) return
  if (rec.v._tag === "Child") return close(rec.inst)
  const kids = rec.kids
  if (kids !== undefined) { for (let index = 0; index < kids.length; index++) release(owner, kids[index]!) }
}

// -- create -------------------------------------------------------------------

const nodeOf = (rec: Rec): any => {
  while (rec.v._tag === "Child") rec = rec.inst.rendered!
  return rec.node
}

const create = (inst: Instance, view: View.Node<any, any>): Rec => {
  const host = inst.tree.host
  switch (view._tag) {
    case "Text":
      return new Rec(view, host.createText(view.text), undefined, inst)
    case "Element": {
      const node = host.createElement(view.tag)
      const attrs = view.attrs
      if (attrs !== View.noFields) { for (const name in attrs) host.setAttr(node, name, attrs[name]) }
      const views = view.children
      let kids: Array<Rec> | undefined
      if (views.length > 0) {
        kids = new Array(views.length)
        for (let index = 0; index < views.length; index++) {
          host.insert(node, nodeOf(kids[index] = create(inst, views[index]!)), null)
        }
      }
      // After the children, as a select's value needs its options.
      const props = view.props
      if (props !== View.noFields) { for (const name in props) host.setProp(node, name, props[name]) }
      if (
        view.mount !== undefined || view.refKey !== undefined || (view.owned !== undefined && view.owned.length > 0)
      ) {
        throw new Error("spike: mounts, refs and parts aren't part of the kernel")
      }
      const rec = new Rec(view, node, kids, inst)
      if (view.handlers !== View.noFields) host.setEvents(node, rec, true)
      return rec
    }
    case "Child": {
      const child = new Instance(inst.tree, view.component as any, inst, view.key, view.props, view.onEmit)
      inst.live++
      const rec = new Rec(view, undefined, undefined, child)
      // A child that failed shows nothing.
      if (start(child) === undefined && child.rendered === undefined) {
        child.rendered = new Rec(emptyText, host.createText(""), undefined, child)
      }
      return rec
    }
    case "Outlet":
      throw new Error("spike: slots aren't part of the kernel")
  }
}

// -- patch --------------------------------------------------------------------

/** Whether a patch keeps the old node for `view`. */
const pairs = (old: View.Node<any, any>, view: View.Node<any, any>): boolean => {
  if (old === view) return true
  switch (old._tag) {
    case "Element":
      return view._tag === "Element" && old.tag === view.tag && old.elementKey === view.elementKey
    case "Text":
      return view._tag === "Text"
    case "Child":
      return view._tag === "Child" && old.component === view.component && old.key === view.key
    default:
      return false
  }
}

/** Brings a record to `view`, in place when they pair. Returns the record that holds it now. */
const patch = (inst: Instance, old: Rec, view: View.Node<any, any>): Rec => {
  const prev = old.v
  // The view it was patched to last time, as `h.lazy` gives again. A child below renders when it's dirty.
  if (prev === view) return old
  if (!pairs(prev, view)) {
    const host = inst.tree.host
    const at = nodeOf(old)
    const parent = host.parentOf(at)
    const next = create(inst, view)
    host.insert(parent, nodeOf(next), at)
    release(inst, old)
    host.remove(parent, at)
    return next
  }
  switch (view._tag) {
    case "Text":
      if ((prev as View.Text).text !== view.text) inst.tree.host.setText(old.node, view.text)
      old.v = view
      return old
    case "Element":
      patchElement(inst, old, prev as View.Element<any, any>, view)
      return old
    case "Child": {
      const child = old.inst
      old.v = view
      child.onEmit = view.onEmit
      if (child.closed) return old
      if (!propsEqual(child.props, view.props)) {
        child.props = view.props
        render(child)
      } else if (child.dirty) render(child)
      return old
    }
    default:
      return old
  }
}

const patchElement = (inst: Instance, rec: Rec, prev: View.Element<any, any>, view: View.Element<any, any>): void => {
  const host = inst.tree.host
  const node = rec.node
  rec.v = view
  const before = prev.attrs
  const attrs = view.attrs
  if (before !== attrs) {
    // A record's own values are strings, which nothing it inherits is, so a name is looked up by reading it.
    for (const name in before) if (typeof attrs[name] !== "string") host.setAttr(node, name, undefined)
    for (const name in attrs) {
      const value = attrs[name]
      if (before[name] !== value) host.setAttr(node, name, value)
    }
  }
  const was = prev.props
  const props = view.props
  if (was !== props) {
    for (const name in was) if (!(name in props)) host.setProp(node, name, undefined)
    for (const name in props) if (was[name] !== props[name]) host.setProp(node, name, props[name])
  }
  if (view.handlers !== View.noFields) host.setEvents(node, rec, prev.handlers === View.noFields)
  const views = view.children
  const olds = rec.kids
  if (olds === undefined) {
    if (views.length === 0) return
    const kids: Array<Rec> = new Array(views.length)
    for (let index = 0; index < views.length; index++) {
      host.insert(node, nodeOf(kids[index] = create(inst, views[index]!)), null)
    }
    rec.kids = kids
  } else if (views.length === 0) {
    for (let index = 0; index < olds.length; index++) release(inst, olds[index]!)
    host.clear(node)
    rec.kids = undefined
  } else if (views.length === 1 && olds.length === 1) {
    olds[0] = patch(inst, olds[0]!, views[0]!)
  } else rec.kids = patchList(inst, node, olds, views)
}

/** What a keyed node is found by among its siblings. A child with no key is found by its component. */
const keyOf = (view: View.Node<any, any>): unknown =>
  view._tag === "Element"
    ? view.elementKey
    : view._tag === "Child"
    ? (view.key === "" ? view.component : view.key)
    : undefined

/**
 * Brings the children of `parent` to `views`. Equal ends are patched in place. What is left between them
 * is matched by key, or by place for a node with none, and the fewest nodes are moved.
 */
const patchList = (
  inst: Instance,
  parent: unknown,
  olds: Array<Rec>,
  views: ReadonlyArray<View.Node<any, any>>
): Array<Rec> => {
  const host = inst.tree.host
  const out: Array<Rec> = new Array(views.length)
  let start = 0
  let oldEnd = olds.length - 1
  let end = views.length - 1
  while (start <= oldEnd && start <= end && pairs(olds[start]!.v, views[start]!)) {
    out[start] = patch(inst, olds[start]!, views[start]!)
    start++
  }
  while (start <= oldEnd && start <= end && pairs(olds[oldEnd]!.v, views[end]!)) {
    out[end] = patch(inst, olds[oldEnd]!, views[end]!)
    oldEnd--
    end--
  }
  if (start > oldEnd) {
    if (start > end) return out
    const ref = end + 1 < views.length ? nodeOf(out[end + 1]!) : null
    for (let index = start; index <= end; index++) {
      host.insert(parent, nodeOf(out[index] = create(inst, views[index]!)), ref)
    }
    return out
  }
  if (start > end) {
    for (let index = start; index <= oldEnd; index++) {
      const old = olds[index]!
      const node = nodeOf(old)
      release(inst, old)
      host.remove(parent, node)
    }
    return out
  }
  // The middle: where each new node's old one is, plus one. Zero for a node to create.
  const count = end - start + 1
  const sources = new Int32Array(count)
  let byKey: Map<unknown, number> | undefined
  for (let index = start; index <= end; index++) {
    const key = keyOf(views[index]!)
    if (key !== undefined) (byKey ??= new Map()).set(key, index)
  }
  let moved = false
  let last = 0
  for (let index = start; index <= oldEnd; index++) {
    const old = olds[index]!
    const key = keyOf(old.v)
    const to = key !== undefined ? byKey?.get(key) : index <= end ? index : undefined
    if (to !== undefined && sources[to - start] === 0 && pairs(old.v, views[to]!)) {
      sources[to - start] = index + 1
      if (to < last) moved = true
      else last = to
      out[to] = patch(inst, old, views[to]!)
    } else {
      const node = nodeOf(old)
      release(inst, old)
      host.remove(parent, node)
    }
  }
  // Back to front, so the node each one goes before is in place. The nodes of the longest run already
  // in order stay where they are.
  const stay = moved ? increasing(sources) : undefined
  let at = stay === undefined ? -1 : stay.length - 1
  let ref = end + 1 < views.length ? nodeOf(out[end + 1]!) : null
  for (let offset = count - 1; offset >= 0; offset--) {
    const index = start + offset
    if (sources[offset] === 0) {
      host.insert(parent, nodeOf(out[index] = create(inst, views[index]!)), ref)
    } else if (stay !== undefined) {
      if (at >= 0 && stay[at] === offset) at--
      else host.insert(parent, nodeOf(out[index]!), ref)
    }
    ref = nodeOf(out[index]!)
  }
  return out
}

/** The indexes of a longest increasing run of the non-zero `sources`. */
const increasing = (sources: Int32Array): Array<number> => {
  const before = new Int32Array(sources.length)
  const run: Array<number> = []
  for (let index = 0; index < sources.length; index++) {
    const value = sources[index]!
    if (value === 0) continue
    let low = 0
    let high = run.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (sources[run[mid]!]! < value) low = mid + 1
      else high = mid
    }
    before[index] = low > 0 ? run[low - 1]! : -1
    run[low] = index
  }
  for (let index = run.length - 1, at = run[index]; index >= 0; index--) {
    run[index] = at!
    at = before[at!]
  }
  return run
}

// -- root ---------------------------------------------------------------------

/**
 * A mounted root.
 *
 * @stability experimental
 */
export interface Root {
  readonly instance: Instance
  readonly send: (message: unknown) => void
  readonly close: () => void
}

/**
 * Mounts `component` as the last child of `container`.
 *
 * @stability experimental
 */
export const mount = (
  component: Runnable,
  props: unknown,
  container: unknown,
  host: Host,
  report: Tree["report"]
): Root => {
  const tree: Tree = { host, report, dirty: [], scheduled: false, closed: false }
  const instance = new Instance(tree, component, undefined, "", props, undefined)
  const mounted = start(instance) !== undefined
  if (mounted) host.insert(container, nodeOf(instance.rendered!), null)
  return {
    instance,
    send: (message) => send(instance, message),
    close: () => {
      if (tree.closed) return
      tree.closed = true
      close(instance)
      if (mounted) host.remove(container, nodeOf(instance.rendered!))
    }
  }
}
