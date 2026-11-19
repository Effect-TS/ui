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
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import * as Command from "./Command.ts"
import * as Component from "./Component.ts"
import type * as View from "./View.ts"

const childTag = "~composed/Child"
const queryTag = "~composed/QueryChanged"

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
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Entry<C> {
  readonly key: string
  readonly model: Component.Model<C>
}

/**
 * The Model of a composed component: its own, and its children's by name.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Model<Own, C> {
  readonly own: Own
  readonly children: { readonly [K in keyof C]: ReadonlyArray<Entry<C[K]>> }
}

/**
 * A message for one child, as the owner receives it.
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
    readonly message: Component.Message<C[K]>
  }
}[keyof C]

/**
 * The owner's message for a query whose result changed and that has no
 * `onChange` of its own, so that the children follow it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface QueryChanged {
  readonly _tag: typeof queryTag
  readonly name: string
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
 * A message for the child `key` of the collection `child`.
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

type Kids = { readonly [name: string]: ReadonlyArray<Entry<any>> }

interface State {
  own: unknown
  kids: Kids
  readonly commands: Array<Command.Command<any, any>>
  readonly events: Array<unknown>
}

const maxPasses = 100

const checkChild = (owner: string, name: string, component: any): void => {
  const fail = (what: string): never => {
    throw new Error(
      "Composed: " + JSON.stringify(owner) + " children." + name + " " + what
    )
  }
  if (typeof component?.update !== "function" || typeof component?.view !== "function") {
    fail("is not a plain component")
  }
  const definition = component.definition
  if (definition.queries !== undefined && Object.keys(definition.queries).length > 0) fail("declares queries")
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
 * owner, and its `h.isRunning` and `h.id` see nothing of its own.
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
  Msg | ChildMessage<C> | QueryChanged,
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
  const shells: { [name: string]: any } = {}
  for (const name of names) shells[name] = makeShell(specs[name].component)

  // The sends of the owner's `update` that is running, and the children it sees.
  let running: { readonly kids: Kids; readonly sends: Array<unknown> } | undefined

  const handles = ($: object): object => {
    const scope = running!
    const children: { [name: string]: unknown } = {}
    for (const name of names) {
      children[name] = {
        keys: scope.kids[name].map((entry) => entry.key),
        at: (key: string) => {
          const entry = scope.kids[name].find((entry) => entry.key === key)
          return entry === undefined ? Option.none() : Option.some({
            model: entry.model,
            send: (message: unknown) => {
              scope.sends.push(childMessage(name, key, message))
            }
          })
        }
      }
    }
    return Object.assign(Object.create($), { children })
  }

  // The definition's own component: its `init` and `update` are the pure steps the transition runs.
  const Own = (definition as any).make({
    init: options.init,
    update: (model: unknown, message: unknown, $: object) =>
      options.update(model as M, message as Msg, handles($) as any),
    view: (_model: unknown, h: any) => h.text("")
  })

  const collect = (state: State, queue: Array<unknown>, name: string, key: string, next: any): void => {
    if ((next.sends?.length ?? 0) > 0 || (next.lists?.length ?? 0) > 0) {
      throw new Error(
        "Composed: " + JSON.stringify(definition.name) + " children." + name + " sends to a child or loads more"
      )
    }
    for (const command of next.commands) {
      state.commands.push(
        Command.map(
          command,
          (message: unknown) => Component.isNoop(message) ? message : childMessage(name, key, message)
        )
      )
    }
    const onEmit = specs[name].onEmit
    if (onEmit === undefined) return
    for (const event of next.events) {
      const message = onEmit(key, event)
      if (message !== undefined) queue.push(message)
    }
  }

  // Makes the children match `each`, and returns each collection's props by key.
  const reconcile = (
    state: State,
    queue: Array<unknown>,
    props: unknown,
    queries: unknown
  ): { readonly [name: string]: Map<string, unknown> } => {
    const inputs: { [name: string]: Map<string, unknown> } = {}
    let kids: { [name: string]: ReadonlyArray<Entry<any>> } | undefined
    for (const name of names) {
      const spec = specs[name]
      const wanted = spec.each(state.own, props, queries)
      const byKey = new Map<string, unknown>()
      for (const entry of wanted) {
        if (byKey.has(entry.key)) {
          throw new Error(
            "Composed: " + JSON.stringify(definition.name) + " children." + name + " has two members with the key " +
              JSON.stringify(entry.key)
          )
        }
        byKey.set(entry.key, entry.props)
      }
      inputs[name] = byKey
      const before = state.kids[name]
      const existing = new Map(before.map((entry) => [entry.key, entry]))
      let same = before.length === wanted.length
      const after = wanted.map((entry, index) => {
        const kept = existing.get(entry.key)
        if (kept !== undefined) {
          if (before[index] !== kept) same = false
          return kept
        }
        same = false
        const next = spec.component.init(entry.props)
        collect(state, queue, name, entry.key, next)
        return { key: entry.key, model: next.model }
      })
      if (!same) (kids ??= { ...state.kids })[name] = after
    }
    if (kids !== undefined) state.kids = kids
    return inputs
  }

  const deliver = (
    state: State,
    queue: Array<unknown>,
    inputs: { readonly [name: string]: Map<string, unknown> },
    message: { readonly child: string; readonly key: string; readonly message: unknown }
  ): void => {
    const entries = state.kids[message.child]
    const index = entries === undefined ? -1 : entries.findIndex((entry) => entry.key === message.key)
    // A child that is gone: what is still in flight for it, a Command's result say, settles here.
    if (index === -1) return
    const next = specs[message.child].component.update(
      entries[index].model,
      message.message,
      inputs[message.child].get(message.key)
    )
    if (next.model !== entries[index].model) {
      const after = entries.slice()
      after[index] = { key: message.key, model: next.model }
      state.kids = { ...state.kids, [message.child]: after }
    }
    collect(state, queue, message.child, message.key, next)
  }

  // One transition: the messages in `queue`, and every message they lead to, until none is left.
  const run = (state: State, queue: Array<any>, props: unknown, queries: unknown): void => {
    let inputs = reconcile(state, queue, props, queries)
    let passes = 0
    while (queue.length > 0) {
      if (++passes > maxPasses) {
        throw new Error(
          "Composed: " + JSON.stringify(definition.name) + " didn't settle after " + maxPasses + " messages"
        )
      }
      const message = queue.shift()
      if (message?._tag === queryTag) continue
      if (message?._tag === childTag) {
        deliver(state, queue, inputs, message)
      } else {
        running = { kids: state.kids, sends: [] }
        let next: any
        const sends = running.sends
        try {
          next = Own.update(state.own, message, props, queries)
        } finally {
          running = undefined
        }
        if ((next.sends?.length ?? 0) > 0 || (next.lists?.length ?? 0) > 0) {
          throw new Error("Composed: " + JSON.stringify(definition.name) + " sends to a ref or loads more")
        }
        state.own = next.model
        state.commands.push(...next.commands)
        state.events.push(...next.events)
        queue.push(...sends)
      }
      inputs = reconcile(state, queue, props, queries)
    }
  }

  const emptyKids: { [name: string]: ReadonlyArray<Entry<any>> } = {}
  for (const name of names) emptyKids[name] = []

  const declared = (definition.queries ?? {}) as { readonly [name: string]: any }
  const queryNames = Object.keys(declared)
  const queries: { [name: string]: unknown } = {}
  for (const name of queryNames) {
    queries[name] = declared[name].onChange === undefined
      ? { ...declared[name], onChange: () => ({ _tag: queryTag, name }) }
      : declared[name]
  }
  // What `each` reads in `init`, before any result is in.
  const unloaded: { [name: string]: unknown } = {}
  for (const name of queryNames) unloaded[name] = "queryMany" in declared[name] ? [] : AsyncResult.initial(true)

  const finish = (step: any, state: State): any => {
    const ran = state.commands.length > 0 ? step.run(...state.commands) : step
    return state.events.length > 0 ? ran.emit(...state.events) : ran
  }

  const strict = (model: Model<any, any>, h: any): object => {
    const children: { [name: string]: unknown } = {}
    for (const name of names) {
      let inputs: Map<string, unknown> | undefined
      const propsOf = () =>
        inputs ??= new Map(specs[name].each(model.own, h.props, h.queries).map((entry) => [entry.key, entry.props]))
      const placeable = () => model.children[name].filter((entry: Entry<any>) => propsOf().has(entry.key))
      const node = (entry: Entry<any>) =>
        shells[name](h, {
          key: name + ":" + entry.key,
          props: { model: entry.model, props: propsOf().get(entry.key) },
          onEmit: (message: unknown) => childMessage(name, entry.key, message)
        })
      children[name] = {
        get keys() {
          return placeable().map((entry: Entry<any>) => entry.key)
        },
        at: (key: string) =>
          Option.map(Option.fromNullishOr(placeable().find((entry: Entry<any>) => entry.key === key)), node),
        all: () => placeable().map((entry: Entry<any>) => [entry.key, node(entry)] as const)
      }
    }
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
        Schema.Array(Schema.Struct({ key: Schema.String, model: specs[name].component.model }))
      ])))
    }),
    message: Schema.Union([
      definition.message,
      ...names.map((name) =>
        Schema.TaggedStruct(childTag, {
          child: Schema.Literal(name),
          key: Schema.String,
          message: specs[name].component.message
        })
      ),
      Schema.TaggedStruct(queryTag, { name: Schema.String })
    ]),
    events: definition.events,
    elements: definition.elements,
    ...(queryNames.length > 0 ? { queries } : {})
  }).make({
    init: ($: any) => {
      const first = Own.init($.props)
      const state: State = {
        own: first.model,
        kids: emptyKids,
        commands: [...first.commands],
        events: [...first.events]
      }
      run(state, [], $.props, unloaded)
      return finish($.set({ own: state.own, children: state.kids }), state)
    },
    update: (model: Model<any, any>, message: unknown, $: any) => {
      const state: State = { own: model.own, kids: model.children, commands: [], events: [] }
      run(state, [message], $.props, $.queries)
      const next = state.own === model.own && state.kids === model.children
        ? model
        : { own: state.own, children: state.kids }
      return finish($.set(next), state)
    },
    view: (model: Model<any, any>, h: any) => options.view(model.own, strict(model, h) as any)
  })
}
