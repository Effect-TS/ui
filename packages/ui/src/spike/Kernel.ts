/**
 * SPIKE (EFF-4218), not for release. A kernel for the runtime: the instance tree, the flush, element and
 * text diffing, event dispatch, failure with its fallbacks, slots, and children found through a Layer.
 * It runs components made with today's `Component.define(...).make(...)`. A Command, a Subscription, a
 * query, a mount, a ref or a head makes it throw.
 *
 * Two features live outside it and reach it through values the app makes. A Layer is built by what
 * `Layers.provide` puts on the component as `boot`. The message log is what the app passes as `log`.
 */
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { TypeId as FeatureId } from "../Feature.ts"
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
  /** The sibling after `node`, which a slot's content is placed before. */
  readonly nextOf: (node: N) => N | null
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
  readonly layer?: unknown
  /** Starts the component's Layer. `Layers.provide` puts it there. */
  readonly boot?: ((inst: Instance) => void) | undefined
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
export type FailedIn = "init" | "update" | "view" | "event" | "onEmit" | "onFailure" | "fallback" | "layer"

/**
 * What the Layers above an instance built. `ctx` once they are ready, `cause` once one failed, and
 * neither while one is building.
 *
 * @stability experimental
 */
export interface Env {
  ctx: Context.Context<any> | undefined
  cause: Cause.Cause<unknown> | undefined
  /** What to run when it settles. */
  readonly waiting: Array<() => void>
}

/**
 * What the kernel tells a message log. The log adds the rest of an entry.
 *
 * @stability experimental
 */
export type Recorder = (inst: Instance, draft: { readonly _tag: string; readonly [field: string]: unknown }) => void

/**
 * One tree: its host, what is dirty, and where failures go.
 *
 * @stability experimental
 */
export interface Tree {
  readonly host: Host
  readonly report: (path: string, where: FailedIn, cause: Cause.Cause<unknown>) => void
  readonly log: Recorder | undefined
  /** What a failed root shows. */
  readonly fallback: ((cause: Cause.Cause<unknown>) => View.Node<any, any>) | undefined
  dirty: Array<Instance>
  scheduled: boolean
  closed: boolean
}

/**
 * What a view node rendered to. `node` is the host node of an element or a text. `inst` is the instance
 * a child node mounted, and for an element the instance whose view built it, which takes its events.
 *
 * A record with no `node` stands for the nodes of others. A slot's are those of `kids`, its content. A
 * child's are those of its instance, or of `kids` while it shows a fallback. A child that waits for a
 * Layer has its declarer as `inst`.
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
  /** The instance whose view declared it, which takes what it emits. */
  readonly parent: Instance | undefined
  /** The record of the child node that declared it. A root has none. */
  readonly at: Rec | undefined
  readonly depth: number
  props: unknown
  env: Env
  model: unknown = undefined
  rendered: Rec | undefined = undefined
  dirty = false
  closed = false
  failure: Cause.Cause<unknown> | undefined = undefined
  /** How many instances, slots and waiting children its view holds. */
  live = 0
  lazy: unknown = undefined
  /** Where its view placed each slot, and the content it showed there. */
  placed: Map<string, Placed> | undefined = undefined
  /** What a feature runs when the instance leaves the tree. */
  closers: Array<() => void> | undefined = undefined
  constructor(
    tree: Tree,
    component: Runnable,
    parent: Instance | undefined,
    at: Rec | undefined,
    props: unknown,
    env: Env
  ) {
    this.tree = tree
    this.component = component
    this.parent = parent
    this.at = at
    this.depth = parent === undefined ? 0 : parent.depth + 1
    this.props = props
    this.env = env
  }
  get path(): string {
    const key = this.at === undefined ? "" : (this.at.v as View.Child<any, any>).key
    const own = "/" + this.component.definition.name + (key === "" ? "" : "[" + key + "]")
    return this.parent === undefined ? own : this.parent.path + own
  }
  /**
   * A host calls it for an event on an element this instance's view built, with the event's name as
   * `source`.
   */
  fire(handler: unknown, payload: unknown, source: unknown, where: FailedIn = "event"): boolean {
    if (this.closed) return false
    let message = handler
    if (typeof handler === "function") {
      try {
        message = handler(payload)
      } catch (error) {
        fail(this, where, Cause.die(error))
        return false
      }
    }
    if (message === undefined) return false
    send(this, message, source)
    return true
  }
}

interface Placed {
  rec: Rec
  content: unknown
}

// -- checks -------------------------------------------------------------------

/**
 * Whether the checks that only catch an author's mistake run. A bundler that builds for production
 * replaces `process.env.NODE_ENV`, this folds to `false`, and the checks and their messages are dropped.
 */
const dev = process.env.NODE_ENV !== "production"

/** Throws for two siblings found by the same key, as the diff would give one of them the other's node. */
const checkKeys = (inst: Instance, views: ReadonlyArray<View.Node<any, any>>): void => {
  // An element and a child can share a key: they are never each other's.
  const elements = new Set<unknown>()
  const children = new Set<unknown>()
  for (let index = 0; index < views.length; index++) {
    const view = views[index]!
    const key = keyOf(view)
    if (key === undefined) continue
    const seen = view._tag === "Element" ? elements : children
    if (seen.has(key)) {
      throw new Error(
        view._tag === "Child" && view.key === ""
          ? inst.path + ": two children of " + (view.component as any).definition?.name +
            " have no key. Give each a key."
          : inst.path + ": two siblings have the key " + String(view._tag === "Child" ? view.key : key) +
            ". Keys are unique among siblings."
      )
    }
    seen.add(key)
  }
}

// -- failure ------------------------------------------------------------------

const emptyText = View.text("")

/** What a child's declarer shows in its place: for a failure, or with no `cause` while a Layer builds. */
const fallbackOf = (
  owner: Instance,
  view: View.Child<any, any>,
  cause: Cause.Cause<unknown> | undefined
): View.Node<any, any> => {
  const fallback = view.fallback
  if (fallback === undefined) return emptyText
  try {
    return View.children([
      fallback((cause === undefined ? AsyncResult.initial(true) : AsyncResult.failure(cause)) as any)
    ])[0] ?? emptyText
  } catch (error) {
    queueMicrotask(() => fail(owner, "fallback", Cause.die(error)))
    return emptyText
  }
}

const rootFallback = (tree: Tree, cause: Cause.Cause<unknown>): View.Node<any, any> => {
  try {
    return tree.fallback?.(cause) ?? emptyText
  } catch (error) {
    tree.report("", "fallback", Cause.die(error))
    return emptyText
  }
}

/** Builds what stands in for a failed instance. Its declarer authors it. */
const stand = (inst: Instance, cause: Cause.Cause<unknown>): Rec => {
  const parent = inst.parent
  try {
    return parent === undefined
      ? create(inst, rootFallback(inst.tree, cause))
      : create(parent, fallbackOf(parent, inst.at!.v as View.Child<any, any>, cause))
  } catch (error) {
    inst.tree.report(inst.path, "fallback", Cause.die(error))
    return create(inst, emptyText)
  }
}

/**
 * A failed instance takes no more messages and shows its declarer's fallback, or nothing. Its parent
 * goes on, and is told through `onFailure`.
 *
 * @stability experimental
 */
export const fail = (inst: Instance, where: FailedIn, cause: Cause.Cause<unknown>): void => {
  if (inst.closed) return
  const tree = inst.tree
  const log = tree.log
  if (log !== undefined) log(inst, { _tag: "Failed", props: inst.props, in: where, cause })
  inst.failure = cause
  const old = inst.rendered
  const path = inst.path
  close(inst)
  const at = inst.at
  // With nothing rendered it failed while starting, and what started it shows the fallback.
  if (old !== undefined) {
    const host = tree.host
    const first = nodeOf(old)
    const parentNode = host.parentOf(first)
    const shown = stand(inst, cause)
    place(host, parentNode, shown, first)
    unplace(host, parentNode, old)
    if (at === undefined) inst.rendered = shown
    else {
      inst.rendered = undefined
      at.kids = [shown]
    }
  }
  const onFailure = at === undefined ? undefined : (at.v as View.Child<any, any>).onFailure
  if (onFailure !== undefined) {
    const parent = inst.parent!
    queueMicrotask(() => parent.fire(onFailure, AsyncResult.failure(cause), inst, "onFailure"))
  }
  // Last, so a reporter that throws leaves the tree whole.
  tree.report(path, where, cause)
}

// -- messages -----------------------------------------------------------------

/**
 * Runs `update` for a message to `inst`, and delivers what it emits to the parent.
 *
 * @stability experimental
 */
export const send = (inst: Instance, message: unknown, source?: unknown): void => {
  if (inst.closed) return
  let next: Next | undefined
  try {
    next = inst.component.update(inst.model, message as never, inst.props)
  } catch (error) {
    return fail(inst, "update", Cause.die(error))
  }
  if (next === undefined) return
  const log = inst.tree.log
  if (log !== undefined) {
    log(inst, {
      _tag: "Update",
      // An event's name from a host, the instance a parent heard from, or nothing for a send.
      source: typeof source === "string"
        ? { _tag: "DomEvent", name: source }
        : source instanceof Instance
        ? { _tag: source.closed ? "Failure" : "Emit", path: source.path }
        : { _tag: "Send" },
      message,
      props: inst.props,
      model: next.model,
      commands: next.commands,
      events: next.events
    })
  }
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
  if (parent === undefined) return
  for (let index = 0; index < events.length; index++) {
    if (inst.closed) return
    const onEmit = (inst.at!.v as View.Child<any, any>).onEmit
    if (onEmit === undefined) return
    let message: unknown
    try {
      message = onEmit(events[index])
    } catch (error) {
      fail(parent, "onEmit", Cause.die(error))
      return
    }
    if (message !== undefined) send(parent, message, inst)
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
    fail(inst, "view", Cause.die(error))
    return undefined
  }
}

const unsupported = (component: any): boolean =>
  component.subscriptions !== undefined || component.head !== undefined ||
  (component.layer !== undefined && component.boot === undefined)

/** Starts an instance and builds its nodes. `undefined` when it failed, having reported it. */
const start = (inst: Instance): Rec | undefined => {
  let first: Next
  const component = inst.component
  try {
    if (unsupported(component)) throw new Error("spike: " + inst.path + " uses a feature the kernel doesn't have")
    // The view doesn't wait for the Layer: what needs it shows a fallback until it is ready.
    if (component.boot !== undefined) {
      component.boot(inst)
      if (inst.closed) return undefined
    }
    first = component.init(inst.props)
  } catch (error) {
    fail(inst, "init", Cause.die(error))
    return undefined
  }
  inst.model = first.model
  const log = inst.tree.log
  if (log !== undefined) {
    log(inst, {
      _tag: "Mounted",
      props: inst.props,
      model: first.model,
      commands: first.commands,
      events: first.events,
      adopted: false
    })
  }
  const tree = viewOf(inst)
  if (tree === undefined) return undefined
  let rendered: Rec
  try {
    rendered = create(inst, tree)
  } catch (error) {
    fail(inst, "view", Cause.die(error))
    return undefined
  }
  // It can fail while its view is built, when a child's first event is more than its `update` takes.
  if (inst.closed) {
    release(inst, rendered)
    return undefined
  }
  inst.rendered = rendered
  apply(inst, first)
  return rendered
}

const render = (inst: Instance): void => {
  inst.dirty = false
  const tree = viewOf(inst)
  if (tree === undefined) return
  try {
    inst.rendered = patch(inst, inst.rendered!, tree)
  } catch (error) {
    fail(inst, "view", Cause.die(error))
  }
}

/** Marks an instance and the instances below it as gone. Its nodes are the caller's to remove. */
const close = (inst: Instance): void => {
  if (inst.closed) return
  inst.closed = true
  inst.lazy = undefined
  if (inst.parent !== undefined) inst.parent.live--
  const log = inst.tree.log
  if (log !== undefined) log(inst, { _tag: "Unmounted" })
  const closers = inst.closers
  if (closers !== undefined) { for (let index = closers.length - 1; index >= 0; index--) closers[index]!() }
  if (inst.rendered !== undefined && inst.live > 0) release(inst, inst.rendered)
}

/** What a waiting child's record has as `inst` once it is released, so the Layer it waits for leaves it. */
const released = undefined as unknown as Instance

/** Closes the instances under a record that `owner`'s view built. It leaves the records as they are. */
const release = (owner: Instance, rec: Rec): void => {
  if (owner.live === 0) return
  const view = rec.v
  const kids = rec.kids
  if (view._tag === "Child") {
    if (kids === undefined) return close(rec.inst)
    if (rec.inst === owner) {
      owner.live--
      rec.inst = released
    }
  } else if (view._tag === "Outlet") {
    owner.live--
    if (owner.placed!.get(view.name)?.rec === rec) owner.placed!.delete(view.name)
    // A slot's content is its receiver's declarer's.
    owner = owner.parent!
  }
  if (kids !== undefined) { for (let index = 0; index < kids.length; index++) release(owner, kids[index]!) }
}

// -- create -------------------------------------------------------------------

/** The first host node of a record. */
const nodeOf = (rec: Rec): any => {
  while (rec.node === undefined) rec = rec.kids !== undefined ? rec.kids[0]! : rec.inst.rendered!
  return rec.node
}

const lastNodeOf = (rec: Rec): any => {
  while (rec.node === undefined) rec = rec.kids !== undefined ? rec.kids[rec.kids.length - 1]! : rec.inst.rendered!
  return rec.node
}

/** Puts every node of a record before `before`. */
const place = (host: Host, parent: unknown, rec: Rec, before: unknown): void => {
  if (rec.node !== undefined) host.insert(parent, rec.node, before)
  else if (rec.kids === undefined) place(host, parent, rec.inst.rendered!, before)
  else for (let index = 0; index < rec.kids.length; index++) place(host, parent, rec.kids[index]!, before)
}

const unplace = (host: Host, parent: unknown, rec: Rec): void => {
  if (rec.node !== undefined) host.remove(parent, rec.node)
  else if (rec.kids === undefined) unplace(host, parent, rec.inst.rendered!)
  else for (let index = 0; index < rec.kids.length; index++) unplace(host, parent, rec.kids[index]!)
}

/** Mounts what a child node declares, or its fallback when a Layer it is found through isn't ready. */
const mountChild = (owner: Instance, rec: Rec): void => {
  const view = rec.v as View.Child<any, any>
  let component = view.component as any
  let env = owner.env
  if (FeatureId in component) {
    const ctx = env.ctx
    if (ctx === undefined) {
      if (view.fallback === undefined) {
        throw new Error(
          owner.path + ": " + component.key +
            " isn't available, because a Layer above it is still building or failed. Pass `fallback`."
        )
      }
      rec.kids = [create(owner, fallbackOf(owner, view, env.cause))]
      rec.inst = owner
      owner.live++
      if (env.cause === undefined) env.waiting.push(() => settle(owner, rec))
      return
    }
    const found = Context.getOrUndefined(ctx, component) as any
    if (found === undefined) throw new Error(owner.path + ": nothing provides " + component.key)
    component = found.component
    env = { ctx: Context.merge(ctx, found.context), cause: undefined, waiting: [] }
  }
  const child = rec.inst = new Instance(owner.tree, component, owner, rec, view.props, env)
  owner.live++
  if (start(child) === undefined) rec.kids = [stand(child, child.failure!)]
  // Its declarer can fail while it starts, when what it emits first is more than the declarer takes.
  else if (owner.closed) close(child)
}

/** The Layer a child waited for settled: it takes its fallback's place, or the fallback shows the failure. */
const settle = (owner: Instance, rec: Rec): void => {
  if (rec.inst !== owner || owner.closed) return
  const host = owner.tree.host
  const old = rec.kids![0]!
  try {
    if (owner.env.ctx === undefined) {
      rec.kids![0] = patch(owner, old, fallbackOf(owner, rec.v as View.Child<any, any>, owner.env.cause))
      return
    }
    const first = nodeOf(old)
    const parentNode = host.parentOf(first)
    rec.kids = undefined
    owner.live--
    try {
      mountChild(owner, rec)
    } catch (error) {
      rec.kids = [old]
      owner.live++
      throw error
    }
    place(host, parentNode, rec, first)
    unplace(host, parentNode, old)
    release(owner, old)
  } catch (error) {
    fail(owner, "view", Cause.die(error))
  }
}

const noContent: ReadonlyArray<View.Node<any, any>> = [emptyText]

/** What a slot shows: its content as nodes, and one empty text for none, so it keeps its place. */
const contentOf = (content: unknown): ReadonlyArray<View.Node<any, any>> => {
  if (content === undefined) return noContent
  const views = View.children([content as View.Input<any, any>])
  return views.length === 0 ? noContent : views
}

const slotOf = (receiver: Instance, name: string): unknown =>
  receiver.at === undefined ? undefined : (receiver.at.v as View.Child<any, any>).slots?.[name]

/** Brings a placed slot to the content its receiver is given now. */
const refresh = (receiver: Instance, placed: Placed): void => {
  const rec = placed.rec
  const content = slotOf(receiver, (rec.v as View.Outlet).name)
  if (content === placed.content) return
  placed.content = content
  const host = receiver.tree.host
  const olds = rec.kids!
  const after = host.nextOf(lastNodeOf(olds[olds.length - 1]!))
  rec.kids = patchList(receiver.parent!, host.parentOf(nodeOf(olds[0]!)), olds, contentOf(content), after)
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
      if (dev && views.length > 1) checkKeys(inst, views)
      if (views.length > 0) {
        kids = new Array(views.length)
        for (let index = 0; index < views.length; index++) {
          place(host, node, kids[index] = create(inst, views[index]!), null)
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
      const rec = new Rec(view, undefined, undefined, inst)
      mountChild(inst, rec)
      return rec
    }
    case "Outlet": {
      // `inst` is the receiver. Its declarer wrote the content, so takes its events and its children.
      const declarer = inst.parent
      if (declarer === undefined) throw new Error(inst.path + " places the slot " + view.name + ", and is a root")
      const content = slotOf(inst, view.name)
      const views = contentOf(content)
      const kids: Array<Rec> = new Array(views.length)
      const rec = new Rec(view, undefined, kids, inst)
      inst.live++
      ;(inst.placed ??= new Map()).set(view.name, { rec, content })
      for (let index = 0; index < views.length; index++) kids[index] = create(declarer, views[index]!)
      return rec
    }
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
    case "Outlet":
      return view._tag === "Outlet" && old.name === view.name
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
    place(host, parent, next, at)
    unplace(host, parent, old)
    release(inst, old)
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
      const shown = old.kids
      if (shown !== undefined) {
        // A fallback, for a child that failed or one that waits for a Layer.
        shown[0] = patch(inst, shown[0]!, fallbackOf(inst, view, child === inst ? inst.env.cause : child.failure))
        return old
      }
      if (child.closed) return old
      if (!propsEqual(child.props, view.props)) {
        child.props = view.props
        const log = inst.tree.log
        if (log !== undefined) log(child, { _tag: "PropsChanged", props: view.props })
        render(child)
      } else if (child.dirty) render(child)
      const placed = child.placed
      if (placed !== undefined && !child.closed) { for (const slot of placed.values()) refresh(child, slot) }
      return old
    }
    case "Outlet": {
      refresh(inst, inst.placed!.get(view.name)!)
      return old
    }
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
  if (dev && views.length > 1) checkKeys(inst, views)
  if (olds === undefined) {
    if (views.length === 0) return
    const kids: Array<Rec> = new Array(views.length)
    for (let index = 0; index < views.length; index++) {
      place(host, node, kids[index] = create(inst, views[index]!), null)
    }
    rec.kids = kids
  } else if (views.length === 0) {
    for (let index = 0; index < olds.length; index++) release(inst, olds[index]!)
    host.clear(node)
    rec.kids = undefined
  } else if (views.length === 1 && olds.length === 1) {
    olds[0] = patch(inst, olds[0]!, views[0]!)
  } else rec.kids = patchList(inst, node, olds, views, null)
}

/** What a keyed node is found by among its siblings. A child with no key is found by its component. */
const keyOf = (view: View.Node<any, any>): unknown =>
  view._tag === "Element"
    ? view.elementKey
    : view._tag === "Child"
    ? (view.key === "" ? view.component : view.key)
    : undefined

/**
 * Brings a run of the children of `parent` to `views`: all of them, or a slot's content, which ends
 * before `after`. Equal ends are patched in place. What is left between them is matched by key, or by
 * place for a node with none, and the fewest nodes are moved.
 */
const patchList = (
  inst: Instance,
  parent: unknown,
  olds: Array<Rec>,
  views: ReadonlyArray<View.Node<any, any>>,
  after: unknown
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
    const ref = end + 1 < views.length ? nodeOf(out[end + 1]!) : after
    for (let index = start; index <= end; index++) {
      place(host, parent, out[index] = create(inst, views[index]!), ref)
    }
    return out
  }
  if (start > end) {
    for (let index = start; index <= oldEnd; index++) {
      const old = olds[index]!
      unplace(host, parent, old)
      release(inst, old)
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
      unplace(host, parent, old)
      release(inst, old)
    }
  }
  // Back to front, so the node each one goes before is in place. The nodes of the longest run already
  // in order stay where they are.
  const stay = moved ? increasing(sources) : undefined
  let at = stay === undefined ? -1 : stay.length - 1
  let ref = end + 1 < views.length ? nodeOf(out[end + 1]!) : after
  for (let offset = count - 1; offset >= 0; offset--) {
    const index = start + offset
    if (sources[offset] === 0) {
      place(host, parent, out[index] = create(inst, views[index]!), ref)
    } else if (stay !== undefined) {
      if (at >= 0 && stay[at] === offset) at--
      else place(host, parent, out[index]!, ref)
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
 * What a mount is given besides its component: where failures go, the context the app's Layers start
 * from, a message log, and what a failed root shows.
 *
 * @stability experimental
 */
export interface Options {
  readonly report: Tree["report"]
  readonly context?: Context.Context<any> | undefined
  readonly log?: Recorder | undefined
  readonly fallback?: Tree["fallback"]
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
  options: Options
): Root => {
  const tree: Tree = {
    host,
    report: options.report,
    log: options.log,
    fallback: options.fallback,
    dirty: [],
    scheduled: false,
    closed: false
  }
  const ctx: Context.Context<any> = options.context ?? (Context.empty() as Context.Context<any>)
  const env: Env = { ctx, cause: undefined, waiting: [] }
  const instance = new Instance(tree, component, undefined, undefined, props, env)
  if (start(instance) === undefined) instance.rendered = stand(instance, instance.failure!)
  place(host, container, instance.rendered!, null)
  return {
    instance,
    send: (message) => send(instance, message),
    close: () => {
      if (tree.closed) return
      tree.closed = true
      close(instance)
      unplace(host, container, instance.rendered!)
    }
  }
}
