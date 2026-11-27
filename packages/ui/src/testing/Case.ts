/**
 * A case is one state of a component, written as data: its props, and
 * optionally a Model to start from, messages to send and a Layer to provide.
 * The same case runs in a test, with `Play.fromCase` or `HtmlPlay.fromCase`,
 * and in a browser, with `BrowserCase.mount` or the workbench page of
 * `DevToolsVite.plugin`.
 *
 * **Example** (Three states of a todo row)
 *
 * ```ts import.meta.vitest
 * import { Command, Component, UiSchema } from "@effect/ui"
 * import { Case, Locator, Play, TestHost } from "@effect/ui/testing"
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
 *   view: (h, model) =>
 *     h.el("button").on("click", Message.ClickedSave()).children(
 *       model.saved ? "saved" : h.isRunning(SaveTodo) ? "saving" : "save"
 *     )
 * })
 *
 * const SavePending = SaveTodo.toLayer(() => Effect.never)
 *
 * const TodoItemCases = Case.make(TodoItem, {
 *   empty: { props: { id: "t1" }, layer: SavePending },
 *   saving: { props: { id: "t1" }, messages: [Message.ClickedSave()], layer: SavePending },
 *   saved: { props: { id: "t1" }, model: { saved: true }, layer: SavePending }
 * })
 *
 * Effect.gen(function*() {
 *   const play = yield* Play.fromCase(TodoItemCases.saving)
 *   yield* play.expect(Locator.tag("button")).toHaveText("saving")
 * }).pipe(Effect.scoped, Effect.provide(TestHost.layer()), Effect.runPromise)
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import { hasProperty } from "effect/Predicate"
import type * as Types from "effect/Types"
import type * as Component from "../Component.ts"

/**
 * @stability experimental
 * @category type IDs
 * @since 0.1.0
 */
export const TypeId = "~@effect/ui/testing/Case" as const

/**
 * Any component a case can show.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AnyComponent =
  | Component.Members<string, any, any, any, any, any, any, any>
  // `any` messages don't fit a component whose messages are `never`.
  | Component.Members<string, any, any, never, any, any, any, any>

/**
 * One state of `component`, named `<component name>/<key>`.
 *
 * **Details**
 *
 * `R` is what the mount still needs: the component's requirements and those
 * of an Effect `props`, less what `layer` provides, plus what `layer`
 * needs.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Case<C extends AnyComponent, R = never> {
  readonly [TypeId]: { readonly _R: Types.Covariant<R> }
  readonly name: string
  /** The component passed to `make`, never a copy. */
  readonly component: C
  readonly props: PropsOf<C>
  readonly model?: Component.Model<C> | undefined
  readonly messages?: ReadonlyArray<Component.Message<C>> | undefined
  readonly layer?: Layer.Layer<any, never, any> | undefined
}

/**
 * What `make` takes for each case.
 *
 * **Details**
 *
 * `props` may be an Effect, as for `TestHost.mount`, and may be left out
 * when every prop is optional.
 *
 * `model` starts the root from that Model: what `init` returned is dropped,
 * its Commands, events and sends included. A field set to `undefined`
 * counts as left out.
 *
 * `messages` are sent to the root in order right after it mounts, in one
 * synchronous pass, as `root.send` does. They go through the real `update`,
 * and the Commands they run reach the Layers, so their results arrive only
 * after the whole list has been sent. List what comes from outside the
 * component: with `SaveTodo` stubbed to succeed, `[ClickedSave,
 * CompletedSaveTodo]` delivers `CompletedSaveTodo` twice. To show a state
 * past a Command, start from `model` instead.
 *
 * `layer` is provided around the mount, for stubs such as a Command that
 * never returns, and for what an Effect `props` needs, such as
 * `Router.memory`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Input<C extends AnyComponent> =
  & ({} extends Component.Props<C> ? { readonly props?: PropsOf<C> | undefined }
    : { readonly props: PropsOf<C> })
  & {
    readonly model?: Component.Model<C> | undefined
    readonly messages?: ReadonlyArray<Component.Message<C>> | undefined
    readonly layer?: AnyLayer | undefined
  }

// Any Layer that cannot fail. Typed as `Layer.Layer<never, never, unknown>`,
// it would be the contextual type of `SaveTodo.toLayer(...)` and infer that
// Layer's requirements as `unknown`.
interface AnyLayer {
  readonly "~effect/Layer": { readonly _E: Types.Covariant<never> }
}

type PropsOf<C extends AnyComponent> =
  | Component.Props<C>
  | Effect.Effect<Component.Props<C>, never, any>

/**
 * What a case built from `input` still needs.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type Requirements<C extends AnyComponent, I> =
  | Exclude<
    | Component.Requirements<C>
    | (I extends { readonly props?: infer P } ? Effect.Services<P> : never),
    I extends { readonly layer: Layer.Layer<infer A, any, any> } ? A : never
  >
  | (I extends { readonly layer?: infer L } ? LayerRequirements<L> : never)

// Distributes, as `Effect.Services` does for `Props | Effect<Props, never, Config>`.
type LayerRequirements<L> = L extends Layer.Layer<any, any, infer R> ? R
  : never

/**
 * Whether `u` is a `Case`.
 *
 * @stability experimental
 * @category guards
 * @since 0.1.0
 */
export const isCase = (u: unknown): u is Case<AnyComponent, unknown> =>
  hasProperty(u, TypeId)

const variance = { _R: (_: never) => _ }

/**
 * Defines the cases of `component`, one per key.
 *
 * **Details**
 *
 * Every case is checked against the component: its props, Model and
 * messages. A case's name is the component's name and its key, such as
 * `TodoItem/saved`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = <
  C extends AnyComponent,
  Cases extends Readonly<Record<string, Input<NoInfer<C>>>>
>(
  component: C,
  cases: Cases
): { readonly [K in keyof Cases]: Case<C, Requirements<C, Cases[K]>> } => {
  const out: Record<string, Case<C, unknown>> = {}
  for (const [key, input] of Object.entries(cases)) {
    out[key] = {
      ...input,
      props: input.props === undefined ? {} : input.props,
      [TypeId]: variance,
      name: component.definition.name + "/" + key,
      component
    } as Case<C, unknown>
  }
  return out as any
}
