/**
 * Features are components a parent refers to by service instead of by value,
 * so the implementation can be swapped with a Layer.
 *
 * A feature service holds the contract: the Props and Events Schemas, and the
 * messages a parent may send, if any. Model and Message belong to the
 * implementation. The app provides an implementation
 * with `Todos.toLayer(TodoList)`, and a test or storybook provides a fake with
 * `Todos.toLayer(FakeTodos)`. A parent renders it with `Todos.render(h, ...)` and
 * requires `Todos` only: the implementation's requirements are closed where
 * the feature's Layer is built.
 *
 * **Example** (Declaring a feature and providing an implementation)
 *
 * ```ts import.meta.vitest
 * import { Component, Feature, UiSchema } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const TodosProps = Schema.Struct({ filter: Schema.Literals(["all", "open"]) })
 * const TodosEvents = UiSchema.TaggedEnum({ Counted: { open: Schema.Number } })
 *
 * class Todos extends Feature.Service<Todos>()("Todos", { props: TodosProps, events: TodosEvents }) {}
 *
 * const TodoList = Component.define({
 *   name: "TodoList",
 *   scoped: false,
 *   props: TodosProps,
 *   model: Schema.Struct({}),
 *   message: Schema.Never,
 *   events: TodosEvents
 * }).make({
 *   init: () => ({}),
 *   update: (model) => model,
 *   view: (_, h) => h.el("ul")
 * })
 *
 * // The app picks the implementation. A test provides a fake the same way.
 * const TodosLive = Todos.toLayer(TodoList)
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import type * as Component from "./Component.ts"
import * as child from "./internal/child.ts"
import * as childRef from "./internal/ref.ts"
import type * as View from "./View.ts"

/**
 * Identifies a feature service.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export const TypeId = "~@effect/ui/Feature" as const

/**
 * Identifies a feature service.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export type TypeId = typeof TypeId

/**
 * The value behind a feature service: a closed component.
 *
 * **Details**
 *
 * `context` is the Context the feature's Layer was built with, minus `Scope`,
 * which closes the implementation's requirements. It isn't an instance, so
 * Layer memoisation is harmless and every child still gets its own instance,
 * Model and Scope.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Implementation<in out Props, out Events> {
  readonly component: Component.Mountable<Props, Events, never, never>
  readonly context: Context.Context<never>
}

/**
 * A feature service class, as returned by `Service`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Service<in out Self, in out Props, in out Events, in out Receives = never>
  extends Context.Key<Self, Implementation<Props, Events>>
{
  readonly [TypeId]: { readonly name: string }
  /** The Props Schema. The log encodes a feature's props with it, whatever the implementation. */
  readonly props: Schema.Codec<Props, any>
  /** The Events Schema. */
  readonly events: Schema.Codec<Events, any>
  /** The Schema of the messages a parent may send. `Schema.Never` when it declares none. */
  readonly receives: Schema.Codec<Receives, any>
  /** A ref for this feature's children, so a parent can send them messages. */
  readonly ref: (name: string) => Component.Ref.Of<Receives>
  /**
   * Declares a child of this feature in a parent's view, from the parent's
   * `h`. The parent requires the service only. `fallback` is required: the
   * service may be building (`Initial`) or failed (`Failure`).
   */
  // A method, so `Feature.Any` takes every feature, as for `toLayer`.
  render<Msg, RF = never>(
    h: View.Helper<Msg, unknown>,
    options: View.Child.Options<Props, Events, NoInfer<Msg>, Receives> & {
      readonly fallback: (
        result: AsyncResult.Initial<never, unknown> | AsyncResult.Failure<never, unknown>
      ) => View.Content<NoInfer<Msg>, RF>
      /** A feature takes no slots: its implementation may not declare them, and its parent can't see. */
      readonly slots?: never
    }
  ): View.Child<Msg, Self | NoInfer<RF>>
  /**
   * Provides this feature with `component`. The Layer requires whatever the
   * component requires, and closes it where the Layer is built. The
   * component receives every message the feature receives, and may receive
   * more.
   */
  // A method, so `Feature.Any` takes every feature, including one without
  // events, whose `Events` is `never`: `any` doesn't stand in for `never`
  // in a strictly checked parameter.
  toLayer<R, Rcv = never>(
    component: Component.Mountable<Props, Events, R, Rcv> & ReceivesAll<Receives, Rcv>
  ): Layer.Layer<Self, never, R>
}

/**
 * Passes when an implementation receives every message its feature does, and
 * otherwise names the messages it misses in the compiler error. `any` is
 * erased and receives nothing: an implementation whose receives are `any`
 * fits only a feature that receives nothing, and a feature whose receives
 * are `any`, such as `Feature.Any`, asks nothing of its implementation, as
 * its ref takes no message.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type ReceivesAll<Receives, Rcv> = 0 extends 1 & Receives ? unknown
  : 0 extends 1 & Rcv ? ReceivesAll<Receives, never>
  : [Receives] extends [Rcv] ? unknown
  : { readonly "This component doesn't receive every message the feature does. Missing": Exclude<Receives, Rcv> }

/**
 * Any feature service.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Any = Service<any, any, any, any>

/**
 * Returns `true` if `u` is a feature service.
 *
 * @stability experimental
 * @category guards
 * @since 0.1.0
 */
export const isService = (u: unknown): u is Any => Predicate.hasProperty(u, TypeId)

/**
 * Declares a feature service from its Props and Events Schemas, and the
 * Schema of the messages a parent may send.
 *
 * **When to use**
 *
 * Use when a piece of UI should be swappable: the app provides the live
 * implementation, a test provides a fake, and code splitting provides it from
 * an async Layer.
 *
 * **Details**
 *
 * The class is a `Context.Service` with `props`, `events`, `receives`, `ref`
 * and `toLayer`. `name` is also the path segment of every instance of the
 * feature, so paths don't change when the implementation does. `toLayer(C)`
 * doesn't compile if `C`'s props or events don't fit the contract, or if
 * `C` doesn't receive every case of `receives`.
 *
 * `receives` is a Schema, since a feature has no message type of its own. A
 * parent sends with `$.send(Todos.ref("Main"), message)` to the child it
 * renders with `Todos.render(h, { ref, fallback })`.
 *
 * **Example** (A feature with a fake for tests)
 *
 * ```ts import.meta.vitest
 * import { Component, Feature } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * class Todos extends Feature.Service<Todos>()("Todos", {
 *   props: Schema.Struct({ filter: Schema.Literals(["all", "open"]) })
 * }) {}
 *
 * const FakeTodos = Component.define({
 *   name: "FakeTodos",
 *   scoped: false,
 *   props: Todos.props,
 *   model: Schema.Struct({}),
 *   message: Schema.Never
 * }).make({
 *   init: () => ({}),
 *   update: (model) => model,
 *   view: (_, h) => h.el("p", "no todos")
 * })
 *
 * const TodosFake = Todos.toLayer(FakeTodos)
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const Service: <Self>() => <
  const Name extends string,
  Props extends Schema.Codec<any, any>,
  Events extends Schema.Codec<any, any> = Schema.Never,
  Receives extends Schema.Codec<any, any> = Schema.Never
>(
  name: Name,
  schemas: {
    readonly props: Props
    readonly events?: Events | undefined
    /** The messages a parent may send with `$.send`. None by default. */
    readonly receives?: Receives | undefined
  }
) =>
  & Context.ServiceClass<Self, `feature/${Name}`, Implementation<Props["Type"], Events["Type"]>>
  & Service<Self, Props["Type"], Events["Type"], Receives["Type"]>
  & {
    readonly props: Props
    readonly events: Events
    readonly receives: Receives
  } = () =>
  (
    name: string,
    schemas: {
      readonly props: Schema.Codec<any, any>
      readonly events?: Schema.Codec<any, any> | undefined
      readonly receives?: Schema.Codec<any, any> | undefined
    }
  ): any => {
    const Base = Context.Service<any, Implementation<any, any>>()(`feature/${name}`)
    class FeatureService extends Base {
      static readonly [TypeId] = { name }
      static readonly props = schemas.props
      static readonly events = schemas.events ?? Schema.Never
      static readonly receives = schemas.receives ?? Schema.Never
      static ref(refName: string) {
        return childRef.make(refName, FeatureService.receives)
      }
      static render(this: unknown, _h: unknown, options: child.Options): View.Child<any, any> {
        // `this` is the subclass the user declared, unless the method was detached.
        return child.make(isService(this) ? this : (FeatureService as any), options)
      }
      static toLayer<R>(component: Component.Mountable<any, any, R, never>): Layer.Layer<any, never, R> {
        return Layer.effect(
          Base,
          Effect.map(Effect.context<R>(), (context) => ({
            component: component as Component.Mountable<any, any, never, never>,
            // The implementation's requirements are closed with the build site's
            // Context. The Layer's own Scope isn't part of that contract: the
            // runtime gives every instance its own.
            context: Context.omit(Scope.Scope)(context) as Context.Context<never>
          }))
        )
      }
    }
    return FeatureService
  }
