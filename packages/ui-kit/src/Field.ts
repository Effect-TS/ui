/**
 * Groups a form control, or a group of them, with its label, description
 * and error message, and reports whether the control is invalid, touched
 * or focused on each of them. The label names the control, and the
 * control points at the description and the error, without the consumer
 * writing an id.
 *
 * `Field` is a headless component: it keeps whether its control has focus
 * and whether it was ever left, and generates the ids.
 *
 * **Anatomy**
 *
 * | Part          | Element                                             |
 * | :------------ | :-------------------------------------------------- |
 * | `root`        | any element, usually a `<div>`                      |
 * | `label`       | `<label>`                                           |
 * | `control`     | `<input>`, `<textarea>`, `<select>` or `<button>`   |
 * | `legend`      | any element, the group's visible name               |
 * | `group`       | any element, around the group's controls            |
 * | `member`      | `<input>`, `<textarea>`, `<select>` or `<button>`   |
 * | `description` | any element, usually a `<p>`                        |
 * | `error`       | any element, usually a `<div>`                      |
 *
 * Each part takes the consumer's builder and returns it, so the consumer
 * goes on chaining and adds children with `.children(...)`:
 * `f.root(h.div).children(f.label(h.label).children("Name"), f.control(h.input))`.
 * No part adds markup.
 *
 * `control`'s result is still a builder, so it is another kit call's
 * `element`, and both share one element:
 * `Input(h, { element: f.control(h.input), props })` for a text input, and
 * `s.root(f.control(h.button))` for a checkbox or a switch.
 *
 * A field has either one `control` and a `label`, or a `group` of
 * `member`s and a `legend`. The group is for a control made of several
 * focusable elements, such as a range slider's thumbs, or for a set of
 * controls, such as checkboxes. For a range slider, draw the slider's root
 * with `s.root(f.group(h.div))` and each thumb's input with
 * `f.member(h.input)`.
 *
 * `error` returns `undefined` unless the field is invalid and enabled, so
 * write `f.error(h.div)?.children(message)`. The message is the consumer's:
 * validate in `update`, pass the outcome as `invalid` and the text as the
 * error's children.
 *
 * **Data attributes**
 *
 * On every part, each present with an empty value or absent:
 *
 * - `data-disabled`
 * - `data-invalid` / `data-valid`, neither while `invalid` is left out
 * - `data-touched`: the control, or the group, has lost focus at least once
 * - `data-focused`: the control, or one of the group's members, has focus
 * - `data-dirty`
 * - `data-filled`
 *
 * **Keyboard**
 *
 * `Field` adds no key handler. The control keeps its own keyboard.
 *
 * **Usage**
 *
 * A view that renders more than one field gives each a `key`. A component
 * drawn inside a field's `view`, such as a checkbox, is that field's
 * child, so it needs no key of its own.
 *
 * The control can't tell whether a description was drawn, so say so with
 * the `described` prop. `description` fails the render without it.
 * With it, draw the description, or the control points at an id nothing
 * has. The same goes for the error: while the field is invalid and
 * enabled the control points at the error's id, so draw `error` in every
 * field that can be invalid.
 *
 * A disabled field disables its control, which then submits nothing. A
 * control's own parts don't hear of it: pass `disabled: f.disabled` to a
 * checkbox whose indicator shows `data-disabled`.
 *
 * In a group, the legend names the group and each member keeps its own
 * name, from a wrapping `<label>` or an `aria-label`. Draw the legend, or
 * the group points at an id nothing has. The description and the error
 * are read on each member, where focus lands.
 *
 * Focus moving from one member to another neither touches the field nor
 * drops its focus. Focus leaving the window counts as leaving the group,
 * as it counts as leaving a single control. An element between the group
 * and a member that handles `focusin` or `focusout` itself hides them from
 * the field, because only the innermost handler gets a bubbling event.
 *
 * `touched` and `focused` are the field's own. Give the field another
 * `key` to start over, such as after the form is reset.
 *
 * **Example** (A labelled, described name field)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Field, Input } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const ProfileMessage = UiSchema.TaggedEnum({ UpdatedName: { value: Schema.String } })
 *
 * const Profile = Component.define({
 *   name: "Profile",
 *   lifetime: "view",
 *   model: Schema.Struct({ name: Schema.String }),
 *   message: ProfileMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ name: "" }),
 *   update: {
 *     UpdatedName: (model, { value }) => ({ ...model, name: value })
 *   },
 *   view: (model, h) =>
 *     Field(h, {
 *       props: { invalid: model.name === "", filled: model.name !== "", described: true },
 *       view: (f) =>
 *         f.root(h.div.class("field")).children(
 *           f.label(h.label).children("Name"),
 *           Input(h, {
 *             element: f.control(h.input),
 *             props: { value: model.name },
 *             onUpdate: ({ value }) => ProfileMessage.UpdatedName({ value })
 *           }).attr("name", "name"),
 *           f.description(h.p).children("Visible on your profile"),
 *           f.error(h.div)?.children("Enter your name")
 *         )
 *     })
 * })
 *
 * // The label points at the input, which is marked invalid.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Profile, {}))
 * if (!/<label [^>]*for="([^"]+)"[^>]*>Name<\/label><input [^>]*id="\1"[^>]* aria-invalid="true"/.test(html)) {
 *   throw new Error("the label doesn't point at an invalid input")
 * }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Subscription from "@effect/ui/Subscription"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { flag } from "./internal/attributes.ts"
import { withoutField } from "./internal/field.ts"

/**
 * Props for the state a field reports on its parts.
 *
 * **Details**
 *
 * - `disabled`: disables the control with the native `disabled`
 *   attribute, sets `data-disabled` on every part and hides the error.
 *   Left out, the control keeps its own `disabled`.
 * - `invalid`: `true` marks the field invalid, with `data-invalid` on
 *   every part and, while the field is enabled, `aria-invalid` on the
 *   control and the error shown. `false` marks it valid, with
 *   `data-valid`. Left out, the field is neither, as before it was
 *   validated.
 * - `described`: the field draws a `description`, so the control points
 *   at it with `aria-describedby`.
 * - `dirty`: sets `data-dirty`. The consumer knows the value the field
 *   started with, so it says whether the value differs.
 * - `filled`: sets `data-filled`. The consumer holds the value, so it
 *   says whether there is one.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const FieldProps = Schema.Struct({
  disabled: Schema.optional(Schema.Boolean),
  invalid: Schema.optional(Schema.Boolean),
  described: Schema.optional(Schema.Boolean),
  dirty: Schema.optional(Schema.Boolean),
  filled: Schema.optional(Schema.Boolean)
})

/**
 * The props of a `Field`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type FieldProps = typeof FieldProps.Type

const Message = UiSchema.TaggedEnum({ FocusedControl: {}, BlurredControl: {} })

// A control disabled while it has focus loses it without a blur event, so
// the field reports the blur itself. Otherwise the focus would show again
// once the field is enabled.
const lostFocus = Subscription.make("lostFocus", Stream.make(Message.BlurredControl()))

/**
 * A headless field. Call it with the consumer's `h`, the `props`, and a
 * `view` closure that draws the root with `f.root(h.div)` and, inside it,
 * the label, the control, and the description and error when it has them.
 *
 * **Details**
 *
 * The parts also return `disabled`, `invalid`, `valid`, `touched`,
 * `dirty`, `filled` and `focused` as booleans, for markup that depends on
 * them.
 *
 * The field's own attributes win over the ones the consumer set on the
 * builder before the part, including the ones a state leaves absent:
 *
 * - every part: the data attributes
 * - `label`: `for`, the control's id
 * - `control`: `id` and `aria-invalid`
 * - `member`: `aria-invalid`
 * - `legend`, `description` and `error`: `id`
 *
 * A part writes them when it is applied, so an attribute the consumer
 * chains after it is the consumer's to answer for. Leave the control's
 * `id` to the field: the label points at it.
 *
 * `control` and `member` add the ids of the description and the shown
 * error to the element's `aria-describedby`, next to the consumer's own,
 * set before the part or after it. `group` adds the legend's id to
 * `aria-labelledby` the same way.
 *
 * `group` sets `role="group"` when the element is built, unless it is a
 * `<fieldset>` or has a role of its own by then, such as one chained
 * after the part or another kit call's. `aria-invalid` isn't allowed on a
 * group, so it goes on the members only.
 *
 * A disabled field writes `disabled` and `data-disabled` on the control,
 * and on each member, when the element is built, so they win over what
 * the consumer chains and over another kit call on the same element. It
 * also leaves out the hidden input a checkbox or a switch drawn on the
 * control keeps its form value in, so a disabled field submits nothing.
 * An enabled field does none of it, so the control keeps its own.
 *
 * `control` handles `focus` and `blur` on a layer of its own, so the
 * consumer's handlers for them, and another kit call's, still run.
 * `group` does the same with `focusin` and `focusout`, and `member`
 * handles no focus event. A disabled field shows no focus, and isn't
 * touched until it is enabled and left. A field disabled while its
 * control has focus drops the focus, and shows it again only when the
 * control is focused again.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Field = Component.define({
  name: "Field",
  lifetime: "view",
  props: FieldProps,
  model: Schema.Struct({ focused: Schema.Boolean, touched: Schema.Boolean }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ focused: false, touched: false }),
  update: {
    FocusedControl: (model) => ({ ...model, focused: true }),
    // Losing focus doesn't count as a visit while the field is disabled.
    BlurredControl: (model, _message, $) =>
      $.props.disabled === true ? { ...model, focused: false } : { focused: false, touched: true }
  },
  subscriptions: (model, props) => [model.focused && props.disabled === true && lostFocus],
  parts: (model, p) => {
    const disabled = p.props.disabled === true
    const invalid = p.props.invalid === true
    const valid = p.props.invalid === false
    const dirty = p.props.dirty === true
    const filled = p.props.filled === true
    const described = p.props.described === true
    // A disabled control has no focus to show, from the render that
    // disables it.
    const focused = model.focused && !disabled
    const showsError = invalid && !disabled
    const controlId = p.id("control")
    const descriptionId = p.id("description")
    const errorId = p.id("error")
    const legendId = p.id("legend")
    // An attribute a part sets to `undefined` is removed from the
    // consumer's builder too, so a consumer's `data-invalid` can't report
    // a state the field isn't in.
    const flags = <B extends { readonly attr: (name: string, value: string | undefined) => B }>(builder: B): B =>
      builder
        .attr("data-valid", flag(valid))
        .attr("data-invalid", flag(invalid))
        .attr("data-touched", flag(model.touched))
        .attr("data-dirty", flag(dirty))
        .attr("data-filled", flag(filled))
        .attr("data-focused", flag(focused))
    // With `data-disabled`, for every part but the control, which keeps
    // its own unless the field is disabled.
    const state = <B extends { readonly attr: (name: string, value: string | undefined) => B }>(builder: B): B =>
      flags(builder).attr("data-disabled", flag(disabled))
    const describedBy = [described && descriptionId, showsError && errorId].filter((id) => id !== false).join(" ")
    const error = p.part((b) => state(b).attr("id", errorId))
    // `control`, with the id and the focus handlers, or `member`, with
    // neither.
    const formControl = (own: boolean) =>
      p.part(["input", "textarea", "select", "button"], (b) => {
        const control = (own
          ? flags(b).attr("id", controlId).onFocus(Message.FocusedControl()).onBlur(Message.BlurredControl())
          : flags(b))
          .attr("aria-invalid", showsError ? "true" : undefined)
          // A token list: added to the consumer's own.
          .attr("aria-describedby", describedBy === "" ? undefined : describedBy)
        // Written when the control is built, after another kit call on the
        // same element wrote its own and added its children. An enabled
        // field leaves all of it alone.
        return disabled
          ? control.forward((node) => withoutField(View.build(node.attr("data-disabled", "").disabled(true), [])))
          : control
      })
    return {
      disabled,
      invalid,
      valid,
      touched: model.touched,
      dirty,
      filled,
      focused,
      root: p.part(state),
      label: p.part("label", (b) => state(b).attr("for", controlId)),
      control: formControl(true),
      legend: p.part((b) => state(b).attr("id", legendId)),
      group: p.part((b) =>
        state(b)
          // A token list: added to the consumer's own.
          .attr("aria-labelledby", legendId)
          .on("focusin", Message.FocusedControl())
          // Focus moving between members neither leaves the field nor
          // touches it. The part is for any element, so the payload isn't
          // typed.
          .on(
            "focusout",
            (payload) => (payload as Html.FocusWithinPayload).within ? undefined : Message.BlurredControl()
          )
          // Read when the element is built, so a role chained after the
          // part, or another kit call's, is kept.
          .forward((node) =>
            node.attrs.role === undefined && node.tag !== "fieldset" ? node.attr("role", "group") : node
          )
      ),
      member: formControl(false),
      description: p.part((b) => {
        if (!described) {
          throw new Error(
            "Field: the description was drawn without the described prop, so the control doesn't point at it. Pass described: true"
          )
        }
        return state(b).attr("id", descriptionId)
      }),
      // Applied before it's dropped, so a wrong builder throws in every state.
      error: <B extends View.PartTarget<string>>(element: B): ReturnType<B["attr"]> | undefined => {
        const shown = error(element)
        return showsError ? shown : undefined
      }
    }
  }
})
