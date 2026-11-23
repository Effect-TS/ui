/**
 * A native button that can stay focusable while disabled. An enabled press
 * sends the caller's `onPress` message to its `update` function.
 *
 * `Button` is a view function. It keeps no state, so it takes no `key`.
 *
 * **Anatomy**
 *
 * `Button` returns a single `<button>` builder. It uses `h.button` by
 * default. Pass `element` to share the button with another part, such as
 * a tooltip trigger. Chain classes, attributes and children on the result:
 * `Button(h, { onPress }).class("save").children("Save")`.
 *
 * **Data attributes**
 *
 * Present with an empty value or absent:
 *
 * - `data-disabled`
 *
 * **Keyboard and disabled state**
 *
 * Space and Enter activate the button through the browser's native click
 * behavior. A disabled button sends no press message and normally leaves
 * the tab order.
 *
 * With `focusableWhenDisabled`, a disabled button uses `aria-disabled="true"`
 * instead of the native `disabled` attribute and stays in the tab order.
 * Once mounted, it cancels clicks, including those triggered by the keyboard.
 * Before mount, `aria-disabled` alone does not prevent the native action:
 * a server-rendered submit button can still submit its form.
 * An enabled button has neither `aria-disabled` nor `data-disabled`.
 *
 * **Forms and click handlers**
 *
 * `props.type` overrides the builder's `type` attribute and defaults to
 * `"button"`. Sending `onPress` does not cancel an enabled button's
 * native submit or reset action.
 *
 * With `onPress` or `focusableWhenDisabled: true`, a caller's `.onClick(...)`
 * on `element` or chained after `Button(...)` throws at render in every state.
 * A stacked headless part, such as a tooltip trigger, handles the same click
 * on its own layer without clashing.
 *
 * **Example** (A save button that stays focusable while it saves)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Button } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const EditorMessage = UiSchema.TaggedEnum({ PressedSave: {} })
 *
 * const Editor = Component.define({
 *   name: "Editor",
 *   scoped: false,
 *   model: Schema.Struct({ saving: Schema.Boolean }),
 *   message: EditorMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ saving: false }),
 *   update: {
 *     PressedSave: ($) => $.evolve({ saving: true })
 *   },
 *   view: (h, model) =>
 *     Button(h, {
 *       props: { disabled: model.saving, focusableWhenDisabled: true },
 *       onPress: EditorMessage.PressedSave()
 *     })
 *       .class("save")
 *       .children(model.saving ? "Saving" : "Save")
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
import { flag } from "./internal/attributes.ts"

/**
 * Options for the button's disabled state, focus behavior and form action.
 *
 * **Details**
 *
 * - `disabled`: the button sends no press message and has `data-disabled`.
 *   By default it also has the native `disabled` attribute.
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
 * A `<button>` builder: what `Button` accepts as `element`, from the
 * caller's `h.button`, and what it returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ButtonElement<Msg, R = never> = Html.Element<Msg, R, Html.EventsOf<"button">, HTMLButtonElement, "button">

/**
 * A button that can stay focusable while disabled. Call it with the
 * caller's `h` and the press as `onPress`, then chain the label with
 * `.children(...)`.
 *
 * **Details**
 *
 * `Button` returns the builder it was given, or `h.button`, and writes its
 * own attributes in `forward`, when the element is built. So they win over
 * the caller's, set on `element` or chained after the call: `type`,
 * `disabled`, `aria-disabled` and `data-disabled`, including the ones a
 * state leaves absent. A `disabled` the caller sets is removed unless the
 * `disabled` prop is set. The caller's other attributes, handlers and
 * children, and a part's layer, stay.
 *
 * `Button` sets the click handler for `onPress`, and for a disabled
 * button with `focusableWhenDisabled`, whose click it cancels. Given
 * either, a click handler of the caller's own, set on `element` or chained
 * after the call, throws at render, whatever the state: pass the message
 * as `onPress`. Given neither, `Button` sets no click handler, so the
 * caller's stays, and without one a click reaches an ancestor's.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Button = <Msg, R = never>(
  h: { readonly button: ButtonElement<Msg> },
  options: {
    /** The caller's `h.button`, to stack a part on it. `h.button` when left out. */
    readonly element?: ButtonElement<Msg, R> | undefined
    readonly props?: ButtonProps | undefined
    /** The message a press sends, with a click, Space or Enter. */
    readonly onPress?: NoInfer<Msg> | undefined
  } = {}
): ButtonElement<Msg, R> => {
  const element: ButtonElement<Msg, R> = options.element ?? h.button
  const { onPress } = options
  const props = options.props ?? {}
  const disabled = props.disabled === true
  const focusable = disabled && props.focusableWhenDisabled === true
  // The writes wait for the finished button, so they come after whatever
  // the caller chains on it, and the check sees a click handler chained
  // after the call.
  return element.forward((node) => {
    // By the options alone, not by the state: a clash that waited for the
    // button to be disabled would first show in production.
    if ((onPress !== undefined || props.focusableWhenDisabled === true) && node.handlers.click !== undefined) {
      throw new Error(
        "Button: the element already handles click, which Button would replace. Send the message from onPress"
      )
    }
    const button = node
      .attrs({
        type: props.type ?? "button",
        "aria-disabled": focusable ? "true" : undefined,
        "data-disabled": flag(disabled)
      })
      .disabled(disabled && !focusable)
    // A focusable disabled button keeps receiving clicks, so it cancels
    // them, and a submit button doesn't submit its form. A natively
    // disabled one receives none. `onPress` only sends: an enabled reset
    // button resets.
    return focusable
      ? button.onClick(() => undefined, { preventDefault: "always" })
      : !disabled && onPress !== undefined
      ? button.onClick(onPress)
      : button
  })
}
