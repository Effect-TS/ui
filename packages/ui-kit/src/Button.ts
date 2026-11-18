/**
 * A button that can stay focusable while disabled, ported from Base UI's
 * Button (https://base-ui.com/react/components/button).
 *
 * `Button` is a view function. It holds no state, so it is a function that
 * takes the caller's `h` and returns the finished `<button>`, with its
 * `type`, disabled state, click handling and children. A press sends the
 * caller's `onPress` message straight to the caller's `update`, and a
 * disabled button sends nothing.
 *
 * **Anatomy**
 *
 * | Base UI  | Element                                  |
 * | :------- | :--------------------------------------- |
 * | `Button` | `<button>`, from `element` or `h.button` |
 *
 * `Button` takes `{ element, props, onPress, children }` and returns the
 * finished element. Pass `element` only for a class, the caller's own
 * attributes, or a part to stack on the same `<button>`, such as a tooltip
 * trigger.
 *
 * **Data attributes**
 *
 * Present with an empty value or absent:
 *
 * - `data-disabled`
 *
 * **Keyboard**
 *
 * The element is a native `<button>`, so Space and Enter press it and Tab
 * moves focus, without a key handler. A disabled button leaves the tab
 * order, unless `focusableWhenDisabled` is set.
 *
 * **Differences from Base UI**
 *
 * - The element is always a native `<button>`, Base UI's `nativeButton`
 *   mode, so there is no `nativeButton` prop and no key handling for other
 *   tags.
 * - It is a standalone button. It doesn't join Base UI's composite keyboard
 *   handling, as a `Toolbar.Button` does, where the composite owns the tab
 *   stop and Space presses the item on `keydown`.
 * - `type` is a prop, `"button"` by default, in place of the native
 *   attribute: `Button` owns it, so a `type` on `element` is replaced.
 * - The press is the `onPress` message in place of an `onClick` callback.
 *   A view function's handler replaces the consumer's, so an `element`
 *   that already handles click throws at render when `Button` would set
 *   one: with `onPress` or `focusableWhenDisabled`.
 * - `onPress` never cancels the native action: an enabled `"reset"` or
 *   `"submit"` button still resets or submits its form.
 * - A disabled, focusable button cancels the click that Space or Enter
 *   causes, not every key but Tab as Base UI does on `keydown`. The host
 *   cancels it once it has mounted the button: before then, in server
 *   rendered HTML, `aria-disabled` keeps the button focusable but nothing
 *   cancels a click, so a submit button can still submit its form.
 * - A disabled, focusable button has `aria-disabled="true"`, and an enabled
 *   one has no `aria-disabled` in place of `aria-disabled="false"`.
 *
 * **Example** (A save button that stays focusable while it saves)
 *
 * ```ts import.meta.vitest
 * import { Component } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Button } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const EditorMessage = Schema.TaggedUnion({ PressedSave: {} })
 *
 * const Editor = Component.define({
 *   name: "Editor",
 *   model: Schema.Struct({ saving: Schema.Boolean }),
 *   message: EditorMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ saving: false }),
 *   update: (model, message) =>
 *     EditorMessage.match(message, {
 *       PressedSave: () => ({ ...model, saving: true })
 *     }),
 *   view: (model, h) =>
 *     Button(h, {
 *       element: h.button.class("save"),
 *       props: { disabled: model.saving, focusableWhenDisabled: true },
 *       onPress: EditorMessage.make({ _tag: "PressedSave" }),
 *       children: [model.saving ? "Saving" : "Save"]
 *     })
 * })
 *
 * // The button keeps the caller's class, and doesn't submit a form.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Editor, {}))
 * if (!/<button class="save"[^>]* type="button"/.test(html)) throw new Error("the button isn't a styled plain button")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Html from "@effect/ui/html/Html"
import * as View from "@effect/ui/View"
import { flag } from "./internal/attributes.ts"

/**
 * The props of a `Button`, Base UI's props without the React ones.
 *
 * **Details**
 *
 * - `disabled`: the button sends nothing and gets the native `disabled`
 *   and `data-disabled`.
 * - `focusableWhenDisabled`: a disabled button stays in the tab order, with
 *   `aria-disabled` in place of the native `disabled`, so focus stays on it
 *   while it is busy. Once mounted, it cancels its clicks, so a submit
 *   button doesn't submit.
 * - `type`: the native button type, `"button"` by default, so the button
 *   only submits or resets a form when it says so.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ButtonProps {
  readonly disabled?: boolean | undefined
  readonly focusableWhenDisabled?: boolean | undefined
  readonly type?: "button" | "submit" | "reset" | undefined
}

/**
 * A `<button>` builder `Button` accepts as `element`, from the caller's
 * `h.button`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ButtonElement<Msg, R = never> = Html.Element<Msg, R, Html.EventsOf<"button">, HTMLButtonElement, "button">

/**
 * A button that can stay focusable while disabled. Call it with the
 * caller's `h`, the press as `onPress` and the label as `children`.
 *
 * **Details**
 *
 * `Button` writes its own attributes over the ones on `element`: `type`,
 * `disabled`, `aria-disabled` and `data-disabled`, including the ones a
 * state leaves absent. So a `disabled` on `element` is removed unless the
 * `disabled` prop is set. The other attributes and handlers on `element`,
 * and a part's layer on it, stay.
 *
 * `Button` sets the click handler for `onPress`, and for a disabled
 * button with `focusableWhenDisabled`, whose click it cancels. Given
 * either, an `element` with a click handler of its own throws at render,
 * whatever the state: pass the message as `onPress`. Given neither,
 * `Button` sets no click handler, so the consumer's stays, and without one
 * a click reaches an ancestor's.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Button = <Msg, R = never, const C extends ReadonlyArray<View.Input<Msg, any>> = readonly []>(
  h: { readonly button: ButtonElement<Msg, never> },
  options: {
    /** The caller's `h.button`, with its classes and attributes. `h.button` when left out. */
    readonly element?: ButtonElement<Msg, R> | undefined
    readonly props?: ButtonProps | undefined
    /** The message a press sends, with a click, Space or Enter. */
    readonly onPress?: NoInfer<Msg> | undefined
    /** What goes inside the button, usually its label. */
    readonly children?: C | undefined
  } = {}
): View.Element<Msg, R | View.Requirements<C[number]>> => {
  const element = options.element ?? h.button
  const props = options.props ?? {}
  // By the options alone, not by the state: a clash that waited for the
  // button to be disabled would first show in production.
  if (
    (options.onPress !== undefined || props.focusableWhenDisabled === true) && element.handlers.click !== undefined
  ) {
    throw new Error(
      "Button: the element already handles click, which Button would replace. Send the message from onPress"
    )
  }
  const disabled = props.disabled === true
  const focusable = disabled && props.focusableWhenDisabled === true
  const button = element
    .attr("type", props.type ?? "button")
    .attr("aria-disabled", focusable ? "true" : undefined)
    .attr("data-disabled", flag(disabled))
    .disabled(disabled && !focusable)
  // A focusable disabled button keeps receiving clicks, so it cancels them,
  // and a submit button doesn't submit its form. A natively disabled one
  // receives none. `onPress` only sends: an enabled reset button resets.
  const pressable = focusable
    ? button.onClick(() => undefined, { preventDefault: "always" })
    : !disabled && options.onPress !== undefined
    ? button.onClick(options.onPress)
    : button
  return View.build(pressable, options.children ?? [])
}
