/**
 * @internal
 */
import {
  checkContent,
  checkKeys,
  checkPaths,
  checkPlaced,
  checkShown,
  dev
} from "#dev"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import type * as Fiber from "effect/Fiber"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { TypeId as FeatureId } from "../Feature.ts"
import * as View from "../View.ts"
import { propsEqual } from "./equal.ts"
import { segmentOf, slotSegment } from "./paths.ts"

/** @internal */
export interface Host<N = any> {
  readonly hold?:
    | ((owner: Instance, rec: Rec, slot: string | undefined) => boolean)
    | undefined
  readonly createElement: (tag: string) => N
  readonly createText: (text: string) => N
  readonly setText: (node: N, text: string) => void
  readonly setAttr: (
    node: N,
    name: string,
    value: string | undefined,
    previous?: string | undefined
  ) => void
  readonly normalizeAttrs?:
    | ((
      node: N,
      attrs: Readonly<Record<string, string>>
    ) => Readonly<Record<string, string>>)
    | undefined
  readonly setProp: (node: N, name: string, value: unknown) => void
  readonly setEvents: (node: N, record: Rec, first: boolean) => void
  readonly insert: (parent: N, node: N, before: N | null) => void
  readonly remove: (parent: N, node: N) => void
  readonly clear?: ((parent: N) => void) | undefined
  /** Makes a node that holds a kept child's nodes out of the document. Without it, keeping one fails its author. */
  readonly createContainer?: (() => N) | undefined
  readonly parentOf: (node: N) => N
  readonly nextOf: (node: N) => N | null
  readonly commit?: (() => void) | undefined
  /** The properties a patch sets again even when the view's value is the same: the user may have changed them. */
  readonly controlled?: ReadonlySet<string> | undefined
  readonly runsMounts?: boolean | undefined
  /** Given the tree's folded head, when it changed. */
  readonly head?: ((head: unknown) => void) | undefined
  /** Makes what runs the view transitions updates ask for. Without it, they're ignored. */
  readonly transitions?: ((tree: Tree) => Transitions) | undefined
  readonly server?: Server | undefined
  /** Paints a recorded state: what runs a feature starts nothing. */
  readonly inert?: boolean | undefined
}

/** @internal */
export interface Server {
  readonly drop: (
    inst: Instance,
    name: string,
    issued: Issued | undefined
  ) => void
  readonly defer: (inst: Instance) => void
  readonly report: (problem: any) => void
}

/** @internal */
export interface Transitions {
  readonly request: (types: ReadonlyArray<string>) => void
  /** Whether a message to `inst` waits for a transition, to read the props it gives. */
  readonly waits: (inst: Instance) => boolean
  readonly wait: (f: () => void) => void
  /** At the start of a flush: whether it waits for a transition to start. */
  readonly hold: () => boolean
  readonly settle: () => void
}

/**
 * What an element's mount carries to run itself on the element's record, so the kernel runs one without
 * importing what runs it. `~attach` is called as the element is made, and with each new mount a patch gives it.
 *
 * @internal
 */
export interface Attachable {
  readonly "~attach": (rec: Rec) => void
  readonly "~detach": (rec: Rec) => void
}

/** @internal */
export interface Runnable {
  readonly definition: { readonly name: string }
  readonly init: (props: any) => Next
  readonly update: (
    model: any,
    message: never,
    props: any,
    results?: unknown,
    shared?: unknown
  ) => Next | undefined
  readonly view: Function
  /** Set by `Component.provide`: the kernel never reads it. */
  readonly layer?: unknown
  /** Called once `Mounted` is logged, before the first view: a provided Layer starts building. */
  readonly boot?: ((inst: Instance) => void) | undefined
  /** Called after each Model or props change the instance takes, and once it first rendered, with the Next it applied. */
  readonly "~sync"?:
    | ((inst: Instance, next?: Next, seq?: number | undefined | void) => void)
    | undefined
  /** A headless component's view: its parts, given to the closure whoever declared the instance wrote. */
  readonly "~content"?: Function | undefined
  /** A headless component's: the element `inst` renders, with the layers its parts added merged in. */
  readonly "~owned"?:
    | ((inst: Instance, view: View.Element<any, any>) => View.Element<any, any>)
    | undefined
  /** Called once `init`'s Commands are issued, before the first view. */
  readonly "~first"?: ((inst: Instance) => void) | undefined
  /** Called before each view after the first. */
  readonly "~render"?: ((inst: Instance) => void) | undefined
  /** What runs the component's children written inside `h.keepAlive`, when it's a keep-alive component. */
  readonly "~kept"?: Keeper | undefined
  /**
   * A lazy component's: the component it loaded, or `undefined` while it loads or once it failed, when
   * the slot shows its fallback and `settle` is called for it once the load ends.
   */
  readonly "~load"?:
    | ((
      owner: Instance,
      rec: Rec,
      at: string | undefined
    ) => Runnable | undefined)
    | undefined
  /** A lazy component's: why its load failed. */
  readonly "~cause"?: (() => Cause.Cause<unknown> | undefined) | undefined
}

/**
 * Runs the keep-alive children of a tree, carried by a keep-alive component so the kernel never imports
 * it. `mount` makes or takes the child a Rec writes, with the path of the slot it's drawn in, `patch` returns the Rec a kept one is patched to,
 * or `undefined` to patch it as any child, and `release` returns whether it kept or dropped the Rec's
 * child itself.
 *
 * @internal
 */
export interface Keeper {
  readonly mount: (author: Instance, rec: Rec, slot: string | undefined) => void
  readonly patch: (
    inst: Instance,
    old: Rec,
    view: View.Child<any, any>
  ) => Rec | undefined
  readonly release: (owner: Instance, rec: Rec) => boolean
}

/** @internal */
export interface Next {
  readonly model: unknown
  readonly commands: ReadonlyArray<unknown>
  readonly events: ReadonlyArray<unknown>
  readonly lists?: ReadonlyArray<unknown> | undefined
  readonly sends?: ReadonlyArray<unknown> | undefined
  readonly viewTransition?: ReadonlyArray<string> | undefined
}

/** @internal */
export type FailedIn =
  | "init"
  | "update"
  | "view"
  | "event"
  | "onEmit"
  | "onFailure"
  | "fallback"
  | "layer"
  | "command"
  | "subscription"
  | "mount"
  | "head"
  | "send"
  | "shares"
  | "shared"

/** @internal */
export interface Env {
  ctx: Context.Context<any> | undefined
  cause: Cause.Cause<unknown> | undefined
  readonly waiting: Array<() => void>
  /** The Env whose services work runs against once this one's Layer failed and the failure was handled. */
  readonly parent?: Env | undefined
}

/**
 * What a mount records into, if it was given one: a draft per entry, and `rendering` and `rendered`
 * around each dirty instance's render, which are not entries. Returns the entry's number, if it has one.
 *
 * @internal
 */
export type Recorder = (
  inst: Instance,
  draft: { readonly _tag: string; readonly [field: string]: unknown }
) => number | undefined | void

/**
 * Where an issued Command, or a Command of `init`, came from: the number of the entry that logged it,
 * and its index there.
 *
 * @internal
 */
export interface Issued {
  readonly seq: number
  readonly index: number
}

/**
 * What a Command carries to run itself, so the kernel runs one without importing what runs it.
 *
 * @internal
 */
export interface Issuable {
  /** `seq` is the number of the entry that logged it, if the tree records a log, and `index` its index there. */
  readonly "~run": (
    inst: Instance,
    seq: number | undefined | void,
    index: number
  ) => void
}

/**
 * An instance's Command runs, once it has issued one: what `h.isRunning` and a root's `pending` read.
 *
 * @internal
 */
export interface Runs {
  readonly running: (name: string, groupKey: string | undefined) => boolean
  readonly pending: () => ReadonlyArray<
    { readonly name: string; readonly status: string }
  >
}

/**
 * The kernel's functions a Command's runner and a Subscription's call, reached through the tree so they
 * never import the kernel: an app on another runtime that makes a Command doesn't carry the kernel.
 *
 * @internal
 */
export interface Ops {
  readonly send: typeof send
  readonly fail: typeof fail
  readonly markDirty: typeof markDirty
  readonly renderAbove: typeof renderAbove
  readonly clear: typeof clear
  readonly flush: typeof flush
  readonly mountChild: typeof mountChild
  readonly patchChild: typeof patchChild
  readonly replace: typeof replace
  readonly create: typeof create
  readonly place: typeof place
  readonly unplace: typeof unplace
  readonly release: typeof release
  readonly close: typeof close
  readonly nodeOf: typeof nodeOf
  readonly stand: typeof stand
}

/** @internal */
export interface Tree {
  readonly ops: Ops
  readonly host: Host
  readonly report: (
    path: string,
    where: FailedIn,
    cause: Cause.Cause<unknown>
  ) => void
  readonly init: (inst: Instance) => Next
  readonly log: Recorder | undefined
  readonly fallback:
    | ((cause: Cause.Cause<unknown>) => View.Node<any, any>)
    | undefined
  readonly schedule: (task: () => void) => void
  /**
   * Returns how to run something later as what follows from the fact running now, or, outside one, as a
   * fact of its own: for what reaches the tree from a fiber. Without it, it runs as it is. `late`: a step
   * that has no entry yet follows from its first.
   */
  readonly follow: ((late?: boolean) => <A>(f: () => A) => A) | undefined
  /** The fibers the tree's close waits for, until they exit, once a feature has started one. */
  owned?: Set<Fiber.Fiber<unknown, unknown>> | undefined
  /** The provided Layer builds still pending, each with the flush it began in. */
  building?: Set<{ readonly flush: number }> | undefined
  /** The flush a build that begins now belongs to. Without it, the first. */
  flush?: (() => number) | undefined
  /** How many provided Layer builds have begun, and the number of the last one that failed. */
  builds?: number | undefined
  failedBuild?: number | undefined
  /** Called once the tree's query cache is made. */
  cached?: (() => void) | undefined
  /** Told of each watch an instance registers, while something records them. */
  watched?:
    | ((inst: Instance, query: string, argsKey: string) => void)
    | undefined
  /** Told of each kept child as it's kept off the page, and as it's drawn again, wherever that is. */
  drawn?: ((inst: Instance, drawn: boolean) => void) | undefined
  /** Told of each kept child an `h.keepAlive` predicate ends, by its author and its path. */
  ended?: ((author: Instance, path: string) => void) | undefined
  /**
   * A feature's work in a flush, called before each render pass, and with `idle` once nothing is left to
   * render. Returns whether it did something, which may have more to render.
   */
  work?: ((idle: boolean) => boolean) | undefined
  /** Called once the flush running or scheduled commits, or at once when none is. */
  committed?: Array<() => void> | undefined
  /** The folded head and its title, once an instance that declares a head has mounted. */
  head?:
    | { readonly value: unknown; readonly title: string | undefined }
    | undefined
  transitions?: Transitions | undefined
  shared?: unknown
  dirty: Array<Instance>
  scheduled: boolean
  flushing: boolean
  closed: boolean
}

/** @internal */
export class Rec {
  v: View.Node<any, any>
  node: any
  kids: Array<Rec> | undefined
  inst: Instance
  constructor(
    v: View.Node<any, any>,
    node: unknown,
    kids: Array<Rec> | undefined,
    inst: Instance
  ) {
    this.v = v
    this.node = node
    this.kids = kids
    this.inst = inst
  }
}

/** @internal */
export class Instance {
  readonly tree: Tree
  readonly component: Runnable
  readonly parent: Instance | undefined
  readonly at: Rec | undefined
  /** The path of the slot or headless view it's drawn in, if any: a kept child's changes as it's drawn again. */
  under: string | undefined
  readonly depth: number
  props: unknown
  env: Env
  model: unknown = undefined
  rendered: Rec | undefined = undefined
  dirty = false
  closed = false
  failure: Cause.Cause<unknown> | undefined = undefined
  live = 0
  lazy: unknown = undefined
  placed: Map<string, Placed> | undefined = undefined
  closers: Array<() => void> | undefined = undefined
  // Set by what runs its Commands, once it issues one.
  declare runs: Runs | undefined
  /** The query results, set by what runs its queries. */
  declare results: unknown
  /** Set by a keyed provide: takes `go` and returns `true` when work must wait for the next read of its keys. */
  declare hold: ((go: () => void) => boolean) | undefined
  /** What stops the work started against `env`, when a keyed provide replaces it, adding the fibers still exiting. */
  declare swaps:
    | Array<(waits: Array<Fiber.Fiber<unknown, unknown>>) => void>
    | undefined
  declare look: ((owner: any, optional?: boolean) => unknown) | undefined
  declare owning: unknown
  declare reading: unknown
  /** The keep-alive children the instance's views wrote, once they wrote one: told once each view is patched. */
  declare kept: { readonly done: () => void } | undefined
  /** How many of the views it authors are being made or patched now. */
  writing = 0
  named: string | undefined = undefined
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
    this.under = slot
    this.depth = parent === undefined ? 0 : parent.depth + 1
    this.props = props
    this.env = env
  }
  get path(): string {
    if (this.named !== undefined) return this.named
    const at = this.at
    if (at === undefined) {
      return this.named = "/" + this.component.definition.name
    }
    const view = at.v as View.Child<any, any>
    // A keep-alive child's path is under its author, wherever it's drawn.
    return this.named =
      (view.alive === undefined && this.under || this.parent!.path) + "/" +
      segmentOf(view.component, view.key)
  }
  fire(
    handler: unknown,
    payload: unknown,
    source: unknown,
    where: FailedIn = "event"
  ): boolean {
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

let slot: string | undefined
let busy = 0
let receiving: Instance | undefined
let shown = 0
const born: Array<Instance | Rec> = []
// The instance whose feature slot's fallback is being made: what it places resolves from the nearest Env
// with services.
let fallen: Instance | undefined

/** Recorded before a dirty instance renders, so a log can name what made it dirty. @internal */
export const rendering = { _tag: "Render" } as const

/** Recorded after it rendered. @internal */
export const rendered = { _tag: "Rendered" } as const

/** @internal */
export const notPorted = (feature: string): never => {
  throw new Error("not ported yet: " + feature)
}

const emptyText = View.text("")

const fallbackOf = (
  owner: Instance,
  view: View.Child<any, any>,
  cause: Cause.Cause<unknown> | undefined
): View.Node<any, any> => {
  const fallback = view.fallback
  if (dev) shown++
  if (fallback === undefined) return emptyText
  try {
    return View.children([
      fallback(
        (cause === undefined
          ? AsyncResult.initial(true)
          : AsyncResult.failure(cause)) as any
      )
    ])[0] ?? emptyText
  } catch (error) {
    owner.tree.schedule(() => fail(owner, "fallback", Cause.die(error)))
    return emptyText
  }
}

/** Makes a feature slot's fallback. One that throws fails an instance, so `fallen` needs no restoring then. */
const inFallback = <A>(owner: Instance, f: () => A): A => {
  const outer = fallen
  fallen = owner
  const out = f()
  fallen = outer
  return out
}

const rootFallback = (
  inst: Instance,
  cause: Cause.Cause<unknown>
): View.Node<any, any> => {
  const tree = inst.tree
  try {
    return tree.fallback?.(cause) ?? emptyText
  } catch (error) {
    const failure = Cause.die(error)
    tree.log?.(inst, {
      _tag: "Failed",
      props: inst.props,
      in: "fallback",
      cause: failure
    })
    tree.report(inst.path, "fallback", failure)
    return emptyText
  }
}

const stand = (inst: Instance, cause: Cause.Cause<unknown>): Rec => {
  const parent = inst.parent
  const outer = slot
  const from = born.length
  slot = inst.under
  try {
    return parent === undefined
      ? create(inst, rootFallback(inst, cause))
      : create(
        parent,
        fallbackOf(parent, inst.at!.v as View.Child<any, any>, cause)
      )
  } catch (error) {
    orphans(from)
    inst.tree.report(inst.path, "fallback", Cause.die(error))
    return create(inst, emptyText)
  } finally {
    slot = outer
  }
}

/** @internal */
export const fail = (
  inst: Instance,
  where: FailedIn,
  cause: Cause.Cause<unknown>,
  update?: { readonly message: unknown; readonly source: unknown },
  from?: number,
  name?: string,
  issued?: Issued
): void => {
  if (inst.closed) return
  const tree = inst.tree
  const log = tree.log
  if (log !== undefined) {
    log(inst, {
      _tag: "Failed",
      props: inst.props,
      in: where,
      name,
      cause,
      update,
      issued
    })
  }
  inst.failure = cause
  const old = inst.rendered
  const path = inst.path
  close(inst)
  if (from !== undefined) orphans(from)
  const at = inst.at
  if (old !== undefined) {
    const host = tree.host
    const first = nodeOf(old)
    const parentNode = host.parentOf(first)
    const fallback = stand(inst, cause)
    if (parentNode != null) {
      place(host, parentNode, fallback, first)
      unplace(host, parentNode, old)
    }
    if (at === undefined) inst.rendered = fallback
    else {
      inst.rendered = undefined
      at.kids = [fallback]
      if (dev) tree.schedule(() => recheck(inst.parent!))
    }
  }
  const onFailure = at === undefined
    ? undefined
    : (at.v as View.Child<any, any>).onFailure
  if (onFailure !== undefined) {
    const parent = upOf(inst)
    tree.schedule(() =>
      parent.fire(onFailure, AsyncResult.failure(cause), inst, "onFailure")
    )
  }
  tree.report(path, where, cause)
}

const upOf = (inst: Instance): Instance =>
  ((inst.at!.v as View.Child<any, any>).owner as Instance | undefined) ??
    inst.parent!

const recheckPlaced = (author: Instance): void => {
  try {
    checkPlaced(author)
  } catch (error) {
    fail(author, "view", Cause.die(error))
  }
}

const recheck = (inst: Instance): void => {
  if (inst.closed || inst.rendered === undefined) return
  try {
    checkShown(inst.path, [inst.rendered])
  } catch (error) {
    fail(inst, "view", Cause.die(error))
  }
}

const orphans = (from: number): void => {
  for (let index = from; index < born.length; index += 2) {
    release(born[index] as Instance, born[index + 1] as Rec)
  }
  born.length = from
}

/** @internal */
export const send = (
  inst: Instance,
  message: unknown,
  source?: unknown
): void => {
  const transitions = inst.tree.transitions
  if (transitions?.waits(inst)) {
    return transitions.wait(() => send(inst, message, source))
  }
  renderAbove(inst)
  if (inst.closed) return
  let next: Next | undefined
  try {
    next = inst.component.update(
      inst.model,
      message as never,
      inst.props,
      inst.results,
      inst.look
    )
  } catch (error) {
    return fail(inst, "update", Cause.die(error), { message, source })
  }
  if (next === undefined) return
  // Without a log, the draft isn't built.
  const seq = inst.tree.log?.(inst, {
    _tag: "Update",
    source,
    message,
    props: inst.props,
    model: next.model,
    commands: next.commands,
    events: next.events,
    lists: next.lists,
    sends: next.sends,
    viewTransition: next.viewTransition
  })
  if (next.model !== inst.model) {
    inst.model = next.model
    markDirty(inst)
  }
  if (next.viewTransition !== undefined) {
    transitions?.request(next.viewTransition)
  }
  apply(inst, next, seq)
}

const apply = (
  inst: Instance,
  next: Next,
  seq: number | undefined | void
): void => {
  issueAll(inst, next, seq)
  applied(inst, next, seq)
}

const issueAll = (
  inst: Instance,
  next: Next,
  seq: number | undefined | void
): void => {
  const commands = next.commands
  for (let index = 0; index < commands.length; index++) {
    if (inst.closed) return
    ;(commands[index] as Issuable)["~run"](inst, seq, index)
  }
}

/** What follows a Next once its Commands are issued: Subscriptions follow it, and its events are emitted. */
const applied = (
  inst: Instance,
  next: Next,
  seq: number | undefined | void
): void => {
  if (inst.closed) return
  inst.component["~sync"]?.(inst, next, seq)
  const events = next.events
  if (events.length === 0 || inst.at === undefined) return
  const parent = upOf(inst)
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

const markDirty = (inst: Instance): void => {
  if (inst.dirty) return
  inst.dirty = true
  const tree = inst.tree
  tree.dirty.push(inst)
  if (!tree.scheduled) {
    tree.scheduled = true
    tree.schedule(() => flush(tree))
  }
}

const byDepth = (a: Instance, b: Instance): number => a.depth - b.depth

const renderAbove = (inst: Instance): void => {
  if (busy > 0 || inst.tree.dirty.length === 0) return
  const above: Array<Instance> = []
  let top = -1
  for (let at = inst.parent; at !== undefined; at = at.parent) {
    if (at.dirty) top = above.length
    above.push(at)
  }
  if (top < 0) return
  const outer = receiving
  receiving = inst
  try {
    for (let index = top; index >= 0; index--) {
      const next = above[index]!
      if (next.closed) return
      if (next.dirty) renderDirty(next)
    }
  } finally {
    receiving = outer
  }
}

const renderDirty = (inst: Instance): void => {
  const log = inst.tree.log
  if (log !== undefined) log(inst, rendering)
  render(inst)
  if (log !== undefined) log(inst, rendered)
}

/** @internal */
export const flush = (tree: Tree): void => {
  tree.scheduled = true
  tree.flushing = true
  for (;;) {
    if (tree.closed) return
    if (tree.transitions?.hold()) {
      tree.flushing = false
      return
    }
    const batch = tree.dirty
    if (tree.work?.(batch.length === 0)) continue
    if (batch.length === 0) break
    tree.dirty = []
    if (batch.length > 1) batch.sort(byDepth)
    for (let index = 0; index < batch.length; index++) {
      const inst = batch[index]!
      if (inst.dirty && !inst.closed) renderDirty(inst)
    }
  }
  tree.scheduled = tree.flushing = false
  tree.host.commit?.()
  const committed = tree.committed
  if (committed !== undefined) {
    tree.committed = undefined
    for (let index = 0; index < committed.length; index++) committed[index]!()
  }
}

const viewOf = (inst: Instance): View.Node<any, any> | undefined => {
  const component = inst.component
  const view = component.view ?? component["~content"]!
  try {
    const tree: View.Node<any, any> | undefined = Reflect.apply(
      view,
      component,
      [
        inst.model,
        inst.props,
        inst.runs?.running,
        inst.results,
        View.takesPathSource(view) ? inst : inst.path,
        inst.look,
        inst
      ]
    )
    if (dev && tree !== undefined) {
      const author = checkPaths(inst, tree)
      if (author !== undefined) inst.tree.schedule(() => recheckPlaced(author))
    }
    return tree
  } catch (error) {
    fail(inst, "view", Cause.die(error))
    return undefined
  }
}

const check = (component: any): void => {
  if (component.init === undefined) notPorted("Component.lazy")
}

const authorOf = (inst: Instance): Instance =>
  inst.at !== undefined &&
    (inst.at.v as View.Child<any, any>).view !== undefined
    ? inst.parent!
    : inst

const start = (inst: Instance): Rec | undefined => {
  let first: Next
  const component = inst.component
  const outer = slot
  const from = born.length
  const fallbacks = shown
  const by = authorOf(inst)
  slot = by === inst ? undefined : inst.path
  busy++
  try {
    try {
      check(component)
      first = inst.tree.init(inst)
    } catch (error) {
      fail(inst, "init", Cause.die(error))
      return undefined
    }
    inst.model = first.model
    const seq = inst.tree.log?.(inst, {
      _tag: "Mounted",
      props: inst.props,
      model: first.model,
      commands: first.commands,
      events: first.events,
      adopted: false
    })
    component.boot?.(inst)
    // `init`'s Commands are issued before the first view, so it shows them running: the redraw they
    // ask for is already done by it.
    issueAll(inst, first, seq)
    component["~first"]?.(inst)
    if (inst.closed) return undefined
    inst.dirty = false
    const tree = viewOf(inst)
    if (tree === undefined) return undefined
    let rendered: Rec
    by.writing++
    try {
      rendered = create(by, tree)
      if (dev && shown !== fallbacks) checkShown(inst.path, [rendered])
    } catch (error) {
      fail(inst, "view", Cause.die(error), undefined, from)
      return undefined
    } finally {
      by.writing--
    }
    if (inst.closed) {
      release(inst, rendered)
      return undefined
    }
    inst.rendered = rendered
    inst.kept?.done()
    applied(inst, first, seq)
    return rendered
  } finally {
    busy--
    born.length = from
    slot = outer
  }
}

const render = (inst: Instance): void => {
  inst.dirty = false
  const outer = slot
  const from = born.length
  const fallbacks = shown
  const by = authorOf(inst)
  slot = by === inst ? undefined : inst.path
  busy++
  by.writing++
  try {
    inst.component["~render"]?.(inst)
    const tree = viewOf(inst)
    if (tree === undefined) return
    inst.rendered = patch(by, inst.rendered!, tree)
    inst.kept?.done()
    if (dev && shown !== fallbacks) checkShown(inst.path, [inst.rendered])
  } catch (error) {
    fail(inst, "view", Cause.die(error), undefined, from)
  } finally {
    busy--
    by.writing--
    born.length = from
    slot = outer
  }
}

const clear = (inst: Instance): void => {
  inst.rendered = patch(authorOf(inst), inst.rendered!, emptyText)
}

const close = (inst: Instance): void => {
  if (inst.closed) return
  inst.closed = true
  inst.lazy = undefined
  if (inst.parent !== undefined) inst.parent.live--
  const by = authorOf(inst)
  if (inst.rendered !== undefined && by.live > 0) release(by, inst.rendered)
  const log = inst.tree.log
  if (log !== undefined) log(inst, { _tag: "Unmounted" })
  const closers = inst.closers
  if (closers !== undefined) {
    for (let index = closers.length - 1; index >= 0; index--) {
      closers[index]!()
    }
  }
}

const released = undefined as unknown as Instance

const release = (owner: Instance, rec: Rec): void => {
  if (owner.live === 0) return
  const view = rec.v
  const kids = rec.kids
  if (view._tag === "Child") {
    if (keeperOf(view)?.release(owner, rec)) return
    if (kids === undefined) return close(rec.inst)
    if (rec.inst === owner) {
      owner.live--
      rec.inst = released
    }
  } else if (view._tag === "Element") {
    if (view.mount !== undefined) {
      owner.live--
      ;(view.mount as unknown as Attachable)["~detach"](rec)
    }
  } else if (view._tag === "Outlet") {
    if (rec.inst !== owner) return
    rec.inst = released
    owner.live--
    if (owner.placed!.get(view.name)?.rec === rec) {
      owner.placed!.delete(view.name)
    }
    owner = owner.parent!
  }
  // Newest first, as siblings close.
  if (kids !== undefined) {
    for (let index = kids.length - 1; index >= 0; index--) {
      release(owner, kids[index]!)
    }
  }
}

const nodeOf = (rec: Rec): any => {
  while (rec.node === undefined) {
    rec = rec.kids !== undefined
      ? rec.kids[0]!
      : rec.inst.rendered!
  }
  return rec.node
}

const lastNodeOf = (rec: Rec): any => {
  while (rec.node === undefined) {
    rec = rec.kids !== undefined
      ? rec.kids[rec.kids.length - 1]!
      : rec.inst.rendered!
  }
  return rec.node
}

const place = (
  host: Host,
  parent: unknown,
  rec: Rec,
  before: unknown
): void => {
  if (rec.node !== undefined) host.insert(parent, rec.node, before)
  else if (rec.kids === undefined) {
    place(host, parent, rec.inst.rendered!, before)
  } else {for (let index = 0; index < rec.kids.length; index++) {
      place(host, parent, rec.kids[index]!, before)
    }}
}

/**
 * Releases `rec`, then takes its nodes out: a handler the removal sets off, as a focusout, finds the
 * instances it closed closed. The nodes are read first, as a release can change the Recs.
 */
const remove = (inst: Instance, parent: unknown, rec: Rec): void => {
  const nodes = nodesOf(rec, [])
  release(inst, rec)
  unplaceAll(inst.tree.host, parent, nodes)
}

const nodesOf = (rec: Rec, out: Array<unknown>): Array<unknown> => {
  if (rec.node !== undefined) out.push(rec.node)
  else if (rec.kids === undefined) nodesOf(rec.inst.rendered!, out)
  else {for (let index = 0; index < rec.kids.length; index++) {
      nodesOf(rec.kids[index]!, out)
    }}
  return out
}

const unplaceAll = (
  host: Host,
  parent: unknown,
  nodes: ReadonlyArray<unknown>
): void => {
  for (let index = 0; index < nodes.length; index++) {
    host.remove(parent, nodes[index])
  }
}

const unplace = (host: Host, parent: unknown, rec: Rec): void =>
  unplaceAll(host, parent, nodesOf(rec, []))

const keeperOf = (view: View.Child<any, any>): Keeper | undefined =>
  view.alive === undefined
    ? undefined
    : (view.component as Partial<Runnable>)["~kept"]

const mountChild = (owner: Instance, rec: Rec, fresh?: boolean): void => {
  const view = rec.v as View.Child<any, any>
  let component = view.component as any
  if (!fresh) {
    const keeper = keeperOf(view)
    if (keeper !== undefined) return keeper.mount(owner, rec, slot)
  }
  let env = owner.env
  if (owner === fallen) {
    while (env.ctx === undefined && env.parent !== undefined) {
      env = env.parent
    }
  }
  const at = slot
  let held: Rec | undefined
  const lazy = component["~load"] !== undefined
  if (lazy) component = component["~load"](owner, rec, at) ?? component
  if (lazy && component === view.component) {
    held = inFallback(
      owner,
      () => create(owner, fallbackOf(owner, view, component["~cause"]()))
    )
  } else if (FeatureId in component) {
    const ctx = env.ctx
    if (ctx === undefined) {
      if (view.fallback === undefined) {
        throw new Error(
          owner.path + ": " + component.key +
            " isn't available, because a Layer above it is still building or failed. Pass `fallback`."
        )
      }
      held = inFallback(
        owner,
        () => create(owner, fallbackOf(owner, view, env.cause))
      )
      if (env.cause === undefined) {
        env.waiting.push(() => settle(owner, rec, at))
      }
    } else {
      const found = Context.getOrUndefined(ctx, component) as any
      if (found === undefined) {
        throw new Error(owner.path + ": nothing provides " + component.key)
      }
      component = found.component
      env = {
        ctx: Context.merge(ctx, found.context),
        cause: undefined,
        waiting: []
      }
    }
  } else if (owner.tree.host.hold?.(owner, rec, at)) {
    held = create(owner, emptyText)
  }
  const child = rec.inst = held === undefined
    ? new Instance(owner.tree, component, owner, rec, view.props, env)
    : owner
  owner.live++
  born.push(owner, rec)
  if (held !== undefined) rec.kids = [held]
  else if (start(child) === undefined) rec.kids = [stand(child, child.failure!)]
  else if (owner.closed) close(child)
}

/** @internal */
export const settle = (
  owner: Instance,
  rec: Rec,
  at: string | undefined
): void => {
  if (rec.inst !== owner || owner.closed) return
  const host = owner.tree.host
  const old = rec.kids![0]!
  const outer = slot
  slot = at
  try {
    if (
      owner.env.ctx === undefined &&
      FeatureId in (rec.v as View.Child<any, any>).component
    ) {
      rec.kids![0] = inFallback(
        owner,
        () =>
          patch(
            owner,
            old,
            fallbackOf(owner, rec.v as View.Child<any, any>, owner.env.cause)
          )
      )
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
  } finally {
    slot = outer
  }
}

const noContent: ReadonlyArray<View.Node<any, any>> = [emptyText]

const contentOf = (
  view: View.Outlet,
  content: unknown
): ReadonlyArray<View.Node<any, any>> => {
  if (content === undefined) return noContent
  let views = View.children([content as View.Input<any, any>])
  if (views.length === 0) return noContent
  const noText = view.noText
  if (noText !== undefined) {
    views = views.map((node) => {
      if (node._tag === "Text") throw new Error(slot + ": " + noText)
      return node._tag === "Outlet" && node.noText !== noText
        ? { _tag: "Outlet", name: node.name, noText }
        : node
    })
  }
  if (dev) checkContent(slot!, views)
  return views
}

const failLater = (inst: Instance, error: unknown): void =>
  inst.tree.schedule(() => fail(inst, "view", Cause.die(error)))

const slotOf = (receiver: Instance, name: string): unknown =>
  receiver.at === undefined
    ? undefined
    : (receiver.at.v as View.Child<any, any>).slots?.[name]

const refresh = (receiver: Instance, placed: Placed): void => {
  const rec = placed.rec
  const view = rec.v as View.Outlet
  const content = slotOf(receiver, view.name)
  if (content === placed.content) return
  placed.content = content
  const declarer = receiver.parent!
  const host = receiver.tree.host
  const olds = rec.kids!
  const after = host.nextOf(lastNodeOf(olds[olds.length - 1]!))
  const outer = slot
  const fallbacks = shown
  slot = receiver.path + "/" + slotSegment(view.name)
  try {
    let views = noContent
    try {
      views = contentOf(view, content)
    } catch (error) {
      failLater(declarer, error)
    }
    const kids = rec.kids = patchList(
      declarer,
      host.parentOf(nodeOf(olds[0]!)),
      olds,
      views,
      after
    )
    if (dev && shown !== fallbacks) {
      try {
        checkShown(slot, kids)
      } catch (error) {
        failLater(declarer, error)
      }
    }
  } finally {
    slot = outer
  }
}

const setAttrs = (
  host: Host,
  node: unknown,
  attrs: Readonly<Record<string, string>>
): void => {
  if (host.normalizeAttrs !== undefined) {
    attrs = host.normalizeAttrs(node, attrs)
  }
  for (const name in attrs) host.setAttr(node, name, attrs[name])
}

const setProps = (
  host: Host,
  node: unknown,
  props: Readonly<Record<string, unknown>>
): void => {
  for (const name in props) host.setProp(node, name, props[name])
}

const create = (inst: Instance, view: View.Node<any, any>): Rec => {
  const host = inst.tree.host
  switch (view._tag) {
    case "Text":
      return new Rec(view, host.createText(view.text), undefined, inst)
    case "Element": {
      if (view.owned?.length) view = owned(inst, view, view.owned)
      const node = host.createElement(view.tag)
      if (view.attrs !== View.noFields) setAttrs(host, node, view.attrs)
      const views = view.children
      let kids: Array<Rec> | undefined
      if (dev && views.length > 1) checkKeys(inst.path, views)
      if (views.length > 0) {
        kids = new Array(views.length)
        for (let index = 0; index < views.length; index++) {
          place(host, node, kids[index] = create(inst, views[index]!), null)
        }
      }
      if (view.props !== View.noFields) setProps(host, node, view.props)
      const rec = new Rec(view, node, kids, inst)
      if (
        view.handlers !== View.noFields || view.eventOptions !== View.noFields
      ) host.setEvents(node, rec, true)
      if (view.mount !== undefined) {
        inst.live++
        ;(view.mount as unknown as Attachable)["~attach"](rec)
      }
      return rec
    }
    case "Child": {
      const rec = new Rec(view, undefined, undefined, inst)
      mountChild(inst, rec)
      return rec
    }
    case "Outlet":
      return createOutlet(inst, view)
  }
}

const createOutlet = (inst: Instance, view: View.Outlet): Rec => {
  const declarer = inst.parent
  if (declarer === undefined) {
    throw new Error(
      inst.path + " places the slot " + view.name + ", and is a root"
    )
  }
  const content = slotOf(inst, view.name)
  const rec = new Rec(view, undefined, undefined, inst)
  inst.live++
  ;(inst.placed ??= new Map()).set(view.name, { rec, content })
  const outer = slot
  const from = born.length
  const fallbacks = shown
  slot = inst.path + "/" + slotSegment(view.name)
  try {
    const views = contentOf(view, content)
    const kids: Array<Rec> = rec.kids = new Array(views.length)
    for (let index = 0; index < views.length; index++) {
      kids[index] = create(declarer, views[index]!)
    }
    if (dev && shown !== fallbacks) checkShown(slot, kids)
  } catch (error) {
    orphans(from)
    rec.kids = [create(declarer, emptyText)]
    failLater(declarer, error)
  } finally {
    slot = outer
  }
  return rec
}

const pairs = (
  old: View.Node<any, any>,
  view: View.Node<any, any>
): boolean => {
  if (old === view) return true
  switch (old._tag) {
    case "Element":
      return view._tag === "Element" && old.tag === view.tag &&
        old.elementKey === view.elementKey
    case "Text":
      return view._tag === "Text"
    case "Child":
      return view._tag === "Child" && old.component === view.component &&
        old.key === view.key
    case "Outlet":
      return view._tag === "Outlet" && old.name === view.name
  }
}

const patch = (inst: Instance, old: Rec, view: View.Node<any, any>): Rec => {
  const prev = old.v
  if (prev === view) {
    if (inst.tree.host.controlled !== undefined && view._tag === "Element") {
      restore(inst.tree.host, old)
    }
    return old
  }
  if (!pairs(prev, view)) return replace(inst, old, view)
  switch (view._tag) {
    case "Text":
      if ((prev as View.Text).text !== view.text) {
        inst.tree.host.setText(old.node, view.text)
      }
      old.v = view
      return old
    case "Element":
      patchElement(inst, old, prev as View.Element<any, any>, view)
      return old
    case "Child":
      return keeperOf(view)?.patch(inst, old, view) ??
        patchChild(inst, old, view)
    case "Outlet": {
      const placed = inst.placed!.get(view.name)
      if (placed?.rec !== old) return old
      if ((prev as View.Outlet).noText !== view.noText) {
        placed.content = refreshed
      }
      old.v = view
      refresh(inst, placed)
      return old
    }
  }
}

const patchChild = (
  inst: Instance,
  old: Rec,
  view: View.Child<any, any>
): Rec => {
  const child = old.inst
  old.v = view
  const shown = old.kids
  if (shown !== undefined) {
    shown[0] = child === inst
      ? inFallback(
        inst,
        () =>
          patch(
            inst,
            shown[0]!,
            fallbackOf(
              inst,
              view,
              (view.component as Runnable)["~cause"]?.() ?? inst.env.cause
            )
          )
      )
      : patch(inst, shown[0]!, fallbackOf(inst, view, child.failure))
    return old
  }
  if (child.closed) return old
  const changed = !propsEqual(child.props, view.props)
  if (changed) {
    child.props = view.props
    const log = inst.tree.log
    if (log !== undefined) {
      log(child, { _tag: "PropsChanged", props: view.props })
    }
    child.component["~sync"]?.(child)
    if (child.closed) return old
  }
  if (changed || view.view !== undefined) {
    if (child === receiving) markDirty(child)
    else render(child)
  }
  const placed = child.placed
  if (placed !== undefined && !child.closed) {
    for (const entry of placed.values()) {
      refresh(child, entry)
    }
  }
  return old
}

const replace = (inst: Instance, old: Rec, view: View.Node<any, any>): Rec => {
  const host = inst.tree.host
  const at = nodeOf(old)
  const parent = host.parentOf(at)
  const next = create(inst, view)
  place(host, parent, next, at)
  remove(inst, parent, old)
  return next
}

const refreshed = {}

const restore = (host: Host, rec: Rec): void => {
  const kids = rec.kids
  if (kids !== undefined) {
    for (let index = 0; index < kids.length; index++) {
      const kid = kids[index]!
      if (kid.v._tag === "Element") restore(host, kid)
    }
  }
  const props = (rec.v as View.Element<any, any>).props
  if (props !== View.noFields) patchProps(host, rec.node, props, props)
}

const sameAttrs = (
  before: Readonly<Record<string, string>>,
  attrs: Readonly<Record<string, string>>
): boolean => {
  let count = 0
  for (const name in before) {
    if (before[name] !== attrs[name]) return false
    count++
  }
  for (const _ in attrs) count--
  return count === 0
}

const patchAttrs = (
  host: Host,
  node: unknown,
  before: Readonly<Record<string, string>>,
  attrs: Readonly<Record<string, string>>
): void => {
  if (sameAttrs(before, attrs)) return
  if (host.normalizeAttrs !== undefined) {
    before = host.normalizeAttrs(node, before)
    attrs = host.normalizeAttrs(node, attrs)
  }
  for (const name in before) {
    if (typeof attrs[name] !== "string") {
      host.setAttr(node, name, undefined, before[name])
    }
  }
  for (const name in attrs) {
    const value = attrs[name]
    const previous = before[name]
    if (previous !== value) host.setAttr(node, name, value, previous)
  }
}

const patchProps = (
  host: Host,
  node: unknown,
  was: Readonly<Record<string, unknown>>,
  props: Readonly<Record<string, unknown>>
): void => {
  const controlled = host.controlled
  for (const name in was) {
    if (!(name in props)) host.setProp(node, name, undefined)
  }
  for (const name in props) {
    if (was[name] !== props[name] || controlled?.has(name) === true) {
      host.setProp(node, name, props[name])
    }
  }
}

const patchElement = (
  inst: Instance,
  rec: Rec,
  prev: View.Element<any, any>,
  view: View.Element<any, any>
): void => {
  const host = inst.tree.host
  const node = rec.node
  // A part's layers dropped since the last render still have their owner's mounts to stop.
  const layers = view.owned?.length ? view.owned : prev.owned
  if (layers?.length) view = owned(inst, view, layers)
  rec.v = view
  if (prev.attrs !== view.attrs) patchAttrs(host, node, prev.attrs, view.attrs)
  if (
    view.handlers !== prev.handlers || view.eventOptions !== prev.eventOptions
  ) {
    host.setEvents(
      node,
      rec,
      prev.handlers === View.noFields && prev.eventOptions === View.noFields
    )
  }
  const mount = view.mount as unknown as Attachable | undefined
  const was = prev.mount as unknown as Attachable | undefined
  if (mount !== was) {
    if (mount === undefined) {
      inst.live--
      was!["~detach"](rec)
    } else {
      if (was === undefined) inst.live++
      mount["~attach"](rec)
    }
  }
  const views = view.children
  const olds = rec.kids
  if (dev && views.length > 1) checkKeys(inst.path, views)
  if (olds === undefined) {
    if (views.length > 0) {
      const kids: Array<Rec> = new Array(views.length)
      for (let index = 0; index < views.length; index++) {
        place(host, node, kids[index] = create(inst, views[index]!), null)
      }
      rec.kids = kids
    }
  } else if (views.length === 0) {
    for (let index = 0; index < olds.length; index++) {
      release(inst, olds[index]!)
    }
    if (host.clear !== undefined) host.clear(node)
    else {for (let index = 0; index < olds.length; index++) {
        unplace(host, node, olds[index]!)
      }}
    rec.kids = undefined
  } else if (views.length === 1 && olds.length === 1) {
    const old = olds[0]!
    const next = views[0]!
    if (next._tag === "Element" && old.v !== next && pairs(old.v, next)) {
      patchElement(inst, old, old.v as View.Element<any, any>, next)
    } else olds[0] = patch(inst, old, next)
  } else rec.kids = patchList(inst, node, olds, views, null)
  // After the children, so a select's value wins over its options'.
  if (
    prev.props !== view.props ||
    (host.controlled !== undefined && view.props !== View.noFields)
  ) {
    patchProps(host, node, prev.props, view.props)
  }
}

const owned = (
  inst: Instance,
  view: View.Element<any, any>,
  layers: ReadonlyArray<View.Owned>
): View.Element<any, any> =>
  (layers[0]!.owner as Instance).component["~owned"]!(inst, view)

const keyOf = (view: View.Node<any, any>): unknown =>
  view._tag === "Element"
    ? view.elementKey
    : view._tag === "Child"
    ? (view.key === "" ? view.component : view.key)
    : undefined

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
  while (
    start <= oldEnd && start <= end && pairs(olds[start]!.v, views[start]!)
  ) {
    out[start] = patch(inst, olds[start]!, views[start]!)
    start++
  }
  // An unkeyed node matches by its position from the start, so the end pairs by position only when the
  // count stays.
  while (
    start <= oldEnd && start <= end &&
    (olds.length === views.length || keyOf(views[end]!) !== undefined) &&
    pairs(olds[oldEnd]!.v, views[end]!)
  ) {
    oldEnd--
    end--
  }
  const count = end - start + 1
  const sources = new Int32Array(count)
  // Each key's first view, and after each view the next with its key: an element's key can be a child's,
  // or another tag's.
  let byKey: Map<unknown, number> | undefined
  let same: Int32Array | undefined
  for (let index = end; index >= start; index--) {
    const key = keyOf(views[index]!)
    if (key === undefined) continue
    const next = (byKey ??= new Map()).get(key)
    if (next !== undefined) {
      ;(same ??= new Int32Array(count))[index - start] = next + 1
    }
    byKey.set(key, index)
  }
  let moved = false
  let last = 0
  let gone: Array<Rec> | undefined
  for (let index = start; index <= oldEnd; index++) {
    const old = olds[index]!
    const key = keyOf(old.v)
    let to = key !== undefined
      ? byKey?.get(key)
      : index <= end
      ? index
      : undefined
    while (
      to !== undefined &&
      (sources[to - start] !== 0 || !pairs(old.v, views[to]!))
    ) {
      const next = key === undefined || same === undefined
        ? 0
        : same[to - start]!
      to = next === 0 ? undefined : next - 1
    }
    if (to !== undefined) {
      sources[to - start] = index + 1
      if (to < last) moved = true
      else last = to
    } else (gone ??= []).push(old)
  }
  for (let index = start; index <= end; index++) {
    const source = sources[index - start]!
    out[index] = source === 0
      ? create(inst, views[index]!)
      : patch(inst, olds[source - 1]!, views[index]!)
  }
  if (gone !== undefined) { for (const old of gone) remove(inst, parent, old) }
  for (let index = end + 1; index < views.length; index++) {
    out[index] = patch(
      inst,
      olds[index + olds.length - views.length]!,
      views[index]!
    )
  }
  const stay = moved ? increasing(sources) : undefined
  let at = stay === undefined ? -1 : stay.length - 1
  let ref = end + 1 < views.length ? nodeOf(out[end + 1]!) : after
  for (let offset = count - 1; offset >= 0; offset--) {
    const index = start + offset
    if (sources[offset] === 0) {
      place(host, parent, out[index]!, ref)
    } else if (stay !== undefined) {
      if (at >= 0 && stay[at] === offset) at--
      else place(host, parent, out[index]!, ref)
    }
    ref = nodeOf(out[index]!)
  }
  return out
}

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

/** @internal */
export interface Root {
  readonly instance: Instance
  readonly send: (message: unknown, source?: unknown) => void
  readonly close: () => void
}

/** @internal */
export interface Options {
  readonly report: Tree["report"]
  readonly context?: Context.Context<any> | undefined
  readonly log?: Recorder | undefined
  readonly fallback?: Tree["fallback"]
  readonly init?: Tree["init"] | undefined
  readonly schedule?: Tree["schedule"] | undefined
  readonly follow?: Tree["follow"] | undefined
}

const ops: Ops = {
  send,
  fail,
  markDirty,
  renderAbove,
  clear,
  flush,
  mountChild,
  patchChild,
  replace,
  create,
  place,
  unplace,
  release,
  close,
  nodeOf,
  stand
}

const initOf = (inst: Instance): Next => inst.component.init(inst.props)

/** @internal */
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
    init: options.init ?? initOf,
    log: options.log,
    fallback: options.fallback,
    // Wrapped: called as the tree's method, the browser's `queueMicrotask` throws "Illegal invocation".
    schedule: options.schedule ?? ((task) => queueMicrotask(task)),
    follow: options.follow,
    ops,
    dirty: [],
    scheduled: true,
    flushing: true,
    closed: false
  }
  tree.transitions = host.transitions?.(tree)
  const ctx: Context.Context<any> = options.context ??
    (Context.empty() as Context.Context<any>)
  const env: Env = { ctx, cause: undefined, waiting: [] }
  const instance = new Instance(
    tree,
    component,
    undefined,
    undefined,
    props,
    env
  )
  if (start(instance) === undefined) {
    instance.rendered = stand(instance, instance.failure!)
  }
  place(host, container, instance.rendered!, null)
  flush(tree)
  return {
    instance,
    send: (message, source) => send(instance, message, source),
    close: () => {
      if (tree.closed) return
      tree.closed = true
      close(instance)
      unplace(host, container, instance.rendered!)
      host.commit?.()
    }
  }
}
