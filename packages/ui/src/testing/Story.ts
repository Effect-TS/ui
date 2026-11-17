/**
 * Story tests drive one component instance step by step: pure, with no
 * runtime, no Layers and no host.
 *
 * A story covers `init`, `update` and queries over the instance's view value.
 * Commands stay pending as data until a step resolves them with the message
 * they would have produced, so no service is needed. A child slot is a leaf:
 * anything that crosses one is a runtime test.
 *
 * `make` hands a callback a cursor, `Steps`, whose steps run as soon as they
 * are called and return the cursor, so they chain. A shared setup is a function
 * of the cursor, applied with `pipe`. `make` fails if a Command is still
 * pending once the callback returns. Sending a message while Commands are
 * pending is allowed, since testing `switch` and `concurrent` needs it. A
 * defect in `init`, `update` or `view` makes the step throw, on the line
 * that called it.
 *
 * **Example** (A todo row: click, resolve its Command, check the Model)
 *
 * ```ts import.meta.vitest
 * import { Command, Component } from "@effect/ui"
 * import { Story } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = Schema.TaggedUnion({ Save: {}, Saved: {} })
 *
 * class SaveTodo extends Command.Service<SaveTodo>()(
 *   "todos/SaveTodo",
 *   { args: { id: Schema.String } },
 *   Effect.succeed(() => Effect.succeed(Message.make({ _tag: "Saved" })))
 * ) {}
 *
 * const TodoItem = Component.define({
 *   name: "TodoItem",
 *   props: Schema.Struct({ id: Schema.String }),
 *   model: Schema.Struct({ saved: Schema.Boolean }),
 *   message: Message
 * }).make({
 *   init: () => ({ saved: false }),
 *   update: (model, message, $) =>
 *     Message.match(message, {
 *       Save: () => $.run(SaveTodo.make({ id: $.props.id })),
 *       Saved: () => ({ saved: true })
 *     }),
 *   // In a story, `h.isRunning` is derived from the pending Commands.
 *   view: (_, h) => h.el("button").on("click", Message.make({ _tag: "Save" })).children(h.isRunning(SaveTodo) ? "saving" : "save")
 * })
 *
 * Story.make(TodoItem, { id: "t1" }, (s) =>
 *   s.click("save")
 *     .expectExact(SaveTodo.make({ id: "t1" }))
 *     .resolve(SaveTodo, Message.make({ _tag: "Saved" }))
 *     .model((model) => {
 *       if (!model.saved) throw new Error("not saved")
 *     }))
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Cause from "effect/Cause"
import { pipeArguments } from "effect/Pipeable"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Component from "../Component.ts"
import type * as Head from "../Head.ts"
import { checkChildPaths, checkFallbackPaths } from "../internal/paths.ts"
import * as replay from "../internal/replay.ts"
import * as engine from "../internal/story.ts"
import type * as MessageLog from "../MessageLog.ts"
import * as View from "../View.ts"
import * as Query from "./Query.ts"
import type * as Shared from "./Steps.ts"

export type {
  /**
   * The same type as `Steps.AwaitedLoader`, which defines it.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  AwaitedLoader,
  /**
   * The same type as `Steps.KeyedLoad`, which defines it.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  KeyedLoad,
  /**
   * The same type as `Steps.LoaderInfo`, which defines it.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  LoaderInfo,
  /**
   * The same type as `Steps.Pending`, which defines it.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  Pending,
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
 * **Details**
 *
 * `get`, `query` and `all` run `Query` locators over the current view, as
 * `TestHost`'s roots do.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Story<Props, Model, Msg, Events, Loaded = { readonly [name: string]: unknown }>
  extends Shared.Record<Props, Model, Msg, Events>
{
  readonly model: Model
  /**
   * The loader slots, beside the Model: what each loader's read last
   * returned. Opaque: `loaded` opens them.
   */
  readonly slots: Component.Slots | undefined
  /** The loaders' results, by name, as `h.loaded` opens them for the current Model, props and slots. */
  readonly loaded: () => Loaded
  /**
   * Whether the `click` or `fire` step that made this record cancelled its
   * event's default, as the browser host would: its handler was set with
   * `preventDefault: true` and produced a message, or with
   * `preventDefault: "always"`, or the event is `submit`, which is always
   * cancelled, whatever the handler returns and with no handler at all.
   *
   * **Details**
   *
   * Every other step that makes a record resets it to `false`, and so does
   * an event whose default isn't cancelled. The checks, `model`, `view`,
   * `check`, `expectExact` and the others, don't make a record, so they read
   * it without resetting it.
   */
  readonly defaultPrevented: boolean
  /**
   * The view of the current Model and props, rendered once the step that
   * changed them has sent its keyed prunes, so a defect in `view` fails that
   * step.
   */
  readonly view: () => View.Node<Msg, any>
  /** The view as a `Query` tree. */
  readonly root: Query.Node
  /** The one element matching `locator`. Throws when there's none or several. */
  readonly get: (locator: Query.Locator) => Query.Node
  /** The one element matching `locator`, or `undefined`. Throws when there are several. */
  readonly query: (locator: Query.Locator) => Query.Node | undefined
  /** Every element matching `locator`, in document order. */
  readonly all: (locator: Query.Locator) => ReadonlyArray<Query.Node>
}

// A component with no messages has `Msg = never`, and its `update` can't take `any`, so it needs its own member.
// `Rcv` is invariant, and `any` doesn't stand for `never`, so one that receives nothing needs its own members too.
// The same union as `Steps.ts`'s, so `Story.Steps.Any` extends `Steps.Steps.Any`.
type AnyComponent =
  | Component.Component<any, any, any, any, any, any, any, any, any>
  | Component.Component<any, any, any, never, any, any, any, any, any>
  | Component.Component<any, any, any, any, any, any, any, any, never>
  | Component.Component<any, any, any, never, any, any, any, any, never>

/**
 * A cursor over one story. It has the steps every kind of test shares, from
 * `Steps.Steps`, and drives the instance by sending messages and events.
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
 * import { Schema } from "effect"
 * import { Component } from "@effect/ui"
 * import { Story } from "@effect/ui/testing"
 *
 * const Message = Schema.TaggedUnion({ Increment: {} })
 * const Counter = Component.define({
 *   name: "Counter",
 *   model: Schema.Struct({ count: Schema.Number }),
 *   message: Message
 * }).make({
 *   init: () => ({ count: 0 }),
 *   update: (model) => ({ count: model.count + 1 }),
 *   view: (model, h) => h.el("button").on("click", Message.make({ _tag: "Increment" })).children(`+ ${model.count}`)
 * })
 *
 * const twice = (s: Story.Steps<typeof Counter>) => s.click("+").click("+")
 *
 * const story = Story.make(Counter, {}, (s) => s.given({ count: 10 }).pipe(twice))
 * console.log(story.model.count) // 12
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
    { readonly [K in keyof Component.Loaders<C>]: Component.LoadedOf<Component.Loaders<C>[K]> }
  >

  /** Sends a message to `update`. */
  send(message: Component.Message<C>): this
  /**
   * Clicks the one element `target` matches: the innermost element with a
   * `click` handler, that element or an ancestor, sends its message. A string
   * means `Query.text(target)`. Throws when nothing or several elements match,
   * or when nothing handles the click. `defaultPrevented` tells whether the
   * default was cancelled.
   */
  click(target: string | Query.Locator): this
  /**
   * Sends `event` with `payload`, `{}` by default, to the one element
   * `locator` matches: the innermost element with a handler for it, that
   * element or an ancestor, sends its message. Throws when nothing handles
   * it, except for `submit`, which the browser host cancels with or without a
   * handler. `defaultPrevented` tells whether the default was cancelled.
   */
  fire(locator: Query.Locator, event: string, payload?: unknown): this
  /**
   * Sends the message the parent's `onEmit` maps `events` from the child with
   * `key` to, if any. A ref finds the slot rendered with it.
   */
  childEmit(key: string | Component.Ref.Any, events: unknown): this
  /**
   * Sends the message the parent's `onFailure` maps a failure of the child with
   * `key` to, if any. The failure is passed as an `AsyncResult.Failure`. A
   * ref finds the slot rendered with it.
   */
  childFailure(key: string | Component.Ref.Any, cause: Cause.Cause<unknown>): this
  /**
   * Sets the Model the headless child with `key` is expanded from, in place
   * of its `init` Model. The story never runs the child's `update`.
   */
  givenChild(key: string, model: unknown): this

  /** Checks the Model. `f` throws to fail the test. */
  model(f: (model: Component.Model<C>) => void): this
  /** Checks the view. `f` throws to fail the test. */
  view(f: (view: View.Node<Component.Message<C>, any>) => void): this
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

class StepsImpl implements Steps<AnyComponent> {
  current: Story<any, any, any, any, any>
  constructor(current: Story<any, any, any, any, any>) {
    this.current = current
    current.view()
  }
  pipe() {
    return pipeArguments(this, arguments)
  }
  private step(next: Story<any, any, any, any>, defaultPrevented = false): this {
    const settled = next === this.current ? next : engine.pruneKeyed(next, "Story")
    // Set on the settled record, so a step that changed nothing still resets it.
    this.current = settled.defaultPrevented === defaultPrevented
      ? settled
      : engine.update(settled, { defaultPrevented })
    // Rendered once the step has settled, so a defect in `view` fails it.
    this.current.view()
    return this
  }

  given(model: unknown, loaded?: { readonly [name: string]: unknown }): this {
    const next = typeof model === "function" ? model(this.current.model) : model
    const out = engine.update(this.current, {
      model: next,
      pending: [],
      emitted: [],
      sent: [],
      interrupted: [],
      dropped: [],
      loadingMore: []
    })
    // Settled here, with no onChange message: the step's own prune then has nothing to write.
    return this.step(engine.update(out, { slots: engine.givenSlots(out, loaded ?? {}, "Story.given") }))
  }
  props(next: unknown): this {
    const props = typeof next === "function" ? next(this.current.props) : next
    return this.step(engine.update(this.current, { props }))
  }
  send(message: unknown): this {
    return this.step(engine.dispatch(this.current, message))
  }
  click(target: string | Query.Locator): this {
    const locator = typeof target === "string" ? Query.text(target) : target
    const { prevented, story } = engine.fireAt(this.current, locator, "click", {}, "Story.click")
    return this.step(story, prevented)
  }
  fire(locator: Query.Locator, event: string, payload: unknown = {}): this {
    const { prevented, story } = engine.fireAt(this.current, locator, event, payload, "Story.fire")
    return this.step(story, prevented)
  }
  childEmit(key: string | Component.Ref.Any, events: unknown): this {
    return this.step(
      engine.dispatch(this.current, engine.findChild(this.current.view(), key, "Story.childEmit").onEmit(events))
    )
  }
  childFailure(key: string | Component.Ref.Any, cause: Cause.Cause<unknown>): this {
    const child = engine.findChild(this.current.view(), key, "Story.childFailure")
    return this.step(engine.dispatch(this.current, child.onFailure?.(AsyncResult.failure(cause))))
  }
  givenChild(key: string, model: unknown): this {
    engine.findChild(this.current.view(), key, "Story.givenChild")
    const given = new Map(engine.childModels.get(this.current))
    given.set(key, model)
    return this.step(engine.update(this.current, { childModels: given }))
  }

  resolve(target: Shared.Target, result: unknown): this {
    const entry = engine.findRunning(this.current, target, "Story.resolve")
    return this.step(engine.exited(this.current, entry, {
      message: engine.resolveWith(entry, result),
      awaiting: engine.awaitedLoaders(this.current, entry.command, result)
    }))
  }
  fail(target: Shared.Target, error: unknown): this {
    const entry = engine.findRunning(this.current, target, "Story.fail")
    const reject = entry.command.reject as ((error: unknown) => unknown) | undefined
    if (reject === undefined) {
      throw new Error(`Story.fail: ${engine.describe(entry.command)} has no typed failure mapped by Command.match`)
    }
    return this.step(engine.exited(this.current, entry, { message: reject(error), awaiting: [] }))
  }
  next(target: Shared.StreamTarget, result: unknown): this {
    return this.step(
      engine.dispatch(this.current, engine.resolveWith(engine.findStream(this.current, target, "Story.next"), result))
    )
  }
  end(target: Shared.StreamTarget): this {
    return this.step(engine.exited(this.current, engine.findStream(this.current, target, "Story.end"), undefined))
  }
  waitExpired(target: Shared.Target): this {
    const entry = this.current.pending.find((entry) =>
      entry.awaiting !== undefined && entry.awaiting.length > 0 && engine.matches(target, entry)
    )
    if (entry === undefined) {
      throw new Error(
        `Story.waitExpired: no ${engine.describeTarget(target)} is waiting on refetches; pending: ${
          engine.describePending(this.current.pending)
        }`
      )
    }
    return this.step(engine.settleWaits(this.current, (awaited) => entry.awaiting!.includes(awaited)))
  }
  loaded(name: string, ...rest: Array<any>): this {
    if (engine.isKeyed(this.current, name)) {
      const [args, value, options] = rest
      return this.step(engine.loadKeyedStep(this.current, "Story.loaded", name, [{ args, value, ...options }]))
    }
    const [value, options] = rest as [
      unknown,
      { readonly waiting?: boolean | undefined; readonly patched?: boolean | undefined } | undefined
    ]
    return this.step(
      engine.settleStep(
        this.current,
        "Story.loaded",
        name,
        options?.patched === true,
        options?.waiting === true,
        () => AsyncResult.success(value, { waiting: options?.waiting, timestamp: 0 })
      )
    )
  }
  loadedMore(name: string, page: unknown): this {
    return this.step(engine.settleMore(this.current, "Story.loadedMore", name, (pages) => [...pages, page]))
  }
  loadMoreFailed(name: string, error: unknown): this {
    return this.step(
      engine.settleMore(this.current, "Story.loadMoreFailed", name, (pages) => pages, { _tag: "Failed", error })
    )
  }
  loadFailed(name: string, ...rest: Array<any>): this {
    if (engine.isKeyed(this.current, name)) {
      const [args, error, options] = rest
      return this.step(
        engine.loadKeyedStep(this.current, "Story.loadFailed", name, [{ args, error, waiting: options?.waiting }])
      )
    }
    const [error, options] = rest as [unknown, { readonly waiting?: boolean | undefined } | undefined]
    return this.step(
      engine.settleStep(
        this.current,
        "Story.loadFailed",
        name,
        false,
        options?.waiting === true,
        (previousSuccess) => AsyncResult.failure(Cause.fail(error), { previousSuccess, waiting: options?.waiting })
      )
    )
  }
  loadedMany(name: string, entries: ReadonlyArray<Shared.KeyedLoad<any>>): this {
    return this.step(engine.loadKeyedStep(this.current, "Story.loadedMany", name, entries))
  }

  model(f: (model: any) => void): this {
    f(this.current.model)
    return this
  }
  view(f: (view: View.Node<any, any>) => void): this {
    f(this.current.view())
    return this
  }
  emitted(f: (emitted: ReadonlyArray<any>) => void): this {
    f(this.current.emitted)
    return this
  }
  sent(f: (sent: ReadonlyArray<Component.Send>) => void): this {
    f(this.current.sent)
    return this
  }
  subscriptions(f: (keys: ReadonlyArray<string>) => void): this {
    f(this.current.subscriptions())
    return this
  }
  loaders(f: (loaders: ReadonlyArray<Shared.LoaderInfo>) => void): this {
    f(this.current.loaders())
    return this
  }
  check(f: (story: Story<any, any, any, any, any>) => void): this {
    f(this.current)
    return this
  }

  expectExact(...targets: ReadonlyArray<Shared.Target>): this {
    const pending = this.current.pending
    if (
      pending.length !== targets.length || !targets.every((target, index) => engine.matches(target, pending[index]))
    ) {
      throw new Error(
        `Story.expectExact: expected ${
          targets.length === 0 ? "nothing" : targets.map(engine.describeTarget).join(", ")
        }; pending: ${engine.describePending(pending)}`
      )
    }
    return this
  }
  expectHas(target: Shared.Target): this {
    const pending = this.current.pending
    if (!pending.some((entry) => engine.matches(target, entry))) {
      throw new Error(
        `Story.expectHas: ${engine.describeTarget(target)} is not pending; pending: ${engine.describePending(pending)}`
      )
    }
    return this
  }
  expectNone(): this {
    if (this.current.pending.length > 0) {
      throw new Error(`Story.expectNone: pending: ${engine.describePending(this.current.pending)}`)
    }
    return this
  }
}

/**
 * Runs a story: `init` with `props`, then the steps `f` calls on the cursor.
 *
 * **Details**
 *
 * `f` doesn't need to return the cursor, so a chained arrow and a block of
 * statements both work. `make` returns the final story so a test can read it,
 * and throws if a Command is still pending at the end.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make: {
  <C extends AnyComponent>(
    component: C,
    props: Component.Props<C>,
    f: (steps: Steps<C>) => void
  ): Steps<C>["current"]
  /**
   * A story of a headless component: `view` stands in for a consumer's
   * closure. Its `h` has no messages of its own, so every handler in the
   * story is one of the component's parts'. `h` builds elements from
   * `elements`, then the component's own vocabulary, then the registered
   * one. An event runs every part layer on its element, in the runtime's
   * order, and each layer's `preventDefault` applies to its own message.
   */
  <Props, Events, Parts, R, Rcv, V extends View.Elements = never>(
    component: Component.Headless<Props, Events, Parts, R, Rcv>,
    props: Props,
    options: {
      readonly elements?: View.Vocabulary<V> | undefined
      readonly view: (parts: Parts, h: View.Helper<never, Props> & View.Tags<V, never>) => View.Content<never, any>
    },
    f: (steps: Steps<Component.Component<string, Props, any, any, Events, R, V>>) => void
  ): Story<Props, any, any, Events>
} = (
  component: any,
  props: any,
  ...rest: ReadonlyArray<any>
): any => {
  const f: (steps: Steps<any>) => void = rest[rest.length - 1]
  const steps = start(rest.length === 2 ? engine.withView(component, rest[0].view, rest[0].elements) : component, props)
  f(steps)
  const story = steps.current
  if (story.pending.length > 0) {
    throw new Error(`Story.make: Commands still pending at the end: ${engine.describePending(story.pending)}`)
  }
  if (story.loadingMore.length > 0) {
    throw new Error(
      `Story.make: a load more still pending at the end on ${
        story.loadingMore.map((name) => JSON.stringify(name)).join(", ")
      }`
    )
  }
  return story
}

/**
 * The cursor after `init`, with no check on what's pending at the end.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const start = <C extends AnyComponent>(component: C, props: Component.Props<C>): Steps<C> => {
  const first = component.init(props)
  const empty = engine.record<any, any, any, any>({
    // The record is stored with its types erased; `Steps<C>` restores them.
    component: component as Component.Component<any, any, any, any, any, any, any, any, never>,
    props,
    model: first.model,
    slots: undefined,
    pending: [],
    emitted: [],
    sent: [],
    interrupted: [],
    dropped: [],
    loadingMore: [],
    defaultPrevented: false
  }, () => component.view(first.model, props, engine.runningOf([]), undefined))
  return new StepsImpl(engine.apply(empty, first)) as Steps<C>
}

/**
 * The child slots declared in a view, optionally filtered by component or
 * feature service.
 *
 * @stability experimental
 * @category queries
 * @since 0.1.0
 */
export const children = <Msg>(
  view: View.Node<Msg, any>,
  component?: Component.Any | { readonly key: string }
): ReadonlyArray<View.Child<Msg, any>> => engine.children(view, component)

/**
 * The parts of a headless component for a story's Model and props: the
 * plain values a consumer's closure would read.
 *
 * @stability experimental
 * @category queries
 * @since 0.1.0
 */
export const parts = <Props, Events, Parts, R, Rcv>(
  component: Component.Headless<Props, Events, Parts, R, Rcv>,
  story: { readonly model: unknown; readonly props: Props }
): Parts => component.parts(story.model, story.props, { owner: { path: "/" + component.definition.name, depth: 0 } })

/**
 * What the slot with `key` shows for `result`: its `fallback` evaluated with an
 * `AsyncResult.Initial` or `AsyncResult.Failure`, or `undefined` without one.
 * A ref finds the slot rendered with it.
 * Throws, as the runtime fails the parent, if the fallback renders two
 * children at one path, or a child at the path or ref key of another slot of
 * `view`. It sees one fallback, so it can't check two shown at once, as the
 * runtime does.
 *
 * @stability experimental
 * @category queries
 * @since 0.1.0
 */
export const fallback = <Msg>(
  view: View.Node<Msg, any>,
  key: string | Component.Ref.Any,
  result: AsyncResult.Initial<never, unknown> | AsyncResult.Failure<never, unknown>
): View.Node<Msg, any> | undefined => {
  const slot = engine.findChild(view, key, "Story.fallback")
  if (slot.fallback === undefined) return undefined
  const node = View.toNode(slot.fallback(result))
  // As the runtime does: the fallback's children share the parent's paths.
  checkFallbackPaths(checkChildPaths("Story.fallback", view), slot, node)
  return node
}

/**
 * The message `Component.provide`'s `onFailure` maps a Layer failure to, or
 * `undefined` when the component has none.
 *
 * @stability experimental
 * @category queries
 * @since 0.1.0
 */
export const layerFailure = <C extends Component.Any>(
  component: C,
  failure: AsyncResult.Failure<never, any>
): Component.Message<C> | undefined => component.layerFailure?.(failure)

/**
 * One instance's head entries for a Model and props, or for a story's Model,
 * props and loaders: what its `head` option returns, or none without one.
 * The merge across the tree is a runtime test's.
 *
 * **Details**
 *
 * Given a component, every loader slot is empty: each loader opens at the
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
 *   update: (model) => model,
 *   head: (model) => [Head.title(model.name)],
 *   view: (model, h) => h.el("h1", model.name)
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
  <Name extends string, Props, Model, Msg, Events, R, V extends View.Elements, Rcv = never>(
    component: Component.Component<Name, Props, Model, Msg, Events, R, V, any, Rcv>,
    model: Model,
    ...props: {} extends Props ? [props?: Props] : [props: Props]
  ): ReadonlyArray<Head.Entry>
  <Props, Model, Msg, Events>(story: Story<Props, Model, Msg, Events>): ReadonlyArray<Head.Entry>
} = (
  self: AnyComponent | Story<any, any, any, any>,
  model?: unknown,
  props?: unknown
) =>
  "pending" in self
    ? self.component.head?.(self.model, self.props, self.slots) ?? []
    : self.head?.(model, props ?? {}, undefined) ?? []

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
 * loader slots), how many messages it re-ran, and the first divergence, if
 * any. On a divergence, the state is the one the diverging message was sent
 * to: the Model before it, and the props and slots its `update` read.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Replay<
  Model,
  Msg,
  Events,
  Loaded = { readonly [name: string]: unknown },
  Props = unknown
> {
  readonly path: string
  readonly model: Model
  /** The props the instance had, from its latest `Mounted`, `PropsChanged` or `Update` entry. */
  readonly props: Props
  /** The loader slots, beside the Model. Opaque: `loaded` opens them. */
  readonly slots: Component.Slots | undefined
  /** The loaders' results, by name, as `h.loaded` opens them for the Model, props and slots reached. */
  readonly loaded: () => Loaded
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
 * the props and loader slots it was recorded with, so every `update` sees
 * `$.loaded` as it did when it ran, whichever entries the log still holds.
 * Commands are compared, never run. Models and events are compared with
 * `Schema.toEquivalence`, and Commands by their Wire encoding.
 *
 * The props and slots are tracked with the Model, so the result is the state
 * the instance ended with. They start from the first entry: a `Mounted`
 * entry's props and empty slots, or an `Update` entry's recorded props and
 * slots. Each later `PropsChanged` entry sets the props and each
 * `LoaderChanged` entry writes its slot, so props from the parent and loads
 * that settled after the last message are in the result too.
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
  { readonly [K in keyof Component.Loaders<C>]: Component.LoadedOf<Component.Loaders<C>[K]> },
  Component.Props<C>
> = (component, entries, options) =>
  replay.replayLog(
    "Story.fromLog",
    component as Component.Component<string, any, any, any, any, any, any, any, any>,
    entries,
    options
  ) as any
