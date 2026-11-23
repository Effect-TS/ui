/**
 * Commands on rendered elements: `focus`, `blur`, `scrollIntoView`,
 * `measure`, `select`, `requestSubmit` and `showPicker`, each given a ref
 * from `Html.ref` or `Row.at`.
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
 * What `focus`, `blur`, `scrollIntoView` and `select` report: whether the
 * ref was rendered.
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

const found = (
  ref: Renderer.Ref<any>,
  f: (host: Context.Service.Shape<typeof Html.Host>, element: globalThis.Element) => void
): Effect.Effect<Found, never, Renderer.Refs | Html.Host> =>
  Effect.map(withElement(ref, f), (done): Found => ({ found: Option.isSome(done) }))

const FocusOptionsSchema = Schema.Struct({ preventScroll: Schema.optional(Schema.Boolean) })
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
  { readonly ref: Renderer.Ref<any>; readonly options?: Html.FocusOptions | undefined },
  Found
> = Command.make(
  "DomCommand.focus",
  { args: { ref: Renderer.Ref, options: Schema.optional(FocusOptionsSchema) } },
  ({ options, ref }) => found(ref, (host, element) => host.focus(element, options ?? {}))
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
  ({ ref }) => found(ref, (host, element) => host.blur(element))
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
  ({ options, ref }) => found(ref, (host, element) => host.scrollIntoView(element, options ?? {}))
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
 * The Command behind `select`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Select: Command.Factory<{ readonly ref: Renderer.Ref<any> }, Found> = Command.make(
  "DomCommand.select",
  { args: { ref: Renderer.Ref } },
  ({ ref }) => found(ref, (host, element) => host.select(element))
)

/**
 * What `requestSubmit` reports: whether the ref was rendered, and whether
 * it had a form to submit.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Submitted extends Found {
  readonly submitted: boolean
}

/**
 * The Command behind `requestSubmit`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const RequestSubmit: Command.Factory<{ readonly ref: Renderer.Ref<any> }, Submitted> = Command.make(
  "DomCommand.requestSubmit",
  { args: { ref: Renderer.Ref } },
  ({ ref }) =>
    Effect.map(withElement(ref, (host, element) => host.requestSubmit(element)), (done): Submitted => ({
      found: Option.isSome(done),
      submitted: Option.getOrElse(done, () => false)
    }))
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
  options?: Html.FocusOptions
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

/**
 * Selects all the text in the `input` or `textarea` `ref` names, once the
 * render the issuing `update` caused is committed, and sends `f`'s message.
 *
 * **Details**
 *
 * It doesn't move focus: issue `focus` for that. The browser host first
 * writes the element's controlled `value` if the element shows something
 * else, such as a character `update` rejected, since writing it afterward
 * would drop the selection.
 *
 * **Example** (Selecting a field's text once it has focus)
 *
 * ```ts
 * import { DomCommand, Html } from "@effect/ui/html"
 * import { UiSchema } from "@effect/ui"
 *
 * const Message = UiSchema.TaggedEnum({ FocusedAmount: {}, CompletedSelectAmount: {} })
 * const Amount = Html.ref("Amount", "input")
 *
 * const command = DomCommand.select(Amount, () => Message.CompletedSelectAmount())
 * ```
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const select = <N extends HTMLInputElement | HTMLTextAreaElement, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Found) => Msg
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> => Command.map(Select.make({ ref }), f)

/**
 * Submits the form of the element `ref` names, as a press on its submit
 * button would, and sends `f`'s message.
 *
 * **Details**
 *
 * `ref` names a `form`, or a control that belongs to one, by nesting or by
 * its `form` attribute. The browser validates the form first, unless it has
 * `novalidate`, and then fires `submit`, which reaches the form's
 * `onSubmit`. `submitted` is `false` when the element has no form.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const requestSubmit = <N extends HTMLElement, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Submitted) => Msg
): Command.Mapped<Command.Issued<Submitted, never, Submitted, "Effect">, Msg> =>
  Command.map(RequestSubmit.make({ ref }), f)

/**
 * What `showPicker` reports: whether the ref was rendered, and whether the
 * browser opened its picker.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Opened extends Found {
  readonly opened: boolean
}

/**
 * The Command behind `showPicker`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const ShowPicker: Command.Factory<{ readonly ref: Renderer.Ref<any> }, Opened> = Command.make(
  "DomCommand.showPicker",
  { args: { ref: Renderer.Ref } },
  ({ ref }) =>
    Effect.map(withElement(ref, (host, element) => host.showPicker(element)), (done): Opened => ({
      found: Option.isSome(done),
      opened: Option.getOrElse(done, () => false)
    }))
)

/**
 * Opens the picker of the `input` or `select` `ref` names, as a click on
 * it would, and sends `f`'s message.
 *
 * **When to use**
 *
 * Use to open a file input the view renders from a menu item or a keyboard
 * shortcut. The files arrive in the input's `onChange`. To choose files
 * without rendering an input, use `DomFile.pick`.
 *
 * **Details**
 *
 * It calls the element's `showPicker()`, or `click()` on a file input in a
 * browser without it. `opened` is `false` when the browser refuses, as it
 * does outside a user's action and for a disabled element. A Command issued
 * from a click or key press runs within that action.
 *
 * **Example** (Opening a rendered file input's picker)
 *
 * ```ts
 * import { DomCommand, Html } from "@effect/ui/html"
 * import { UiSchema } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ CompletedShowPicker: { opened: Schema.Boolean } })
 * const Attachment = Html.ref("Attachment", "input")
 *
 * const command = DomCommand.showPicker(Attachment, ({ opened }) => Message.CompletedShowPicker({ opened }))
 * ```
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const showPicker = <N extends HTMLInputElement | HTMLSelectElement, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Opened) => Msg
): Command.Mapped<Command.Issued<Opened, never, Opened, "Effect">, Msg> => Command.map(ShowPicker.make({ ref }), f)
