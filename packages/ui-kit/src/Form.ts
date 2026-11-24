/**
 * A form that moves focus to its first invalid control after a submit, so a
 * keyboard or screen reader user lands on the error without looking for it.
 *
 * `Form` is a headless component: after a submit it runs a Command that
 * reads the form's element once the render is committed. It keeps no state.
 *
 * **Anatomy**
 *
 * | Part   | Element  |
 * | :----- | :------- |
 * | `root` | `<form>` |
 *
 * `root` takes the consumer's builder and returns it, so the consumer goes
 * on chaining and adds the fields and the submit button with
 * `.children(...)`: `form.root(h.form.class("signup")).children(...)`. It
 * adds no markup.
 *
 * **Data attributes**
 *
 * None.
 *
 * **Keyboard**
 *
 * `Form` adds no key handler. Enter in a text input and a press of a submit
 * button submit the form, as in any `<form>`.
 *
 * **Usage**
 *
 * `Form` doesn't validate and holds no errors. Validate in `update`, with
 * `Validation` from `@effect/ui`, and show each outcome on its control: a
 * `Field` with `invalid: true` writes `aria-invalid="true"` on its control,
 * and a control drawn without a field takes the attribute directly. The root
 * writes `novalidate`, so the browser's own checks stay out of the way.
 *
 * Every submit emits `Submitted` with the form's named controls, and the
 * browser's own submission is prevented. A consumer that keeps the values in
 * its Model ignores the payload and reads the Model.
 *
 * Once the render that follows a submit is committed, the form focuses the
 * first element inside it with `aria-invalid="true"`, in document order,
 * and selects the text of an `<input>`. An invalid element that can't take
 * focus itself, such as the root of a radio group, passes it to the first
 * element inside it, in document order, that Tab can reach. A native radio,
 * invalid itself or inside an invalid element, passes it to the checked
 * radio of its group, where Tab stops. An invalid element that neither
 * takes focus nor holds one that does, such as a disabled input, is
 * skipped. With no invalid element the focus stays where it was.
 *
 * The consumer's `update` for `Submitted` runs before that render, so the
 * errors it records are the ones the form reads.
 *
 * The message log records `Submitted` with every value in it. Leave `name`
 * off a secret control such as a password, so the form doesn't report it,
 * and carry its value as `Schema.Redacted` in the consumer's own messages.
 *
 * **Limits**
 *
 * A control outside the `<form>` that names it with a `form` attribute is
 * submitted with it, but isn't focused. Document order decides which
 * element comes first, so a positive `tabindex` moves none ahead.
 *
 * Errors that arrive after the render that follows the submit, such as a
 * server's, aren't focused: a parent can't ask the form to act. The
 * consumer draws the controls, so it can focus one itself: give the field
 * or an error summary an `Html.ref`, and run `HtmlCommand.focus` from the
 * `update` that records the rejection.
 *
 * To send focus somewhere else after a failed submit, such as to an error
 * summary, draw a plain `h.form` with `novalidate` and `onSubmit`.
 *
 * **Example** (A sign-up form whose email field is invalid)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Field, Form } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const SignupMessage = UiSchema.TaggedEnum({ SubmittedForm: {} })
 *
 * const Signup = Component.define({
 *   name: "Signup",
 *   scoped: false,
 *   model: Schema.Struct({ submitted: Schema.Boolean }),
 *   message: SignupMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ submitted: true }),
 *   update: {
 *     SubmittedForm: () => ({ submitted: true })
 *   },
 *   view: (h, model) =>
 *     Form(h, {
 *       onEmit: () => SignupMessage.SubmittedForm(),
 *       view: (form) =>
 *         form.root(h.form.class("signup")).children(
 *           Field(h, {
 *             props: { invalid: model.submitted },
 *             view: (field) =>
 *               field.root(h.div).children(
 *                 field.label(h.label).children("Email"),
 *                 field.control(h.input).attr("name", "email"),
 *                 field.error(h.div)?.children("Enter your email")
 *               )
 *           }),
 *           h.button.attr("type", "submit").children("Sign up")
 *         )
 *     })
 * })
 *
 * // The form keeps the consumer's class and turns the browser's checks off.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Signup, {}))
 * if (!/<form class="signup" novalidate>/.test(html)) throw new Error("the form isn't a styled form with novalidate")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { radioGroup } from "./internal/dom.ts"

const Submission = {
  fields: Schema.Record(Schema.String, Schema.String),
  entries: Schema.Array(Schema.Tuple([Schema.String, Schema.String]))
}

/**
 * `Submitted` reports a submit of the form, with its named controls:
 * `fields` holds the first value of each name, and `entries` every name and
 * value in document order, for names used more than once. Files are left
 * out.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const FormEvents = UiSchema.TaggedEnum({
  Submitted: Submission
})

/**
 * What a `Form` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type FormEvents = typeof FormEvents.Type

const FormMessage = UiSchema.TaggedEnum({ SubmittedRoot: Submission })

const Root = Html.ref("FormRoot", "form")

const takeFocus = (element: HTMLElement): boolean => {
  element.focus({ focusVisible: true } as FocusOptions)
  if (!element.matches(":focus")) return false
  if (element.localName === "input") (element as HTMLInputElement).select()
  return true
}

const takeTabStop = (element: HTMLElement): boolean =>
  radioGroup(element).some((radio) => radio.checked && takeFocus(radio)) ||
  takeFocus(element)

const focusInvalid = (form: HTMLFormElement): boolean =>
  Array.from(form.querySelectorAll<HTMLElement>("[aria-invalid=\"true\"]"))
    .some((invalid) =>
      [
        invalid,
        ...Array.from(invalid.querySelectorAll<HTMLElement>("*")).filter((
          inner
        ) => inner.tabIndex >= 0)
      ]
        .some(takeTabStop)
    )

const FocusInvalid = Command.make(
  "FocusInvalid",
  { args: {} },
  () =>
    Renderer.Refs.use((refs) => refs.lookup(Root)).pipe(
      Effect.map(Option.map(focusInvalid)),
      Effect.as(Component.noop)
    )
)

/**
 * A headless form. Call it with the consumer's `h`, an `onEmit` for
 * `Submitted`, and a `view` closure that draws the root with
 * `form.root(h.form)` around the fields and the submit button.
 *
 * **Details**
 *
 * `root(form)` returns the builder it was given, so the consumer chains
 * classes, attributes and children on it. It takes only a `<form>`.
 *
 * The form's `novalidate` wins over the one the consumer set on the builder
 * before the part. The part writes it when it is applied, so an attribute the
 * consumer chains after `form.root(...)` is the consumer's to answer for.
 *
 * `root` handles `submit` on a layer of its own, so an `onSubmit` the
 * consumer adds to the form still runs, after the form's.
 *
 * Every submit emits `Submitted`, and then, once the render is committed,
 * the form focuses the first control inside it with `aria-invalid="true"`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Form = Component.define({
  name: "Form",
  scoped: false,
  model: Schema.Struct({}),
  message: FormMessage,
  events: FormEvents,
  elements: Html
}).make({
  init: () => ({}),
  update: ($, { entries, fields }) =>
    $.run(FocusInvalid.make()).emit(FormEvents.Submitted({ fields, entries })),
  parts: (p) => ({
    root: p.part("form", (b) =>
      b.ref(Root)
        .attr("novalidate", "")
        .onSubmit(({ entries, fields }) =>
          FormMessage.SubmittedRoot({ fields, entries })
        ))
  })
})
