/**
 * Commands on rendered elements: `focus`, `blur`, `scrollIntoView` and
 * `measure`, each given a ref from `Html.ref` or `Row.at`.
 *
 * A Command runs once the render the issuing `update` caused is committed,
 * and reaches the element through `Html.Host`, which a test on `TestHost`
 * fakes with `Layer.succeed(Html.Host, ...)`.
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Command from "../Command.ts"
import * as Renderer from "../Renderer.ts"
import * as Html from "./Html.ts"

/**
 * What `focus`, `blur` and `scrollIntoView` report: whether the ref was
 * rendered.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Found {
  readonly found: boolean
}

const withElement = <A>(
  ref: Renderer.Ref<any>,
  f: (host: Context.Service.Shape<typeof Html.Host>, element: globalThis.Element) => A
): Effect.Effect<Option.Option<A>, never, Renderer.Refs | Html.Host> =>
  Renderer.Refs.use((refs) =>
    Effect.flatMap(refs.lookup(ref), (node) =>
      Option.isNone(node)
        ? Effect.succeed(Option.none())
        : Html.Host.useSync((host) => Option.some(f(host, node.value as globalThis.Element))))
  )

const FocusOptions = Schema.Struct({ preventScroll: Schema.optional(Schema.Boolean) })
const ScrollOptionsSchema = Schema.Struct({
  behavior: Schema.optional(Schema.Literals(["auto", "instant", "smooth"])),
  block: Schema.optional(Schema.Literals(["center", "end", "nearest", "start"])),
  inline: Schema.optional(Schema.Literals(["center", "end", "nearest", "start"]))
})

/**
 * The Command behind `focus`, for a story's `.resolve(DomCommand.Focus, { found })`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Focus: Command.Factory<
  { readonly ref: Renderer.Ref<any>; readonly options?: { readonly preventScroll?: boolean | undefined } | undefined },
  Found
> = Command.make(
  "DomCommand.focus",
  { args: { ref: Renderer.Ref, options: Schema.optional(FocusOptions) } },
  ({ options, ref }) =>
    Effect.map(
      withElement(ref, (host, element) => host.focus(element, options ?? {})),
      (done): Found => ({ found: Option.isSome(done) })
    )
)

/**
 * The Command behind `blur`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Blur: Command.Factory<{ readonly ref: Renderer.Ref<any> }, Found> = Command.make(
  "DomCommand.blur",
  { args: { ref: Renderer.Ref } },
  ({ ref }) =>
    Effect.map(withElement(ref, (host, element) => host.blur(element)), (done): Found => ({
      found: Option.isSome(done)
    }))
)

/**
 * The Command behind `scrollIntoView`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const ScrollIntoView: Command.Factory<
  { readonly ref: Renderer.Ref<any>; readonly options?: Html.ScrollOptions | undefined },
  Found
> = Command.make(
  "DomCommand.scrollIntoView",
  { args: { ref: Renderer.Ref, options: Schema.optional(ScrollOptionsSchema) } },
  ({ options, ref }) =>
    Effect.map(withElement(ref, (host, element) => host.scrollIntoView(element, options ?? {})), (done): Found => ({
      found: Option.isSome(done)
    }))
)

/**
 * The Command behind `measure`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Measure: Command.Factory<{ readonly ref: Renderer.Ref<any> }, Option.Option<Html.Rect>> = Command.make(
  "DomCommand.measure",
  { args: { ref: Renderer.Ref } },
  ({ ref }) => withElement(ref, (host, element) => host.measure(element))
)

/**
 * Focuses the element `ref` names, once the render the issuing `update`
 * caused is committed, and sends `f`'s message.
 *
 * **Details**
 *
 * A ref that isn't rendered gives `{ found: false }`. The ref resolves within
 * the issuing instance. `Refs` and `Html.Host` are framework services, so
 * this adds nothing to a component's requirements.
 *
 * **Example** (Focusing the new-todo field after adding)
 *
 * ```ts
 * import { DomCommand, Html } from "@effect/ui/html"
 * import { UiSchema } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ SubmittedForm: {}, CompletedFocusNewTodo: {} })
 * const NewTodo = Html.ref("NewTodo", "input")
 *
 * const command = DomCommand.focus(NewTodo, () => Message.CompletedFocusNewTodo())
 * ```
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const focus = <N extends HTMLElement | SVGElement, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Found) => Msg,
  options?: { readonly preventScroll?: boolean | undefined }
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> =>
  Command.map(Focus.make(options === undefined ? { ref } : { ref, options }), f)

/**
 * Takes focus away from the element `ref` names, and sends `f`'s message.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const blur = <N extends HTMLElement | SVGElement, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Found) => Msg
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> => Command.map(Blur.make({ ref }), f)

/**
 * Scrolls the element `ref` names into view, and sends `f`'s message.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const scrollIntoView = <N extends globalThis.Element, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Found) => Msg,
  options?: Html.ScrollOptions
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> =>
  Command.map(ScrollIntoView.make(options === undefined ? { ref } : { ref, options }), f)

/**
 * Measures the element `ref` names, and sends `f`'s message with its box, or
 * `Option.none()` when the ref isn't rendered.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const measure = <N extends globalThis.Element, Msg>(
  ref: Renderer.Ref<N>,
  f: (rect: Option.Option<Html.Rect>) => Msg
): Command.Mapped<Command.Issued<Option.Option<Html.Rect>, never, Option.Option<Html.Rect>, "Effect">, Msg> =>
  Command.map(Measure.make({ ref }), f)
