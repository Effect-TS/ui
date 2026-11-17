/**
 * The steps every kind of test shares, and the data they work on.
 *
 * A test kind's cursor, such as `Story.Steps`, extends `Steps.Steps`: it
 * starts from a Model, changes the props, settles Commands and loaders, and
 * checks what was emitted, sent and asked for. What each kind adds on top is
 * how a test drives the instance and what it can see. A helper typed over
 * `Steps.Steps.Any` works with any kind's cursor and keeps the caller's type.
 *
 * @stability experimental
 * @since 0.1.0
 */
import type { Pipeable } from "effect/Pipeable"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Command from "../Command.ts"
import type * as Component from "../Component.ts"
import type * as Loader from "../Loader.ts"

/**
 * A Command issued by the instance whose message hasn't been delivered.
 *
 * **Details**
 *
 * `running` is what the runtime would be executing; `queued` is waiting behind
 * a running run of the same group under `mode: "queue"`. `awaiting` has
 * resolved or failed, and holds `message`: a `Command.afterRefetch` run
 * waits for the loaders in `awaiting`, and under `mode: "queue"` a
 * message also waits for the earlier ones of its group.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Pending<Msg> {
  readonly command:
    | Command.Issued<Msg | Component.Noop, any, never, "Effect">
    | Command.Issued<Msg | Component.Noop, any, never, "Stream">
  readonly status: "running" | "queued" | "awaiting"
  /** On an awaiting run: the message it delivers when its wait ends, or `Component.noop` for none. */
  readonly message?: Msg | Component.Noop | undefined
  /** On an awaiting run: the loaders its wait is still on, each at the args it awaits. */
  readonly awaiting?: ReadonlyArray<AwaitedLoader> | undefined
}

/**
 * A loader a `Command.afterRefetch` run waits for, by its name in
 * `loaders`, at the args it returned when the run resolved. A `loadMany`
 * loader has one per awaited key.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface AwaitedLoader {
  readonly name: string
  readonly args: unknown
}

/**
 * The state of one instance between steps that every kind of test records.
 * Immutable: every step replaces the cursor's record with a new one. Each
 * kind's record extends it with what that kind can see.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Record<Props, Model, Msg, Events> {
  /** The component, erased to receive nothing: a test doesn't know what it receives. */
  readonly component: Component.Component<any, Props, Model, Msg, Events, any, any, any, never>
  readonly props: Props
  /** Commands issued but not yet resolved, oldest first. */
  readonly pending: ReadonlyArray<Pending<Msg>>
  /** Everything emitted to the parent so far. */
  readonly emitted: ReadonlyArray<Events>
  /** Every `$.send` to a child so far, in order. A test renders no children, so nothing receives them. */
  readonly sent: ReadonlyArray<Component.Send>
  /**
   * Commands interrupted by `switch`, by an interrupt Command, or by `given`.
   * An awaiting run that is cut delivers its message instead, and isn't here.
   */
  readonly interrupted: ReadonlyArray<
    | Command.Issued<Msg | Component.Noop, any, never, "Effect">
    | Command.Issued<Msg | Component.Noop, any, never, "Stream">
  >
  /** Commands ignored by `mode: "drop"`. */
  readonly dropped: ReadonlyArray<
    | Command.Issued<Msg | Component.Noop, any, never, "Effect">
    | Command.Issued<Msg | Component.Noop, any, never, "Stream">
  >
  /** The list loaders with a load more `update` issued and no step has settled yet. */
  readonly loadingMore: ReadonlyArray<string>
  /** The Subscription keys the current Model and props ask for, without the loader watches. Nothing runs. */
  readonly subscriptions: () => ReadonlyArray<string>
  /** Each loader with its read and the args it returns for the current Model and props. */
  readonly loaders: () => ReadonlyArray<LoaderInfo>
}

/**
 * One loader in a story: its name, its read's name, and the args it returns
 * for the current Model and props, `undefined` when it is disabled. A
 * `loadMany` loader's args are its unique args, in order.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface LoaderInfo {
  readonly name: string
  readonly read: string
  readonly args: unknown
}

// The read of a loader entry, for the steps that name a loader.
type ReadOf<D> = D extends Component.Load<infer R> ? R : D extends Component.LoadMany<infer R> ? R : never

/**
 * One key of a `loadMany` loader for `loadedMany`: its args and a Success
 * value or a typed failure.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type KeyedLoad<R extends Loader.Read.Any> =
  | {
    readonly args: Loader.Read.Args<R>
    readonly value: Loader.Read.Success<R>
    readonly waiting?: boolean | undefined
    readonly patched?: boolean | undefined
  }
  | {
    readonly args: Loader.Read.Args<R>
    readonly error: Loader.Read.Error<R>
    readonly waiting?: boolean | undefined
  }

/**
 * A pending Command's definition, or an issued Command to also match the
 * arguments.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Target =
  | Command.Definition.Any
  | Command.Issued<any, any, never, "Effect">
  | Command.Issued<any, any, never, "Stream">

/**
 * A stream Command's definition, or an issued stream Command: what `next` and
 * `end` take.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type StreamTarget = Command.Definition<any, any, true, any, any> | Command.Issued<any, any, never, "Stream">

// A component with no messages has `Msg = never`, and its `update` can't take `any`, so it needs its own member.
// `Rcv` is invariant, and `any` doesn't stand for `never`, so one that receives nothing needs its own members too.
type AnyComponent =
  | Component.Component<any, any, any, any, any, any, any, any, any>
  | Component.Component<any, any, any, never, any, any, any, any, any>
  | Component.Component<any, any, any, any, any, any, any, any, never>
  | Component.Component<any, any, any, never, any, any, any, any, never>

/**
 * The steps every kind of test shares. Each step runs as soon as it's
 * called, replaces `current` and returns the cursor, so steps chain. A step
 * that fails throws.
 *
 * **Details**
 *
 * The types come from the component: a cursor over `Counter` only takes
 * `Counter`'s Model, Commands and loaders. A step shared by any component,
 * and by any kind of test, is written `<S extends Steps.Steps.Any>(s: S): S`,
 * which keeps the caller's type, so the kind's own steps still chain after it.
 *
 * **Example** (A check shared by every kind of test)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Component } from "@effect/ui"
 * import { Steps, Story } from "@effect/ui/testing"
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
 * const quiet = <S extends Steps.Steps.Any>(s: S): S =>
 *   s.expectNone().emitted((emitted) => {
 *     if (emitted.length > 0) throw new Error("emitted")
 *   })
 *
 * const story = Story.make(Counter, {}, (s) => s.pipe(quiet).send(Message.make({ _tag: "Increment" })))
 * console.log(story.model.count) // 1
 * ```
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Steps<C extends AnyComponent> extends Pipeable {
  /** Delivers a message the component receives from its parent. An updater reads the current Model. */
  receive(message: Component.Receives<C> | ((model: Component.Model<C>) => Component.Receives<C>)): this

  /**
   * Delivers a message from an active Subscription, using the key reported by
   * subscriptions. Throws for inactive keys and loader watch keys, listing
   * the active keys. The message is not checked against the source Stream.
   */
  subscription(key: string, message: Component.Message<C>): this

  /** Delivers the message mapped by Component.provide's onFailure, or does nothing without one. */
  layerFailed(failure: AsyncResult.Failure<never, any>): this

  /** The record after the last step. */
  readonly current: Record<
    Component.Props<C>,
    Component.Model<C>,
    Component.Message<C>,
    Component.Events<C>
  >

  /**
   * Starts from any Model, forgetting what was issued and emitted so far. An
   * updater is called with the current Model: `given(f)` is exactly
   * `given(f(model))`.
   *
   * **Details**
   *
   * `given` never runs `update`. Loaders keep their slots, except that a
   * keyed loader drops the stored keys it no longer returns, with no
   * `onChange` message. Later steps send `onChange` as usual.
   *
   * `loaded` starts the loaders it names from loaded results: a Success
   * value, a list loader's page array, or a keyed loader's entries as
   * `loadedMany` takes them. Each slot is written at the args the loader
   * returns for the new Model and the given results, so a loader whose args
   * read another's result follows the new one, whatever the order of the keys
   * and whatever the slots held before. The view renders once. It throws if a
   * named loader is disabled, or a keyed entry's args aren't ones the loader
   * returns.
   */
  given(
    model: Component.Model<C> | ((model: Component.Model<C>) => Component.Model<C>),
    loaded?: {
      readonly [K in keyof Component.Loaders<C>]?: Component.Loaders<C>[K] extends Component.LoadMany<infer R>
        ? ReadonlyArray<KeyedLoad<R>>
        : Loader.Read.Success<ReadOf<Component.Loaders<C>[K]>>
    }
  ): this
  /**
   * Changes the props. A props change never reaches `update`: it re-renders the
   * view and changes the Subscription keys.
   */
  props(next: Component.Props<C> | ((props: Component.Props<C>) => Component.Props<C>)): this

  /**
   * Resolves the oldest running Command matching `target` with the result it
   * would have produced, and sends the message.
   *
   * **Details**
   *
   * A definition matches by identity; an issued Command also matches the
   * arguments. `result` is the definition's own result, before any
   * `Command.map`, which is replayed to produce the component's message. A
   * queued run of the same group starts when the running one resolves.
   *
   * A Command issued with `Command.afterRefetch` becomes `awaiting` on the
   * component's own loaders its declared targets match, less those its
   * `writes` store, and sends at once when there are none. A `loaded` or
   * `loadFailed` step on the last of them writes the loader's slot, then
   * sends this one. `waitExpired` ends the wait by budget. Under `mode: "queue"`
   * a message also waits for the earlier ones of its group.
   */
  resolve<D extends Target>(target: D, result: Command.Result<D>): this
  /**
   * Fails the oldest running Command matching `target` with a typed failure
   * of its body, and sends the message its `Command.match` maps it to. A
   * stream Command ends. Throws for a Command whose body can't fail. A
   * failure doesn't wait for refetches.
   */
  fail<D extends Target>(target: D, error: Command.Failure<D>): this
  /** Sends one element of the oldest running stream Command matching `target`, which stays pending. */
  next<D extends StreamTarget>(target: D, result: Command.Result<D>): this
  /** Ends the oldest running stream Command matching `target`, sending nothing. */
  end<D extends StreamTarget>(target: D): this
  /**
   * Ends the `Command.afterRefetch` wait of the oldest awaiting Command
   * matching `target` by its budget, and sends its message. Throws when no
   * matching Command is waiting.
   */
  waitExpired(target: Target): this

  /**
   * Loads a loader with a Success: writes its slot at the loader's current
   * args, then sends the message of its `onChange`, if any. Throws when the
   * loader is disabled. For a list loader `value` is the page array, and
   * unless `waiting` it settles a pending load more.
   *
   * **Details**
   *
   * Unless `waiting` or `patched`, it is a settle: it ends a
   * `Command.afterRefetch` wait on the loader. It throws while a running or
   * queued Command's patch is live on the loader, since no fetch settles
   * under a live patch: only a `patched` value is written then. As in the
   * cache, a patch is live only when the slot held a Success at issue.
   */
  loaded<N extends Component.SingleNames<Component.Loaders<C>>>(
    name: N,
    value: Loader.Read.Success<ReadOf<Component.Loaders<C>[N]>>,
    options?: { readonly waiting?: boolean | undefined; readonly patched?: boolean | undefined }
  ): this
  /**
   * Loads one key of a `loadMany` loader with a Success, as `loadedMany`
   * does with one entry.
   */
  loaded<N extends Component.KeyedNames<Component.Loaders<C>>>(
    name: N,
    args: Loader.Read.Args<ReadOf<Component.Loaders<C>[N]>>,
    value: Loader.Read.Success<ReadOf<Component.Loaders<C>[N]>>,
    options?: { readonly waiting?: boolean | undefined; readonly patched?: boolean | undefined }
  ): this
  /**
   * Loads a loader with a typed failure, as `loaded` does. The failure keeps
   * the slot's last Success as `previousSuccess` when it holds one at the
   * loader's current args. Unless `waiting`, it settles a list loader's
   * pending load more.
   */
  loadFailed<N extends Component.SingleNames<Component.Loaders<C>>>(
    name: N,
    error: Loader.Read.Error<ReadOf<Component.Loaders<C>[N]>>,
    options?: { readonly waiting?: boolean | undefined }
  ): this
  /** Loads one key of a `loadMany` loader with a typed failure, as `loadedMany` does with one entry. */
  loadFailed<N extends Component.KeyedNames<Component.Loaders<C>>>(
    name: N,
    args: Loader.Read.Args<ReadOf<Component.Loaders<C>[N]>>,
    error: Loader.Read.Error<ReadOf<Component.Loaders<C>[N]>>,
    options?: { readonly waiting?: boolean | undefined }
  ): this
  /**
   * Settles a list loader's pending load more with its next page: writes the
   * loader's pages with `page` appended. Throws when no load more is
   * pending.
   */
  loadedMore<N extends Component.ListNames<Component.Loaders<C>>>(
    name: N,
    page: Loader.ListRead.Page<ReadOf<Component.Loaders<C>[N]>>
  ): this
  /**
   * Settles a list loader's pending load more with a failure: the pages stay,
   * and `more` is `Failed` with `error`. Throws when no load more is
   * pending.
   */
  loadMoreFailed<N extends Component.ListNames<Component.Loaders<C>>>(
    name: N,
    error: Loader.Read.Error<ReadOf<Component.Loaders<C>[N]>>
  ): this
  /**
   * Loads several keys of a `loadMany` loader in one write, as the runtime
   * writes a first emission or a batch: the slot holds the loader's stored
   * keys and these, and `onChange`'s `changes` holds these. Throws on args
   * the loader doesn't currently return.
   */
  loadedMany<N extends Component.KeyedNames<Component.Loaders<C>>>(
    name: N,
    entries: ReadonlyArray<KeyedLoad<ReadOf<Component.Loaders<C>[N]>>>
  ): this

  /** Checks everything emitted so far. `f` throws to fail the test. */
  emitted(f: (emitted: ReadonlyArray<Component.Events<C>>) => void): this
  /** Checks every `$.send` to a child so far. `f` throws to fail the test. */
  sent(f: (sent: ReadonlyArray<Component.Send>) => void): this
  /** Checks the Subscription keys the current Model and props ask for. `f` throws to fail the test. */
  subscriptions(f: (keys: ReadonlyArray<string>) => void): this
  /** Checks the loaders and their current args. `f` throws to fail the test. */
  loaders(f: (loaders: ReadonlyArray<LoaderInfo>) => void): this
  /** Checks the whole record, as the kind of test records it. `f` throws to fail the test. */
  check(f: (current: this["current"]) => void): this

  /** Asserts that exactly these Commands are pending, in order. */
  expectExact(...targets: ReadonlyArray<Target>): this
  /** Asserts that a Command matching `target` is pending. */
  expectHas(target: Target): this
  /** Asserts that nothing is pending. */
  expectNone(): this
}

/**
 * Helper types for `Steps`.
 *
 * @stability experimental
 * @since 0.1.0
 */
export declare namespace Steps {
  /**
   * A cursor over any component, of any kind of test, for steps shared
   * across components and kinds.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  export type Any = Steps<AnyComponent>
}
