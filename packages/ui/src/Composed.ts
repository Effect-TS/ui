/**
 * A prototype of Model-owned existence (EFF-4038): a component whose stateful
 * children live in its own Model instead of in the tree its view places.
 *
 * `Composed.make` takes a definition and a `children` record. Each entry
 * names a keyed collection of one component and derives its members from the
 * owner's Model, props and query results. The children's Models are stored in
 * the owner's Model, and the owner's `update` runs their `init` and
 * `update` as part of its own transition. So which children exist, and what
 * each one holds, is a function of the owner's first Model and the messages
 * and query results it received. No view runs to decide it.
 *
 * The view only places children that exist, with `h.children.rows.all()`
 * or `h.children.rows.at(key)`. What it places is a shell with an empty
 * Model that shows the child's view and passes its messages up, so moving,
 * wrapping or hiding it loses nothing.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Command from "./Command.ts"
import * as Component from "./Component.ts"
import * as componentQueries from "./internal/queries.ts"
import * as Subscription from "./Subscription.ts"
import type * as View from "./View.ts"

const childTag = "~composed/Child"
const reconcileTag = "~composed/Reconcile"

/**
 * A keyed collection of one component. `each` returns the members the
 * collection has for the owner's state, each with its key and its props, in
 * order. A member whose key is new starts from the component's `init`, one
 * whose key is gone is dropped with its Model, and the rest keep theirs.
 * `onEmit` maps a member's event to a message of the owner.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Keyed<C, Model, Props, Queries, Msg> {
  readonly component: C
  readonly each: (
    model: Model,
    props: Props,
    queries: Queries
  ) => ReadonlyArray<{ readonly key: string; readonly props: Component.Props<C> }>
  readonly onEmit?: ((key: string, event: Component.Events<C>) => Msg | undefined) | undefined
}

/**
 * One member of a keyed collection as the owner's Model stores it.
 * `generation` tells it from a member that had its key before: every member
 * the owner creates gets the next one.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Entry<C> {
  readonly key: string
  readonly generation: number
  readonly model: Component.Model<C>
}

/**
 * The Model of a composed component: its own, its children's by name, and
 * how many children it has created, which is the next member's generation.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Model<Own, C> {
  readonly own: Own
  readonly children: { readonly [K in keyof C]: ReadonlyArray<Entry<C[K]>> }
  readonly generations: number
}

/**
 * A message for one child, as the owner receives it. With a `generation`
 * it is for that member only: the owner drops it when the member is gone,
 * even if another one has its key. A child's own messages carry one, from
 * its view and from its Commands. Without it, it is for the member that has
 * the key.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ChildMessage<C> = {
  readonly [K in keyof C]: {
    readonly _tag: typeof childTag
    readonly child: K
    readonly key: string
    readonly generation?: number
    readonly message: Component.Message<C[K]>
  }
}[keyof C]

/**
 * The owner's message that only makes the children match `each`.
 *
 * **Details**
 *
 * A query without an `onChange` sends it when its result changes. A props
 * change never reaches `update`, so a Subscription of the owner sends it
 * one step after a change of props that changes which members `each`
 * returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Reconcile {
  readonly _tag: typeof reconcileTag
}

/**
 * A child that exists, in the owner's `update`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Handle<C> {
  readonly model: Component.Model<C>
  /** Sends the child a message. Its `update` runs in this transition, after the owner's. */
  send(message: Component.Message<C>): void
}

/**
 * `$.children` in the owner's `update`. `at` is `None` for a key the
 * collection doesn't have, so a message to it has to be handled there.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Handles<C> = {
  readonly [K in keyof C]: {
    readonly keys: ReadonlyArray<string>
    at(key: string): Option.Option<Handle<C[K]>>
  }
}

/**
 * `h.children` in the owner's view: the children that exist, to place.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Places<C, Msg> = {
  readonly [K in keyof C]: {
    readonly keys: ReadonlyArray<string>
    at(key: string): Option.Option<View.Node<Msg, Component.Requirements<C[K]>>>
    all(): ReadonlyArray<readonly [key: string, node: View.Node<Msg, Component.Requirements<C[K]>>]>
  }
}

/**
 * Checks that a component placed with `h.place` holds no state: its Model
 * is empty and it has no queries.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type Stateless<S> = S extends Component.Component<
  infer _N,
  infer _P,
  infer M,
  infer _Msg,
  infer _E,
  infer _R,
  infer _V,
  infer L,
  infer _Rcv,
  infer _Sl
>
  ? [keyof M] extends [never]
    ? [keyof L] extends [never] ? unknown : { readonly "a component with queries is declared in `children`": never }
  : { readonly "a component with a Model is declared in `children`": never }
  : { readonly "only a plain component with an empty Model is placed in a composed view": never }

/**
 * The options of `h.place`.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type PlaceOptions<S, Msg> = S extends Component.Mountable<infer P, infer E, infer _R, infer Rcv, infer Sl> ?
    & View.Child.Options<P, E, Msg, Rcv>
    & ([Sl] extends [never] ? {} : {
      readonly slots?: { readonly [K in Sl]?: View.Input<Msg, any> } | undefined
    })
  : never

/**
 * `h` in the view of a composed component. It isn't a `View.Helper`, so a
 * component can't be declared with `Editor(h, ...)`: a child with state
 * comes from `h.children`, and one without from `h.place`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Helper<Msg, Props, V, L, C> =
  & Omit<View.Helper<Msg, Props>, "el">
  & View.Tags<V, Msg>
  & Component.QueryHelpers<L>
  & {
    readonly children: Places<C, Msg>
    place<S extends Component.Any>(
      component: S & Stateless<S>,
      options: PlaceOptions<S, NoInfer<Msg>>
    ): View.Node<Msg, Component.Requirements<S>>
  }

/**
 * A message for the child `key` of the collection `child`, whichever
 * member has that key when it arrives.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const childMessage = <const K extends string, M>(child: K, key: string, message: M): {
  readonly _tag: typeof childTag
  readonly child: K
  readonly key: string
  readonly message: M
} => ({ _tag: childTag, child, key, message })

const memberMessage = (child: string, key: string, generation: number, message: unknown) => ({
  _tag: childTag,
  child,
  key,
  generation,
  message
})

const ReconcileSchema = Schema.TaggedStruct(reconcileTag, {})
const reconcileMessage: Reconcile = { _tag: reconcileTag }
const reconcileSubscription = [Subscription.make(reconcileTag, Stream.succeed(reconcileMessage))]

type Kids = { readonly [name: string]: ReadonlyArray<Entry<any>> }

// Each collection's props by key, as `each` returned them.
type Inputs = { readonly [name: string]: Map<string, unknown> }

// One transition: `queue` holds the messages it has still to take.
interface State {
  own: unknown
  kids: Kids
  generations: number
  readonly props: unknown
  readonly queries: unknown
  readonly queue: Array<any>
  readonly commands: Array<Command.Command<any, any>>
  readonly events: Array<unknown>
}

const maxPasses = 100

const failure = (owner: string, what: string): Error => new Error("Composed: " + JSON.stringify(owner) + " " + what)

// Neither is carried through a transition.
const sendsOrLoadsMore = (next: any): boolean => (next.sends?.length ?? 0) > 0 || (next.lists?.length ?? 0) > 0

// Whether the stored members are the ones `each` returns, in its order.
const matches = (stored: ReadonlyArray<Entry<any>>, wanted: ReadonlyArray<{ readonly key: string }>): boolean =>
  stored.length === wanted.length && wanted.every((entry, index) => stored[index].key === entry.key)

const checkChild = (owner: string, name: string, component: any): void => {
  const fail = (what: string): never => {
    throw failure(owner, "children." + name + " " + what)
  }
  if (!Component.isComponent(component)) fail("is not a plain component")
  const definition = component.definition
  if (componentQueries.boundOf(component) !== undefined) fail("declares queries")
  if (component.subscriptions !== undefined) fail("declares subscriptions")
  if (definition.shares !== undefined || definition.shared !== undefined) fail("shares or reads shared state")
  if (definition.slots.length > 0) fail("declares slots")
}

// What the view places for a child: no Model, the child's view, and its messages passed up as events.
const makeShell = (component: any): any =>
  (Component.define as any)({
    name: component.definition.name,
    props: Schema.Struct({ model: component.model, props: component.props }),
    model: Schema.Struct({}),
    message: component.message,
    events: component.message,
    elements: component.definition.elements
  }).make({
    init: () => ({}),
    update: (_model: unknown, message: unknown, $: any) => $.emit(message),
    view: (_model: unknown, h: any) => component.view(h.props.model, h.props.props)
  })

/**
 * Makes a component from a definition and the children it owns.
 *
 * **Details**
 *
 * In this prototype a child has no queries, Subscriptions, slots or shared
 * state: `make` throws for one that does. A child's Commands run on the
 * owner, and its `h.isRunning` and `h.id` see nothing of its own. A
 * Command of a child that left isn't interrupted: it runs to its end and the
 * owner drops its result.
 *
 * Membership follows the owner's messages and query results in the
 * transition that takes them. It follows a change of props one step later,
 * through the owner's `~composed/Reconcile` Subscription. Until then the
 * view places the members that are in both.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = <
  const Name extends string,
  Props,
  M,
  Msg,
  Events,
  V extends View.Elements,
  L,
  const C extends { readonly [name: string]: Component.Any },
  UI extends M | Component.InitStep<M, Msg, Events, any>,
  U extends M | Component.Step<M, Msg, Events, any, L>,
  UV extends View.Content<Msg, any>
>(
  definition: Component.Definition<Name, Props, M, Msg, Events, V, L>,
  options: {
    readonly children: {
      readonly [K in keyof C]: Keyed<
        C[K],
        M,
        Props,
        { readonly [Q in keyof L]: Component.QueryResultOf<L[Q]> },
        Msg
      >
    }
    readonly init: ($: Component.Init<M, Msg, Events, Props>) => UI
    readonly update: (
      model: M,
      message: Msg,
      $: Component.Update<M, Msg, Events, Props, L> & { readonly children: Handles<C> }
    ) => U
    readonly view: (model: M, h: Helper<Msg, Props, V, L, C>) => UV
  }
): Component.Component<
  Name,
  Props,
  Model<M, C>,
  Msg | ChildMessage<C> | Reconcile,
  Events,
  Exclude<
    | Component.StepRequirements<UI | U>
    | View.Requirements<UV>
    | Component.QueryServices<L>
    | Component.Requirements<C[keyof C]>,
    Command.FrameworkService
  >,
  V,
  L
> => {
  const specs = options.children as { readonly [name: string]: Keyed<any, any, any, any, any> }
  const names = Object.keys(specs)
  for (const name of names) checkChild(definition.name, name, specs[name].component)
  const shells = Object.fromEntries(names.map((name) => [name, makeShell(specs[name].component)]))
  const emptyKids: Kids = Object.fromEntries(names.map((name) => [name, []]))
  const fail = (what: string): never => {
    throw failure(definition.name, what)
  }

  // The transition whose owner `update` is running.
  let running: State | undefined

  // The owner's `$`: with its children, and with the query results the transition has.
  const handles = ($: object): object => {
    const state = running!
    const kids = state.kids
    const children = Object.fromEntries(names.map((name) => [name, {
      get keys() {
        return kids[name].map((entry) => entry.key)
      },
      at: (key: string) =>
        Option.map(Option.fromUndefinedOr(kids[name].find((entry) => entry.key === key)), (entry) => ({
          model: entry.model,
          send: (message: unknown) => {
            state.queue.push(memberMessage(name, entry.key, entry.generation, message))
          }
        }))
    }]))
    return Object.assign(Object.create($), { children, queries: state.queries })
  }

  // The definition's own component: its `init` and `update` are the pure steps the transition runs.
  const Own = (definition as any).make({
    init: options.init,
    update: (model: unknown, message: unknown, $: object) =>
      options.update(model as M, message as Msg, handles($) as any),
    view: (_model: unknown, h: any) => h.text("")
  })
  const ownQueries = componentQueries.boundOf(Own)

  const collect = (state: State, name: string, { generation, key }: Entry<any>, next: any): void => {
    if (sendsOrLoadsMore(next)) fail("children." + name + " sends to a child or loads more")
    // The member's key and generation and not the member, whose Model a running Command would hold.
    const fromMember = (message: unknown) =>
      Component.isNoop(message) ? message : memberMessage(name, key, generation, message)
    for (const command of next.commands) state.commands.push(Command.map(command, fromMember))
    const onEmit = specs[name].onEmit
    if (onEmit === undefined) return
    for (const event of next.events) {
      const message = onEmit(key, event)
      if (message !== undefined) state.queue.push(message)
    }
  }

  // Makes the children match `each`, and returns each collection's props by key.
  const reconcile = (state: State): Inputs => {
    const inputs: { [name: string]: Map<string, unknown> } = {}
    for (const name of names) {
      const spec = specs[name]
      const wanted = spec.each(state.own, state.props, state.queries)
      const byKey = new Map<string, unknown>()
      for (const entry of wanted) {
        if (byKey.has(entry.key)) {
          fail("children." + name + " has two members with the key " + JSON.stringify(entry.key))
        }
        byKey.set(entry.key, entry.props)
      }
      inputs[name] = byKey
      const before = state.kids[name]
      if (matches(before, wanted)) continue
      const existing = new Map(before.map((entry) => [entry.key, entry]))
      const after = wanted.map((entry) => {
        const kept = existing.get(entry.key)
        if (kept !== undefined) return kept
        const next = spec.component.init(entry.props)
        const made = { key: entry.key, generation: state.generations++, model: next.model }
        collect(state, name, made, next)
        return made
      })
      state.kids = { ...state.kids, [name]: after }
    }
    return inputs
  }

  const deliver = (
    state: State,
    inputs: Inputs,
    message: {
      readonly child: string
      readonly key: string
      readonly generation?: number
      readonly message: unknown
    }
  ): void => {
    const entries = state.kids[message.child]
    const index = entries === undefined ? -1 : entries.findIndex((entry) => entry.key === message.key)
    // A child that is gone: what is still in flight for it, a Command's result say, settles here.
    if (index === -1) return
    const entry = entries[index]
    // Another member has its key now.
    if (message.generation !== undefined && message.generation !== entry.generation) return
    const next = specs[message.child].component.update(
      entry.model,
      message.message,
      inputs[message.child].get(message.key)
    )
    if (next.model !== entry.model) {
      const after = entries.slice()
      after[index] = { ...entry, model: next.model }
      state.kids = { ...state.kids, [message.child]: after }
    }
    collect(state, message.child, entry, next)
  }

  // One transition: the messages in the queue, and every message they lead to, until none is left.
  const run = (state: State): void => {
    // Before any message, so that one for a member that left since the last transition finds it gone.
    let inputs = reconcile(state)
    let passes = 0
    while (state.queue.length > 0) {
      if (++passes > maxPasses) fail("didn't settle after " + maxPasses + " messages")
      const message = state.queue.shift()
      if (message?._tag === reconcileTag) continue
      if (message?._tag === childTag) {
        deliver(state, inputs, message)
        continue
      }
      running = state
      let next: any
      try {
        next = Own.update(state.own, message, state.props)
      } finally {
        running = undefined
      }
      if (sendsOrLoadsMore(next)) fail("sends to a ref or loads more")
      state.commands.push(...next.commands)
      state.events.push(...next.events)
      // Within a transition only the owner's Model changes what `each` returns.
      if (next.model === state.own) continue
      state.own = next.model
      inputs = reconcile(state)
    }
  }

  // The owner's queries as the component declares them: `args` takes the owner's Model, and a query
  // without an `onChange` gets one, so that the children follow its result.
  const queries = Object.fromEntries(
    Object.entries((definition.queries ?? {}) as { readonly [name: string]: any }).map(([name, query]) => [name, {
      ...query,
      args: (model: Model<any, any>, props: unknown, results: unknown) => query.args(model.own, props, results),
      onChange: query.onChange ?? (() => reconcileMessage)
    }])
  )

  const strict = (model: Model<any, any>, h: any): object => {
    const children = Object.fromEntries(names.map((name) => {
      let inputs: Map<string, unknown> | undefined
      const propsOf = () =>
        inputs ??= new Map(specs[name].each(model.own, h.props, h.queries).map((entry) => [entry.key, entry.props]))
      let placed: ReadonlyArray<Entry<any>> | undefined
      const placeable = () => placed ??= model.children[name].filter((entry: Entry<any>) => propsOf().has(entry.key))
      const node = (entry: Entry<any>) =>
        shells[name](h, {
          key: name + ":" + entry.key,
          props: { model: entry.model, props: propsOf().get(entry.key) },
          onEmit: (message: unknown) => memberMessage(name, entry.key, entry.generation, message)
        })
      return [name, {
        get keys() {
          return placeable().map((entry) => entry.key)
        },
        at: (key: string) => Option.map(Option.fromUndefinedOr(placeable().find((entry) => entry.key === key)), node),
        all: () => placeable().map((entry) => [entry.key, node(entry)] as const)
      }]
    }))
    return Object.assign(Object.create(h), {
      children,
      place: (component: any, placed: object) => component(h, placed)
    })
  }

  return (Component.define as any)({
    name: definition.name,
    props: definition.props,
    model: Schema.Struct({
      own: definition.model,
      children: Schema.Struct(Object.fromEntries(names.map((name) => [
        name,
        Schema.Array(
          Schema.Struct({ key: Schema.String, generation: Schema.Number, model: specs[name].component.model })
        )
      ]))),
      generations: Schema.Number
    }),
    message: Schema.Union([
      definition.message,
      ...names.map((name) =>
        Schema.TaggedStruct(childTag, {
          child: Schema.Literal(name),
          key: Schema.String,
          generation: Schema.optionalKey(Schema.Number),
          message: specs[name].component.message
        })
      ),
      ReconcileSchema
    ]),
    events: definition.events,
    elements: definition.elements,
    ...(ownQueries === undefined ? {} : { queries })
  }).make({
    init: ($: any) => {
      const first = Own.init($.props)
      const state: State = {
        own: first.model,
        kids: emptyKids,
        generations: 0,
        props: $.props,
        // What `each` reads before any result is in.
        queries: ownQueries?.context(first.model, $.props, undefined).queries ?? {},
        queue: [],
        commands: [...first.commands],
        events: [...first.events]
      }
      run(state)
      return $.set({ own: state.own, children: state.kids, generations: state.generations })
        .run(...state.commands)
        .emit(...state.events)
    },
    update: (model: Model<any, any>, message: unknown, $: any) => {
      const state: State = {
        own: model.own,
        kids: model.children,
        generations: model.generations,
        props: $.props,
        queries: $.queries,
        queue: [message],
        commands: [],
        events: []
      }
      run(state)
      const next = state.own === model.own && state.kids === model.children
        ? model
        : { own: state.own, children: state.kids, generations: state.generations }
      return $.set(next).run(...state.commands).emit(...state.events)
    },
    // A props change doesn't reach `update`: while the children don't match `each`, this asks for the message that does.
    subscriptions: (model: Model<any, any>, props: unknown, results: unknown) =>
      names.every((name) => matches(model.children[name], specs[name].each(model.own, props, results)))
        ? []
        : reconcileSubscription,
    view: (model: Model<any, any>, h: any) => options.view(model.own, strict(model, h) as any)
  })
}
