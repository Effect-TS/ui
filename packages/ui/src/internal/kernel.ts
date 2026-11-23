/**
 * @internal
 */
import { checkContent, checkKeys, checkPaths, dev } from "#dev"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { TypeId as FeatureId } from "../Feature.ts"
import * as View from "../View.ts"
import { propsEqual } from "./equal.ts"
import { segmentOf, slotSegment } from "./paths.ts"

/** @internal */
export interface Host<N = any> {
  readonly createElement: (tag: string) => N
  readonly createText: (text: string) => N
  readonly setText: (node: N, text: string) => void
  readonly setAttr: (node: N, name: string, value: string | undefined) => void
  readonly setProp: (node: N, name: string, value: unknown) => void
  readonly setEvents: (node: N, record: Rec, first: boolean) => void
  readonly insert: (parent: N, node: N, before: N | null) => void
  readonly remove: (parent: N, node: N) => void
  readonly clear?: ((parent: N) => void) | undefined
  readonly parentOf: (node: N) => N
  readonly nextOf: (node: N) => N | null
  readonly commit?: (() => void) | undefined
}

/** @internal */
export interface Runnable {
  readonly definition: { readonly name: string }
  readonly init: (props: any) => Next
  readonly update: (model: any, message: never, props: any) => Next | undefined
  readonly view: Function
  readonly layer?: unknown
  readonly boot?: ((inst: Instance) => void) | undefined
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

/** @internal */
export interface Env {
  ctx: Context.Context<any> | undefined
  cause: Cause.Cause<unknown> | undefined
  readonly waiting: Array<() => void>
}

/** @internal */
export type Recorder = (
  inst: Instance,
  draft: { readonly _tag: string; readonly [field: string]: unknown }
) => void

/** @internal */
export interface Tree {
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
  dirty: Array<Instance>
  scheduled: boolean
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
  readonly under: string | undefined
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
    return this.named = (this.under ?? this.parent!.path) + "/" +
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
  slot = inst.under
  try {
    return parent === undefined
      ? create(inst, rootFallback(inst, cause))
      : create(
        parent,
        fallbackOf(parent, inst.at!.v as View.Child<any, any>, cause)
      )
  } catch (error) {
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
  cause: Cause.Cause<unknown>
): void => {
  if (inst.closed) return
  const tree = inst.tree
  const log = tree.log
  if (log !== undefined) {
    log(inst, { _tag: "Failed", props: inst.props, in: where, cause })
  }
  inst.failure = cause
  const old = inst.rendered
  const path = inst.path
  close(inst)
  const at = inst.at
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
  const onFailure = at === undefined
    ? undefined
    : (at.v as View.Child<any, any>).onFailure
  if (onFailure !== undefined) {
    const parent = inst.parent!
    tree.schedule(() =>
      parent.fire(onFailure, AsyncResult.failure(cause), inst, "onFailure")
    )
  }
  tree.report(path, where, cause)
}

/** @internal */
export const send = (
  inst: Instance,
  message: unknown,
  source?: unknown
): void => {
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
      source,
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
  if (next.commands.length > 0) notPorted("Commands")
  if (next.sends !== undefined && next.sends.length > 0) notPorted("$.send")
  if (next.lists !== undefined && next.lists.length > 0) {
    notPorted("infinite queries")
  }
  if (next.viewTransition !== undefined) notPorted("view transitions")
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

/** @internal */
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
  if (!tree.closed) tree.host.commit?.()
}

const viewOf = (inst: Instance): View.Node<any, any> | undefined => {
  const component = inst.component
  const view = component.view
  try {
    const tree: View.Node<any, any> = Reflect.apply(view, component, [
      inst.model,
      inst.props,
      undefined,
      undefined,
      View.takesPathSource(view) ? inst : inst.path,
      undefined,
      inst
    ])
    if (dev) checkPaths(inst.path, tree)
    return tree
  } catch (error) {
    fail(inst, "view", Cause.die(error))
    return undefined
  }
}

const check = (component: any): void => {
  const definition = component.definition
  if (component.init === undefined) notPorted("Component.lazy")
  if (component.parts !== undefined) notPorted("headless components")
  if (component.subscriptions !== undefined) notPorted("Subscriptions")
  if (component.head !== undefined) notPorted("head")
  if (component["~queries"] !== undefined) notPorted("queries")
  if (definition.shared !== undefined || definition.shares !== undefined) {
    notPorted("shared state")
  }
  if (component.layer !== undefined && component.boot === undefined) {
    notPorted("Component.provide")
  }
}

const start = (inst: Instance): Rec | undefined => {
  let first: Next
  const component = inst.component
  const outer = slot
  slot = undefined
  try {
    try {
      check(component)
      if (component.boot !== undefined) {
        component.boot(inst)
        if (inst.closed) return undefined
      }
      first = inst.tree.init(inst)
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
    if (inst.closed) {
      release(inst, rendered)
      return undefined
    }
    inst.rendered = rendered
    apply(inst, first)
    return rendered
  } finally {
    slot = outer
  }
}

const render = (inst: Instance): void => {
  inst.dirty = false
  const outer = slot
  slot = undefined
  try {
    const tree = viewOf(inst)
    if (tree === undefined) return
    inst.rendered = patch(inst, inst.rendered!, tree)
  } catch (error) {
    fail(inst, "view", Cause.die(error))
  } finally {
    slot = outer
  }
}

const close = (inst: Instance): void => {
  if (inst.closed) return
  inst.closed = true
  inst.lazy = undefined
  if (inst.parent !== undefined) inst.parent.live--
  if (inst.rendered !== undefined && inst.live > 0) release(inst, inst.rendered)
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
    if (kids === undefined) return close(rec.inst)
    if (rec.inst === owner) {
      owner.live--
      rec.inst = released
    }
  } else if (view._tag === "Outlet") {
    owner.live--
    if (owner.placed!.get(view.name)?.rec === rec) {
      owner.placed!.delete(view.name)
    }
    owner = owner.parent!
  }
  if (kids !== undefined) {
    for (let index = 0; index < kids.length; index++) {
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

const unplace = (host: Host, parent: unknown, rec: Rec): void => {
  if (rec.node !== undefined) host.remove(parent, rec.node)
  else if (rec.kids === undefined) unplace(host, parent, rec.inst.rendered!)
  else {for (let index = 0; index < rec.kids.length; index++) {
      unplace(host, parent, rec.kids[index]!)
    }}
}

const mountChild = (owner: Instance, rec: Rec): void => {
  const view = rec.v as View.Child<any, any>
  let component = view.component as any
  let env = owner.env
  if (view.alive !== undefined) notPorted("kept children")
  if (view.owner !== undefined) notPorted("headless components")
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
      if (env.cause === undefined) {
        const at = slot
        env.waiting.push(() => settle(owner, rec, at))
      }
      return
    }
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
  const child = rec.inst = new Instance(
    owner.tree,
    component,
    owner,
    rec,
    view.props,
    env
  )
  owner.live++
  if (start(child) === undefined) rec.kids = [stand(child, child.failure!)]
  else if (owner.closed) close(child)
}

const settle = (owner: Instance, rec: Rec, at: string | undefined): void => {
  if (rec.inst !== owner || owner.closed) return
  const host = owner.tree.host
  const old = rec.kids![0]!
  const outer = slot
  slot = at
  try {
    if (owner.env.ctx === undefined) {
      rec.kids![0] = patch(
        owner,
        old,
        fallbackOf(owner, rec.v as View.Child<any, any>, owner.env.cause)
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

const contentOf = (content: unknown): ReadonlyArray<View.Node<any, any>> => {
  if (content === undefined) return noContent
  const views = View.children([content as View.Input<any, any>])
  return views.length === 0 ? noContent : views
}

const slotOf = (receiver: Instance, name: string): unknown =>
  receiver.at === undefined
    ? undefined
    : (receiver.at.v as View.Child<any, any>).slots?.[name]

const refresh = (receiver: Instance, placed: Placed): void => {
  const rec = placed.rec
  const name = (rec.v as View.Outlet).name
  const content = slotOf(receiver, name)
  if (content === placed.content) return
  placed.content = content
  const host = receiver.tree.host
  const olds = rec.kids!
  const after = host.nextOf(lastNodeOf(olds[olds.length - 1]!))
  const outer = slot
  slot = receiver.path + "/" + slotSegment(name)
  try {
    const views = contentOf(content)
    if (dev) checkContent(slot, views)
    rec.kids = patchList(
      receiver.parent!,
      host.parentOf(nodeOf(olds[0]!)),
      olds,
      views,
      after
    )
  } finally {
    slot = outer
  }
}

const create = (inst: Instance, view: View.Node<any, any>): Rec => {
  const host = inst.tree.host
  switch (view._tag) {
    case "Text":
      return new Rec(view, host.createText(view.text), undefined, inst)
    case "Element": {
      const node = host.createElement(view.tag)
      const attrs = view.attrs
      if (attrs !== View.noFields) {
        for (const name in attrs) host.setAttr(node, name, attrs[name])
      }
      const views = view.children
      let kids: Array<Rec> | undefined
      if (dev && views.length > 1) checkKeys(inst.path, views)
      if (views.length > 0) {
        kids = new Array(views.length)
        for (let index = 0; index < views.length; index++) {
          place(host, node, kids[index] = create(inst, views[index]!), null)
        }
      }
      const props = view.props
      if (props !== View.noFields) {
        for (const name in props) host.setProp(node, name, props[name])
      }
      if (view.mount !== undefined) notPorted("mounts")
      if (view.refKey !== undefined) notPorted("refs")
      if (view.owned !== undefined && view.owned.length > 0) {
        notPorted("headless parts")
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
      const declarer = inst.parent
      if (declarer === undefined) {
        throw new Error(
          inst.path + " places the slot " + view.name + ", and is a root"
        )
      }
      const content = slotOf(inst, view.name)
      const views = contentOf(content)
      const kids: Array<Rec> = new Array(views.length)
      const rec = new Rec(view, undefined, kids, inst)
      inst.live++
      ;(inst.placed ??= new Map()).set(view.name, { rec, content })
      const outer = slot
      slot = inst.path + "/" + slotSegment(view.name)
      if (dev) checkContent(slot, views)
      try {
        for (let index = 0; index < views.length; index++) {
          kids[index] = create(declarer, views[index]!)
        }
      } finally {
        slot = outer
      }
      return rec
    }
  }
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
      if ((prev as View.Text).text !== view.text) {
        inst.tree.host.setText(old.node, view.text)
      }
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
        shown[0] = patch(
          inst,
          shown[0]!,
          fallbackOf(
            inst,
            view,
            child === inst ? inst.env.cause : child.failure
          )
        )
        return old
      }
      if (child.closed) return old
      if (!propsEqual(child.props, view.props)) {
        child.props = view.props
        const log = inst.tree.log
        if (log !== undefined) {
          log(child, { _tag: "PropsChanged", props: view.props })
        }
        render(child)
      } else if (child.dirty) render(child)
      const placed = child.placed
      if (placed !== undefined && !child.closed) {
        for (const entry of placed.values()) {
          refresh(child, entry)
        }
      }
      return old
    }
    case "Outlet": {
      refresh(inst, inst.placed!.get(view.name)!)
      return old
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
  rec.v = view
  const before = prev.attrs
  const attrs = view.attrs
  if (before !== attrs) {
    for (const name in before) {
      if (typeof attrs[name] !== "string") host.setAttr(node, name, undefined)
    }
    for (const name in attrs) {
      const value = attrs[name]
      if (before[name] !== value) host.setAttr(node, name, value)
    }
  }
  const was = prev.props
  const props = view.props
  if (was !== props) {
    for (const name in was) {
      if (!(name in props)) host.setProp(node, name, undefined)
    }
    for (const name in props) {
      if (was[name] !== props[name]) host.setProp(node, name, props[name])
    }
  }
  if (view.handlers !== prev.handlers) {
    host.setEvents(node, rec, prev.handlers === View.noFields)
  }
  const views = view.children
  const olds = rec.kids
  if (dev && views.length > 1) checkKeys(inst.path, views)
  if (olds === undefined) {
    if (views.length === 0) return
    const kids: Array<Rec> = new Array(views.length)
    for (let index = 0; index < views.length; index++) {
      place(host, node, kids[index] = create(inst, views[index]!), null)
    }
    rec.kids = kids
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
    olds[0] = patch(inst, olds[0]!, views[0]!)
  } else rec.kids = patchList(inst, node, olds, views, null)
}

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
  while (
    start <= oldEnd && start <= end && pairs(olds[oldEnd]!.v, views[end]!)
  ) {
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
    const to = key !== undefined
      ? byKey?.get(key)
      : index <= end
      ? index
      : undefined
    if (
      to !== undefined && sources[to - start] === 0 && pairs(old.v, views[to]!)
    ) {
      sources[to - start] = index + 1
      if (to < last) moved = true
      else last = to
      out[to] = patch(inst, old, views[to]!)
    } else {
      unplace(host, parent, old)
      release(inst, old)
    }
  }
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
    schedule: options.schedule ?? queueMicrotask,
    dirty: [],
    scheduled: false,
    closed: false
  }
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
  host.commit?.()
  return {
    instance,
    send: (message, source) => send(instance, message, source),
    close: () => {
      if (tree.closed) return
      tree.closed = true
      close(instance)
      unplace(host, container, instance.rendered!)
    }
  }
}
