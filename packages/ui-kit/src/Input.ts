/**
 * A native text input whose value lives in the caller's Model. Typing
 * sends the caller's `onUpdate` message with the value the user left in
 * the field.
 *
 * `Input` is a view function. It keeps no state, so it takes no `key`.
 *
 * **Anatomy**
 *
 * `Input` returns a single `<input>` builder. It uses `h.input` by
 * default. Pass `element` to share the input with another part. Chain
 * classes and attributes on the result:
 * `Input(h, { props, onUpdate }).class("name").attr("name", "name")`.
 * It adds no markup.
 *
 * Naming the input is the caller's job: a `<label>` around it or one
 * pointing at its `id`, or an `aria-label`. A `Field` does it, and
 * adds a description, an error and the validity state: pass its control
 * as `element`, `Input(h, { element: field.control(h.input), props })`.
 *
 * **Data attributes**
 *
 * - `data-disabled`: present, with an empty value, while `disabled` is set
 *
 * **Keyboard**
 *
 * The browser handles typing, selection and Tab. `Input` adds no key
 * handler.
 *
 * **Forms and native attributes**
 *
 * `name`, `id`, `type`, `placeholder`, `readonly`, `required` and the
 * other native attributes stay the caller's. A `readonly` input fires no
 * `input` event, so it sends nothing. A disabled input is left out of its
 * form's submission.
 *
 * **Example** (A labelled name field whose value lives in the caller's Model)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui";
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Input } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const ProfileMessage = UiSchema.TaggedEnum({ UpdatedName: { value: Schema.String } })
 *
 * const Profile = Html.component({
 *   name: "Profile",
 *   model: Schema.Struct({ name: Schema.String }),
 *   message: ProfileMessage
 * }).make({
 *   init: () => ({ name: "Ada" }),
 *   update: {
 *     UpdatedName: ($, { value }) => $.evolve({ name: value })
 *   },
 *   view: (h, model) =>
 *     h.label(
 *       "Name",
 *       Input(h, {
 *         props: { value: model.name },
 *         onUpdate: ({ value }) => ProfileMessage.UpdatedName({ value })
 *       }).class("name").attr("name", "name")
 *     )
 * })
 *
 * // The input keeps the caller's class and name.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Profile, {}))
 * if (!/<input class="name" name="name"/.test(html)) throw new Error("the input isn't a styled, named input")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Html from "@effect/ui/html/Html"
import { flag } from "./internal/attributes.ts"

/**
 * The controlled value and disabled state for `Input`.
 *
 * **Details**
 *
 * - `value`: what the input shows. Required: the caller owns it, stores
 *   what `onUpdate` reports and passes it back.
 * - `disabled`: sets the native `disabled` attribute and
 *   `data-disabled`, so the input is skipped by Tab, sends nothing and is
 *   left out of its form's submission.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface InputProps {
  readonly value: string
  readonly disabled?: boolean | undefined
}

/**
 * An `<input>` builder: what `Input` accepts as `element`, from the
 * caller's `h.input`, and what it returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type InputElement<Msg, R = never> = Html.VoidElement<
  Msg,
  R,
  Html.EventsOf<"input">,
  HTMLInputElement,
  "input"
>

/**
 * A text input. Call it with the caller's `h`, the `value` as `props`,
 * and what an edit sends as `onUpdate`.
 *
 * **Details**
 *
 * `Input` returns the builder it was given, or `h.input`, and writes its
 * own state in `forward`, when the element is built. So it wins over the
 * caller's, set on `element` or chained after the call: the `value`
 * property, `disabled`, `aria-disabled` and `data-disabled`, including
 * the ones a state leaves absent. A `disabled` the caller sets is removed
 * unless the `disabled` prop is set, and `aria-disabled` is always
 * removed, as the native `disabled` reports it. The caller's other
 * attributes and handlers stay. This holds for attribute names written in
 * lowercase: `Input` doesn't remove a caller's `.attr("DISABLED", "")`,
 * and an HTML host reads it as `disabled`.
 *
 * `onUpdate` is what an `input` event sends, on every edit, with the
 * value the user left in the field. It never cancels the event. Until the
 * caller passes that value back, the input goes on showing `value`. A
 * disabled input sets no handler.
 *
 * Given `onUpdate`, an `input` handler of the caller's own, set on
 * `element` or chained after the call, throws at render, whatever the
 * state. Without `onUpdate`, `Input` sets no handler, so the caller's
 * stays.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Input = <Msg, R = never>(
  h: { readonly input: InputElement<Msg> },
  options: {
    /** The caller's `h.input`, to stack a part on it. `h.input` when left out. */
    readonly element?: InputElement<Msg, R> | undefined
    readonly props: InputProps
    /** The message an edit sends, from the value the user left in the field. */
    readonly onUpdate?:
      | ((event: { readonly value: string }) => NoInfer<Msg> | undefined)
      | undefined
  }
): InputElement<Msg, R> => {
  const element: InputElement<Msg, R> = options.element ?? h.input
  const { onUpdate, props } = options
  const disabled = props.disabled === true
  // The writes wait for the finished input, so they come after whatever
  // the caller chains on it, and the check sees an input handler chained
  // after the call.
  return element.forward((node) => {
    // By `onUpdate` alone, not by the state: a disabled input sets no
    // handler now, but the clash would only show once it was enabled.
    if (onUpdate !== undefined && node.handlers.input !== undefined) {
      throw new Error(
        "Input: the element already handles input, which onUpdate would replace. Send the message from onUpdate"
      )
    }
    const input = node
      .value(props.value)
      .attrs({
        // Never set: the native `disabled` reports it.
        "aria-disabled": undefined,
        "data-disabled": flag(disabled)
      })
      .disabled(disabled)
    return !disabled && onUpdate !== undefined
      ? input.onInput(({ value }) => onUpdate({ value }))
      : input
  })
}
