/**
 * Mounts are the work an element starts with its host node, such as drawing
 * on a canvas or measuring a box.
 *
 * A mount is a definition: `Mount.make(name, { args }, run)` takes a name, an
 * `args` Schema and a body, and returns a factory. A view calls the factory
 * with the args and gives the result to an element's `onMount`. The runtime
 * runs the body once the element is committed, and a test names the mount by
 * its definition without running anything.
 *
 * The body gets the host node, the args and a Stream of the args, and ends
 * with its own result. The view maps that result to a message with
 * `Mount.map`. When there is nothing to report, return `Component.noop`.
 * It sends no message, but the log still records when the body starts and
 * ends. Use `Mount.makeStream` for a mount that reports as it goes, such as
 * a widget that sends events. Its body is a Stream of results.
 *
 * **Example** (A mount that follows its args)
 *
 * ```ts import.meta.vitest
 * import { Component, Mount } from "@effect/ui"
 * import { Effect, Schema, Stream } from "effect"
 *
 * declare const draw: (canvas: HTMLCanvasElement, points: ReadonlyArray<number>) => void
 *
 * const DrawChart = Mount.make(
 *   "DrawChart",
 *   { args: { points: Schema.Array(Schema.Number) } },
 *   (canvas: HTMLCanvasElement, _args, changes) =>
 *     Stream.runForEach(changes, ({ points }) => Effect.sync(() => draw(canvas, points))).pipe(
 *       Effect.as(Component.noop)
 *     )
 * )
 *
 * // In a view: `h.canvas.onMount(DrawChart({ points: model.points }))`
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Effect from "effect/Effect"
import { dual } from "effect/Function"
import * as Pipeable from "effect/Pipeable"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import type * as Types from "effect/Types"
import type * as Command from "./Command.ts"
import type * as Kernel from "./internal/kernel.ts"
import * as mountArgs from "./internal/mountArgs.ts"
import * as mountRun from "./internal/mountRun.ts"

/**
 * Identifies an issued mount.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export const TypeId = "~@effect/ui/Mount" as const

/**
 * The type of `TypeId`.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export type TypeId = typeof TypeId

/**
 * Identifies a mount definition.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export const DefinitionTypeId = "~@effect/ui/Mount/Definition" as const

/**
 * The type of `DefinitionTypeId`.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export type DefinitionTypeId = typeof DefinitionTypeId

/**
 * The options of `make`.
 *
 * **Details**
 *
 * `args` is required: a fields record or a `Schema.Struct`. A mount with no
 * args writes `args: {}`. The log encodes a mount's args through it,
 * redacting `Schema.Redacted` fields, and the runtime uses its equivalence
 * to tell whether a render changed them.
 *
 * The optional `paint` callback draws the node synchronously from its args
 * on a copy of the page that runs no mounts, such as DevTools time travel.
 * The runtime calls it once after the node is attached, without `send` or
 * a Scope. Only draw: do not attach listeners or acquire resources.
 * If `paint` is absent or throws, the copy reports the instance as skipped;
 * without `paint`, the node stays as the view rendered it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options<In extends Command.ArgsInput, Node = unknown> {
  readonly args: In
  readonly paint?:
    | ((node: Node, args: Command.ArgsOf<In>) => void)
    | undefined
}

/**
 * A mount definition: what a test names a mount by.
 *
 * **Details**
 *
 * `Args` is the args struct, `A` the body's result, `Node` the host node the
 * body needs and `R` what it requires. Story steps such as `mounted` take a
 * definition and are typed by it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Definition<in Args, out A, in Node = unknown, out R = never> {
  readonly [DefinitionTypeId]: Definition.Variance<Args, A, Node, R>
  readonly name: string
  /** The args Schema. */
  readonly args: Schema.Top
}

/**
 * Helper types for `Definition`.
 *
 * @stability experimental
 * @since 0.1.0
 */
export declare namespace Definition {
  /**
   * Phantom variance for a definition's args, result, node and requirements.
   *
   * @category models
   * @since 0.1.0
   */
  export interface Variance<in Args, out A, in Node, out R> {
    readonly _Args: Types.Contravariant<Args>
    readonly _A: Types.Covariant<A>
    readonly _Node: Types.Contravariant<Node>
    readonly _R: Types.Covariant<R>
  }

  /**
   * Any mount definition.
   *
   * @category models
   * @since 0.1.0
   */
  export type Any = Definition<any, any, any, any>
}

/**
 * What `make` returns: call it with the mount's args struct to issue it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Factory<
  in out Args,
  in out A,
  in Node = unknown,
  out R = never
> extends Definition<Args, A, Node, R> {
  (...args: Command.MakeArgs<Args>): Issued<A, R, Node, A>
}

/**
 * An issued mount: what a definition's factory returns, and what `onMount`
 * takes.
 *
 * **Details**
 *
 * `Msg` is what it ends with, after every `map`. `R` is what its body
 * requires and `Node` the host node the body needs: `onMount` accepts a
 * mount whose `Node` the element's node is assignable to. `Source` is the
 * definition's own result, before any `map`, which a story's `mounted` step
 * takes.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Issued<
  out Msg,
  out R = never,
  in Node = unknown,
  in Source = Msg
> extends Pipeable.Pipeable {
  readonly [TypeId]: Variance<Msg, R, Node, Source>
  /** The definition's name, shown in the log and in test failures. */
  readonly name: string
  /** The args struct the mount was issued with. Data a test asserts on without running the body. */
  readonly args: unknown
  /**
   * The args Schema, for the log and for comparing args.
   *
   * @internal
   */
  readonly argsSchema: Schema.Top
  /**
   * Whether the body gives any number of results, as `makeStream`'s does,
   * rather than one. A test ends a mount that gives one only once.
   *
   * @internal
   */
  readonly stream: boolean
  /**
   * The definition's body, before any `map`, giving each result to `send`.
   *
   * @internal
   */
  readonly run: (
    node: Node,
    args: any,
    changes: Stream.Stream<any>,
    send: (result: any) => Effect.Effect<void>
  ) => Effect.Effect<void, never, R>
  /**
   * Maps the definition's result to what this mount ends with, composing
   * every `map` applied since it was issued.
   *
   * @internal
   */
  readonly resolve: (result: Source) => Msg
  /**
   * The definition's `paint`, for a copy of the page that runs no mounts.
   *
   * @internal
   */
  readonly paint: ((node: Node, args: any) => void) | undefined
  /**
   * What keeps a running mount's args and gives their changes. A runtime
   * reaches it through the mount, so an app that issues none ships none of
   * it.
   *
   * @internal
   */
  readonly "~args": typeof mountArgs
  /**
   * `sameArgs` with `that`, reached through the mount for the same reason.
   *
   * @internal
   */
  readonly "~sameArgs": (that: Any) => boolean
}

/**
 * Phantom variance for an issued mount.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Variance<out Msg, out R, in Node, in Source> {
  readonly _Msg: Types.Covariant<Msg>
  readonly _R: Types.Covariant<R>
  readonly _Node: Types.Contravariant<Node>
  readonly _Source: Types.Contravariant<Source>
}

/**
 * Any issued mount.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Any = Issued<any, any, never, never>

/**
 * The result of a mount's definition, before any `map`: what a story's
 * `mounted` step takes. Accepts a definition or an issued mount.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type Result<M> = M extends
  Definition<infer _Args, infer A, infer _Node, infer _R> ? A
  : M extends Issued<infer _Msg, infer _R, infer _Node, infer Source> ? Source
  : never

/**
 * The args struct a definition is issued with.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type Args<D> = D extends
  Definition<infer Args, infer _A, infer _Node, infer _R> ? Args : never

const identity = (result: any) => result

const Proto = {
  [TypeId]: {
    _Msg: identity,
    _R: identity,
    _Node: identity,
    _Source: identity
  },
  "~args": {
    make: mountArgs.make,
    publish: mountArgs.publish,
    close: mountArgs.close,
    changes: mountArgs.changes
  },
  "~sameArgs"(this: Any, that: Any) {
    return sameArgs(this, that)
  },
  "~attach"(this: Any, rec: Kernel.Rec) {
    mountRun.attach(this, rec)
  },
  "~detach"(rec: Kernel.Rec) {
    mountRun.detach(rec)
  },
  pipe() {
    return Pipeable.pipeArguments(this, arguments)
  }
}

interface Fields {
  readonly name: string
  readonly args: unknown
  readonly argsSchema: Schema.Top
  readonly stream: boolean
  readonly run: Issued<any, any, any, any>["run"]
  readonly resolve: (result: any) => any
  readonly paint: Issued<any, any, any, any>["paint"]
}

const makeIssued = (fields: Fields): any =>
  Object.assign(Object.create(Proto), fields)

/**
 * Returns `true` if `u` is an issued mount.
 *
 * @stability experimental
 * @category guards
 * @since 0.1.0
 */
export const isMount = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId)

/**
 * Returns `true` if `u` is a mount definition.
 *
 * @stability experimental
 * @category guards
 * @since 0.1.0
 */
export const isDefinition = (u: unknown): u is Definition.Any =>
  Predicate.hasProperty(u, DefinitionTypeId)

/**
 * Defines a mount.
 *
 * **When to use**
 *
 * Use when work needs an element's host node, such as focusing or measuring
 * it, or handing it to an imperative library such as a chart or a map.
 *
 * **Details**
 *
 * Requires an `args` Schema and returns a factory that takes the args struct
 * and issues the mount: `h.canvas.onMount(DrawChart({ points }))`. The body
 * runs once per element, after it's committed, in a Scope that closes when
 * the element goes. It gets:
 *
 * - `node`, the host node. Annotate it with the node the body needs, and
 *   `onMount` then rejects an element that renders to another kind of node.
 *   Left unannotated it's `unknown`, and the mount goes on any element.
 * - `args`, the args the element had when the mount started.
 * - `changes`, a Stream that starts with the current args and gives each new
 *   one, when a render's args differ by the Schema's equivalence. A reader
 *   that falls behind gets only the latest.
 *
 * The body ends with its own result, which a view maps to a message with
 * `map`. When there is nothing to report, return `Component.noop`: the log
 * records `MountEnded` with `silent: true` instead of an `Update`. The body's
 * requirements join those of the component that renders it.
 *
 * **Gotchas**
 *
 * Args with no real Schema, such as a callback or a class instance, need
 * `Schema.declare` or `Schema.Any`. They then compare by identity and show
 * in the log as a placeholder.
 *
 * **Example** (A mount with a result)
 *
 * ```ts import.meta.vitest
 * import { Mount, UiSchema } from "@effect/ui"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ CompletedMeasure: { width: Schema.Number } })
 *
 * const Measure = Mount.make("Measure", { args: {} }, (node: HTMLElement) =>
 *   Effect.sync(() => node.getBoundingClientRect().width))
 *
 * // In a view
 * const measure = Measure().pipe(Mount.map((width) => Message.CompletedMeasure({ width })))
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = <
  const Name extends string,
  const In extends Command.ArgsInput,
  A,
  Node = unknown,
  R = never
>(
  name: Name,
  options: Options<In, Node>,
  run: (
    node: Node,
    args: Command.ArgsOf<In>,
    changes: Stream.Stream<Command.ArgsOf<In>>
  ) => Effect.Effect<A, never, R>
): Factory<Command.ArgsOf<In>, A, Node, R> =>
  define(
    name,
    options,
    false,
    (node, args, changes, send) =>
      Effect.flatMap(run(node, args, changes), send)
  )

/**
 * Defines a mount that sends a result for each value of a Stream, for as long
 * as its element lives.
 *
 * **When to use**
 *
 * Use when the work behind a host node reports more than once, such as a
 * chart's clicks, a map's moves or an editor's changes.
 *
 * **Details**
 *
 * As `make`, but the body returns a Stream. Each value goes through the
 * `map` of the latest render and is sent to the component, and a value
 * mapped to `Component.noop` sends nothing. The Stream runs in the mount's
 * Scope, so a listener it adds with `Stream.callback` is removed when the
 * element goes. When the Stream ends, the mount sends nothing more.
 *
 * In a story, each `mounted` step sends one value.
 *
 * **Example** (A widget's events)
 *
 * ```ts import.meta.vitest
 * import { Mount, UiSchema } from "@effect/ui"
 * import { Effect, Queue, Schema, Stream } from "effect"
 *
 * interface Editor {
 *   readonly onChange: (f: (text: string) => void) => () => void
 * }
 * declare const createEditor: (node: HTMLElement, text: string) => Editor
 *
 * const Message = UiSchema.TaggedEnum({ ChangedText: { text: Schema.String } })
 *
 * const AttachEditor = Mount.makeStream(
 *   "AttachEditor",
 *   { args: { text: Schema.String } },
 *   (node: HTMLElement, { text }) =>
 *     Stream.callback<string>((queue) =>
 *       Effect.acquireRelease(
 *         Effect.sync(() => createEditor(node, text).onChange((text) => Queue.offerUnsafe(queue, text))),
 *         (unsubscribe) => Effect.sync(unsubscribe)
 *       )
 *     )
 * )
 *
 * // In a view
 * const editor = AttachEditor({ text: "" }).pipe(Mount.map((text) => Message.ChangedText({ text })))
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const makeStream = <
  const Name extends string,
  const In extends Command.ArgsInput,
  A,
  Node = unknown,
  R = never
>(
  name: Name,
  options: Options<In, Node>,
  run: (
    node: Node,
    args: Command.ArgsOf<In>,
    changes: Stream.Stream<Command.ArgsOf<In>>
  ) => Stream.Stream<A, never, R>
): Factory<Command.ArgsOf<In>, A, Node, R> =>
  define(
    name,
    options,
    true,
    (node, args, changes, send) =>
      Stream.runForEach(run(node, args, changes), send)
  )

const define = (
  name: string,
  options: Options<Command.ArgsInput, any>,
  stream: boolean,
  run: Fields["run"]
): any => {
  const argsSchema = Schema.isSchema(options.args)
    ? options.args as Schema.Top
    : Schema.Struct(options.args as Schema.Struct.Fields)
  const factory = (args: unknown = {}) =>
    makeIssued({
      name,
      args,
      argsSchema,
      stream,
      run,
      resolve: identity,
      paint: options.paint
    })
  Object.defineProperty(factory, "name", { value: name })
  return Object.assign(factory, {
    [DefinitionTypeId]: DefinitionTypeId,
    args: argsSchema
  })
}

/**
 * Maps what a mount ends with.
 *
 * **When to use**
 *
 * Use to turn a mount's own result into the component's message, in a view.
 *
 * **Details**
 *
 * The name and args are kept, so the log and tests still see the original
 * mount, and a story's `mounted` step still takes the definition's own
 * result. The runtime applies the map of the latest render when the mount
 * ends, so a value the map closes over is current.
 *
 * @stability experimental
 * @category mapping
 * @since 0.1.0
 */
export const map: {
  <A, B>(
    f: (a: A) => B
  ): <R, Node, Source>(
    self: Issued<A, R, Node, Source>
  ) => Issued<B, R, Node, Source>
  <A, R, Node, Source, B>(
    self: Issued<A, R, Node, Source>,
    f: (a: A) => B
  ): Issued<B, R, Node, Source>
} = dual(
  2,
  <A, R, Node, Source, B>(
    self: Issued<A, R, Node, Source>,
    f: (a: A) => B
  ): Issued<B, R, Node, Source> => {
    const resolve = self.resolve
    return makeIssued({
      name: self.name,
      args: self.args,
      argsSchema: self.argsSchema,
      stream: self.stream,
      run: self.run,
      resolve: (result) => f(resolve(result)),
      paint: self.paint
    })
  }
)

/**
 * Whether two issued mounts are one mount with the same args: the same name,
 * and args equal by the args Schema's equivalence. The runtime and a story
 * both decide "changed" with it.
 *
 * @internal
 */
export const sameArgs = (self: Any, that: Any): boolean => {
  if (self.name !== that.name) return false
  if (self.args === that.args) return true
  // `Schema.toEquivalence` keeps the equivalence it derives for a schema.
  return Schema.toEquivalence(self.argsSchema as Schema.Schema<unknown>)(
    self.args,
    that.args
  )
}
