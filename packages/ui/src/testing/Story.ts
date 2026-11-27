/**
 * Story tests drive `update` with messages and assert on the Model: pure,
 * with no runtime, no Layers, no host and no view.
 *
 * A story is evidence about `update`. It takes any message and any Model,
 * so it reaches branches that are awkward to reach through the view. It
 * never renders, so a defect in `view` fails a `Scene`, not a story.
 * Commands stay pending as data until a step resolves them with the message
 * they would have produced, so no service is needed.
 *
 * `make` is a scoped Effect that gives a cursor, `Steps`, whose steps run as
 * soon as they are called and return the cursor, so they chain. The test reads
 * the Model and the rest of the record from the cursor between steps. A shared
 * setup is a function of the cursor, applied with `pipe`. Every step follows
 * the acknowledgement rule described in `Steps`: a story is the full account
 * of what the component did. A defect in `init` or `update` makes the step
 * throw, on the line that called it.
 *
 * `check` generates messages and settlements, checks Schemas and an optional
 * invariant, and shrinks a failing story for replay.
 *
 * **Example** (A todo row: send, resolve its Command, check the Model)
 *
 * ```ts import.meta.vitest
 * import { Command, Component, UiSchema } from "@effect/ui"
 * import { Story } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ ClickedSave: {}, CompletedSaveTodo: {} })
 *
 * class SaveTodo extends Command.Service<SaveTodo>()(
 *   "todos/SaveTodo",
 *   { args: { id: Schema.String }, success: Message }
 * ) {}
 *
 * const TodoItem = Component.define({
 *   name: "TodoItem",
 *   props: Schema.Struct({ id: Schema.String }),
 *   model: Schema.Struct({ saved: Schema.Boolean }),
 *   message: Message
 * }).make({
 *   init: () => ({ saved: false }),
 *   update: ($, message) =>
 *     Message.match(message, {
 *       ClickedSave: () => $.run(SaveTodo.make({ id: $.props.id })),
 *       CompletedSaveTodo: () => ({ saved: true })
 *     }),
 *   view: (h) => h.el("button").on("click", Message.ClickedSave()).children("save")
 * })
 *
 * Effect.gen(function*() {
 *   const s = yield* Story.make(TodoItem, { id: "t1" })
 *   s.send(Message.ClickedSave())
 *     .expectExact(SaveTodo.make({ id: "t1" }))
 *     .resolve(SaveTodo, Message.CompletedSaveTodo())
 *   console.log(s.model.saved) // true
 * }).pipe(Effect.scoped, Effect.runSync)
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Arbitrary from "effect/Arbitrary"
import type * as Effect from "effect/Effect"
import type * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import type * as Command from "../Command.ts"
import type * as Component from "../Component.ts"
import * as replay from "../internal/replay.ts"
import * as cursor from "../internal/steps.ts"
import * as engine from "../internal/story.ts"
import * as runner from "../internal/storyCheck.ts"
import type * as MessageLog from "../MessageLog.ts"
import type * as View from "../View.ts"
import type * as Shared from "./Steps.ts"

export type {
  /**
   * The same type as `Steps.AwaitedQuery`, which defines it.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  AwaitedQuery,
  /**
   * The same type as `Steps.KeyedLoad`, which defines it.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  KeyedLoad,
  /**
   * The same type as `Steps.Pending`, which defines it.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  Pending,
  /**
   * The same type as `Steps.QueryInfo`, which defines it.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  QueryInfo,
  /**
   * The same type as `Steps.StreamTarget`, which defines it.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  StreamTarget,
  /**
   * The same type as `Steps.Target`, which defines it.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  Target
} from "./Steps.ts"

/**
 * The state of one instance between steps, as a story records it. Immutable:
 * every step replaces the cursor's record with a new one.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Story<
  Props,
  Model,
  Msg,
  Events,
  Queries = { readonly [name: string]: unknown }
> extends Shared.Record<Props, Model, Msg, Events> {
  readonly model: Model
  /**
   * The query results, beside the Model: what each query last
   * returned. Opaque: `queries` opens them.
   */
  readonly results: Component.Results | undefined
  /** The queries' results, by name, as `h.queries` opens them for the current Model, props and results. */
  readonly queries: () => Queries
}

// A component with no messages has `Msg = never`, and its `update` can't take `any`, so it needs its own member.
// The same union as `Steps.ts`'s, so `Story.Steps.Any` extends `Steps.Steps.Any`.
type AnyComponent =
  | Component.Members<any, any, any, any, any, any, any, any>
  | Component.Members<any, any, any, never, any, any, any, any>

/**
 * A cursor over one story. It has the steps every kind of test shares, from
 * `Steps.Steps`, and drives the instance by sending messages to `update`.
 *
 * **Details**
 *
 * The types come from the component: `Steps<typeof Counter>` only sends
 * `Counter`'s messages. A step shared by any component is written
 * `<S extends Story.Steps.Any>(s: S): S`, which keeps the caller's type. One
 * that only uses the shared steps can take `Steps.Steps.Any` instead.
 *
 * **Example** (A shared setup)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 * import { Component, UiSchema } from "@effect/ui"
 * import { Story } from "@effect/ui/testing"
 *
 * const Message = UiSchema.TaggedEnum({ ClickedIncrement: {} })
 * const Counter = Component.define({
 *   name: "Counter",
 *   model: Schema.Struct({ count: Schema.Number }),
 *   message: Message
 * }).make({
 *   init: () => ({ count: 0 }),
 *   update: ($) => ({ count: $.model.count + 1 }),
 *   view: (h, model) => h.el("button").on("click", Message.ClickedIncrement()).children(`+ ${model.count}`)
 * })
 *
 * const twice = (s: Story.Steps<typeof Counter>) =>
 *   s.send(Message.ClickedIncrement()).send(Message.ClickedIncrement())
 *
 * Effect.gen(function*() {
 *   const s = yield* Story.make(Counter, {})
 *   s.given({ count: 10 }).pipe(twice)
 *   console.log(s.model.count) // 12
 * }).pipe(Effect.scoped, Effect.runSync)
 * ```
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Steps<C extends AnyComponent> extends Shared.Steps<C> {
  /** The story after the last step. */
  readonly current: Story<
    Component.Props<C>,
    Component.Model<C>,
    Component.Message<C>,
    Component.Events<C>,
    {
      readonly [K in keyof Component.Queries<C>]: Component.QueryResultOf<
        Component.Queries<C>[K]
      >
    }
  >

  /**
   * Sends a message to `update`. An updater is called with the current
   * Model. A message step.
   */
  send(
    message:
      | Component.Message<C>
      | ((model: Component.Model<C>) => Component.Message<C>)
  ): this

  /** The Model after the last step. */
  readonly model: Component.Model<C>
  /** The query results after the last step, beside the Model. Opaque: `queries` opens them. */
  readonly results: Component.Results | undefined
  /** The queries' results, by name, as `h.queries` opens them for the current Model, props and results. */
  readonly queries: {
    readonly [K in keyof Component.Queries<C>]: Component.QueryResultOf<
      Component.Queries<C>[K]
    >
  }
}

/**
 * Helper types for `Steps`.
 *
 * @stability experimental
 * @since 0.1.0
 */
export declare namespace Steps {
  /**
   * A cursor over any component, for steps shared across components.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  export type Any = Steps<AnyComponent>
}

class StepsImpl extends cursor.Cursor {
  protected project(state: engine.State<any, any, any, any>): object {
    return {
      ...cursor.baseRecord(state),
      model: state.model,
      results: state.results,
      queries: state.queries
    }
  }
  send(message: unknown): this {
    return this.act(
      "send",
      "message",
      (state) =>
        engine.dispatch(
          state,
          typeof message === "function" ? message(state.model) : message
        )
    )
  }
  get model(): unknown {
    return this.state.model
  }
  get results(): Component.Results | undefined {
    return this.state.results
  }
  get queries(): unknown {
    return this.state.queries()
  }
}

/**
 * Starts a story: `init` with `props`, as a cursor in a scope. The test
 * calls steps on the cursor and reads the record from it.
 *
 * **Details**
 *
 * When the scope closes with a success, the end check runs: it fails on
 * anything pending, kept or exempt included, on a query with no result
 * unless `keepPending` named it, and on any event or send not acknowledged.
 * When the scope closes with a failure the end check doesn't run, so a
 * failed test reports only its own failure. `it.effect` from
 * `@effect/vitest` provides the scope, which closes at the end of the test.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = <C extends AnyComponent>(
  component: C,
  props: Component.Props<C>
): Effect.Effect<Steps<C>, never, Scope.Scope> =>
  cursor.scoped(
    make,
    () =>
      new StepsImpl(
        "Story",
        cursor.initial(component as unknown as Component.Any, props)
      ) as unknown as
        & cursor.Cursor
        & Steps<C>
  )

/**
 * The cursor after `init`. Its steps follow the acknowledgement rule, but
 * nothing checks what's pending or unacknowledged at the end.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const start = <C extends AnyComponent>(
  component: C,
  props: Component.Props<C>
): Steps<C> =>
  new StepsImpl(
    "Story",
    cursor.initial(component as unknown as Component.Any, props)
  ) as unknown as Steps<C>

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

/**
 * A source of generated values for `check`. Use a function when values depend
 * on the current Model or Command args.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Generated<Input, A> =
  | Schema.Schema<A>
  | Arbitrary.Arbitrary<A>
  | ((input: Input) => Arbitrary.Arbitrary<A>)

/**
 * Overrides for a Command's result generators. Omitted outcomes use the
 * `Service`'s Schemas; generator functions receive the Command's args.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface CheckResults<D> {
  readonly success?:
    | Generated<Command.Definition.Args<D>, Command.Result<D>>
    | undefined
  readonly error?:
    | Generated<Command.Definition.Args<D>, Command.Failure<D>>
    | undefined
}

/**
 * Generators and an invariant for `check`, plus the run, shrink and replay
 * options accepted by `Arbitrary.checkEffect`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface CheckOptions<
  C extends AnyComponent,
  O extends ReadonlyArray<Command.Definition.Any> = []
> extends Arbitrary.CheckOptions {
  /**
   * The messages to send. A function takes the Model. Defaults to the
   * component's `message` Schema.
   */
  readonly messages?:
    | Generated<Component.Model<C>, Component.Message<C>>
    | undefined
  /** Results by Command: `[[SaveTodo, { success: Message.cases.SavedTodo }]]`. */
  readonly commands?:
    | {
      readonly [K in keyof O]: readonly [
        command: O[K],
        results: CheckResults<O[K]>
      ]
    }
    | undefined
  /**
   * Runs after `init` and each applied step, with the same record as
   * `Steps.check`. Return `false` or throw to fail the run.
   */
  readonly invariant?:
    | ((current: Steps<C>["current"]) => boolean | void)
    | undefined
}

/**
 * Returns an Effect that runs generated stories for a component and props.
 * A failing story is shrunk and reported as a defect with a replay token.
 *
 * **Generated steps**
 *
 * Each story starts with `start`. Steps either send a message or settle one
 * piece of pending work: a Command, an `afterRefetch` wait, a query load or a
 * load more. Settlements with no eligible work are skipped. Before sending,
 * the runner uses `keepPending` so messages can arrive while work is pending.
 * Query entries under a live optimistic patch cannot settle.
 *
 * Command results default to the `Service`'s `success` and `error` Schemas;
 * query results use the query's Schemas. A `Command.make` Command needs a
 * `commands` entry with a success generator or the run fails when selecting
 * its outcomes. `Schema.Never` outcomes are not generated. Work with no
 * available outcome stays pending. Use `messages: Schema.Never` to generate
 * only settlements.
 *
 * An infinite query loads one page on a cold load. A refetch loads as many
 * pages as it holds, unless `next` ends the list first.
 *
 * **Checks and failures**
 *
 * After `init` and each applied step, the runner checks the Model's Schema,
 * runs `invariant`, then validates and acknowledges events and sends using
 * the `events` and `receives` Schemas. A step that throws also fails the run.
 *
 * The failure report includes Story steps, the Model, pending Commands and a
 * `replay` token. Shrinking removes steps and shrinks messages generated from
 * a Schema or Arbitrary. Command and query results, and messages generated
 * by a function, are sampled by seed; their values do not shrink.
 *
 * **Choosing generators**
 *
 * Defaults allow any value in the Schemas. If a Command's `success` is the
 * whole message Schema, it can resolve with any message. The default message
 * generator can also send a completion message without a pending Command.
 * Narrow `messages` and `commands` to the interactions you want to test.
 *
 * Reports identify Commands by name, not by their variable names.
 * `effect/Arbitrary` is unstable; replay tokens may not survive a release.
 *
 * **Example** (Check that the saving flag matches pending saves)
 *
 * ```ts import.meta.vitest
 * import { Command, Component, UiSchema } from "@effect/ui"
 * import { Story } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ ClickedSave: {}, CompletedSave: {} })
 *
 * class Save extends Command.Service<Save>()("todos/Save", {
 *   success: Message
 * }) {}
 *
 * const Editor = Component.define({
 *   name: "Editor",
 *   model: Schema.Struct({ saving: Schema.Boolean }),
 *   message: Message
 * }).make({
 *   init: () => ({ saving: false }),
 *   update: ($, message) =>
 *     Message.match(message, {
 *       ClickedSave: () =>
 *         $.model.saving ? $.model : $.set({ saving: true }).run(Save.make()),
 *       CompletedSave: () => ({ saving: false })
 *     }),
 *   view: (h) => h.el("button").on("click", Message.ClickedSave()).children("save")
 * })
 *
 * Story.check(Editor, {}, {
 *   messages: Message.cases.ClickedSave,
 *   commands: [[Save, { success: Message.cases.CompletedSave }]],
 *   invariant: (story) => story.model.saving === (story.pending.length > 0)
 * }).pipe(Effect.runPromise)
 * ```
 *
 * @stability experimental
 * @category checking
 * @since 0.1.0
 */
export const check = <
  C extends AnyComponent,
  const O extends ReadonlyArray<Command.Definition.Any> = []
>(
  component: C,
  props: Component.Props<C>,
  options?: CheckOptions<C, O>
): Effect.Effect<void> =>
  runner.check(
    check,
    component as unknown as Component.Any,
    () => start(component, props) as any,
    options as runner.Options | undefined
  )

/**
 * The parts of a headless component for a Model and props: the plain values
 * a consumer's closure would read.
 *
 * **Details**
 *
 * Given a Scene's record, a reader of shared state reads what the scene's
 * `shared` steps gave, or else each owner's default, as the scene's view
 * does.
 *
 * For a component that builds on another with `p.child`, the parts are the
 * ones the consumer gets. Each child it declares gives the parts of its
 * `init` Model, or, given a Scene's record, of the Model `givenChild` set.
 *
 * @stability experimental
 * @category queries
 * @since 0.1.0
 */
export const parts = <Props, Events, Parts, R, Rcv>(
  component: Component.Headless<Props, Events, Parts, R, Rcv>,
  record: { readonly model: unknown; readonly props: Props } | {
    readonly props: Props
  }
): Parts => {
  const state = cursor.stateOf.get(record)
  const model = state !== undefined
    ? state.model
    : (record as { readonly model: unknown }).model
  return engine.rootParts(component, model, record.props, state ?? record)
}

/**
 * One instance's head entries for a Model and props, or for the Model,
 * props and queries of a story's or a scene's record: what its `head` option returns, or none without one.
 * The entries are typed by the component's vocabulary. The fold across the
 * tree is a `Play`'s.
 *
 * **Details**
 *
 * Given a component, every query result is empty: each query opens at the
 * args it returns for the Model and props, as on a first render. The props
 * may be left out when the component takes none.
 *
 * **Example** (A page's title)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Component, Head } from "@effect/ui"
 * import { Story } from "@effect/ui/testing"
 *
 * const Person = Component.define({
 *   name: "Person",
 *   model: Schema.Struct({ name: Schema.String }),
 *   message: Schema.Never
 * }).make({
 *   init: () => ({ name: "Ada" }),
 *   update: ($) => $.model,
 *   head: ({ model }) => [Head.title(model.name)],
 *   view: (h, model) => h.el("h1", model.name)
 * })
 *
 * Story.head(Person, { name: "Grace" }) // => [Head.title("Grace")]
 * ```
 *
 * @stability experimental
 * @category queries
 * @since 0.1.0
 */
export const head: {
  <Name extends string, Props, Model, Msg, Events, R, V extends View.Elements>(
    component: Component.Component<Name, Props, Model, Msg, Events, R, V, any>,
    model: Model,
    ...props: {} extends Props ? [props?: Props] : [props: Props]
  ): ReadonlyArray<View.HeadEntry<V>>
  <Props, Model, Msg, Events>(
    record: Shared.Record<Props, Model, Msg, Events>
  ): ReadonlyArray<unknown>
} = (
  self: AnyComponent | Shared.Record<any, any, any, any>,
  model?: unknown,
  props?: unknown
) => {
  if (!("pending" in self)) {
    return self.head?.(model, props ?? {}, undefined) ?? []
  }
  const state = cursor.stateOf.get(self)
  if (state === undefined) {
    throw new Error(
      "Story.head: the record didn't come from a Story or a Scene"
    )
  }
  return state.component.head?.(state.model, state.props, state.results) ?? []
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

/**
 * Where a replay first computed something other than what the log recorded.
 *
 * **Details**
 *
 * `recorded` and `recomputed` hold the Model, the events, the Commands and
 * the sends (both encoded the way the Wire encodes them) after the message in
 * entry `seq`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Divergence<Model, Msg, Events> {
  readonly seq: number
  readonly message: Msg
  readonly recorded: Outcome<Model, Events>
  readonly recomputed: Outcome<Model, Events>
}

/**
 * What one `update` produced, as a replay compares it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Outcome<Model, Events> {
  readonly model: Model
  readonly events: ReadonlyArray<Events>
  readonly commands: ReadonlyArray<ReturnType<typeof MessageLog.encodeCommand>>
  /** The `$.loadMore` and `$.reset` calls, compared and never run. */
  readonly lists: ReadonlyArray<Component.ListIssue>
  /** The `$.send` calls, compared and never delivered. */
  readonly sends: ReadonlyArray<ReturnType<typeof MessageLog.encodeSend>>
}

/**
 * The result of `fromLog`: the state the replay reached (the Model, props and
 * query results), how many messages it re-ran, and the first divergence, if
 * any. On a divergence, the state is the one the diverging message was sent
 * to: the Model before it, and the props and results its `update` read.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Replay<
  Model,
  Msg,
  Events,
  Queries = { readonly [name: string]: unknown },
  Props = unknown
> {
  readonly path: string
  readonly model: Model
  /** The props the instance had, from its latest `Mounted`, `PropsChanged` or `Update` entry. */
  readonly props: Props
  /** The query results, beside the Model. Opaque: `queries` opens them. */
  readonly results: Component.Results | undefined
  /** The queries' results, by name, as `h.queries` opens them for the Model, props and results reached. */
  readonly queries: () => Queries
  readonly replayed: number
  readonly divergence: Divergence<Model, Msg, Events> | undefined
}

/**
 * Re-runs a logged session of one component, purely, and reports the first
 * place it doesn't reproduce.
 *
 * **Details**
 *
 * The replay starts at the oldest surviving `Mounted` or `Update` entry for
 * the path (the first one logged for a component with this name, unless
 * `path` is given), takes its Model, and re-runs every following message with
 * the props and query results it was recorded with, so every `update` sees
 * `$.queries` as it did when it ran, whichever entries the log still holds.
 * Commands are compared, never run. Models and events are compared with
 * `Schema.toEquivalence`, and Commands by their Wire encoding.
 *
 * The props and results are tracked with the Model, so the result is the state
 * the instance ended with. They start from the first entry's: a `Mounted`
 * entry's or an `Update` entry's recorded props and results. Each later
 * `PropsChanged` entry sets the props and each `QueryChanged` entry writes
 * its result, so props from the parent and loads that settled after the last
 * message are in the result too.
 *
 * A path that mounted more than once is replayed instance by instance, each
 * from its own entries, and the result is the state of the last one.
 *
 * It takes live entries or Wire frames. A Wire value sent as a placeholder,
 * such as a truncated Model, can't be decoded, and the error names the entry.
 *
 * @stability experimental
 * @category replay
 * @since 0.1.0
 */
export const fromLog: <C extends AnyComponent>(
  component: C,
  entries: ReadonlyArray<MessageLog.Entry | MessageLog.Wire>,
  options?: { readonly path?: string | undefined }
) => Replay<
  Component.Model<C>,
  Component.Message<C>,
  Component.Events<C>,
  {
    readonly [K in keyof Component.Queries<C>]: Component.QueryResultOf<
      Component.Queries<C>[K]
    >
  },
  Component.Props<C>
> = (component, entries, options) =>
  replay.replayLog(
    "Story.fromLog",
    component as Component.Component<
      string,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any
    >,
    entries,
    options
  ) as any
