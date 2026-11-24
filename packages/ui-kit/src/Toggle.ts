/**
 * A two-state button that is pressed or not, such as a bold button in a
 * toolbar.
 *
 * `Toggle` is a view function. It keeps no state, so it takes no `key`:
 * the consumer owns the value, passes it as `pressed`, and stores what
 * `onToggle` reports.
 *
 * **Anatomy**
 *
 * `Toggle` returns a single `<button>` builder. It uses `h.button` by
 * default. Pass `element` to share the button with another part, such as
 * a tooltip trigger. Chain classes, attributes and children on the result:
 * `Toggle(h, { props, onToggle }).class("tool").children("B")`.
 *
 * Naming the toggle is the consumer's job: text inside it, or an
 * `aria-label` or `aria-labelledby` on the button. Keep the name the same
 * in both states, as `aria-pressed` already reports which one it is in.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent:
 *
 * - `data-pressed`
 * - `data-disabled`
 *
 * **Keyboard**
 *
 * The toggle is a native `<button>`, so Space and Enter toggle it and Tab
 * moves focus, without a key handler. A disabled toggle leaves the tab
 * order.
 *
 * **Example** (A bold toggle whose value lives in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Toggle } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const EditorMessage = UiSchema.TaggedEnum({ ToggledBold: { pressed: Schema.Boolean } })
 *
 * const Editor = Component.define({
 *   name: "Editor",
 *   scoped: false,
 *   model: Schema.Struct({ bold: Schema.Boolean }),
 *   message: EditorMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ bold: false }),
 *   update: {
 *     ToggledBold: ($, { pressed }) => $.evolve({ bold: pressed })
 *   },
 *   view: (h, model) =>
 *     Toggle(h, {
 *       props: { pressed: model.bold },
 *       onToggle: ({ pressed }) => EditorMessage.ToggledBold({ pressed })
 *     })
 *       .class("tool")
 *       .attr("aria-label", "Bold")
 *       .children("B")
 * })
 *
 * // The button keeps the consumer's class and reports that it isn't pressed.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Editor, {}))
 * if (!/<button class="tool"[^>]* aria-pressed="false"/.test(html)) throw new Error("the toggle isn't a styled toggle")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Html from "@effect/ui/html/Html"
import { pressedAttrs } from "./internal/attributes.ts"

/**
 * The controlled value and interaction state for `Toggle`.
 *
 * **Details**
 *
 * - `pressed`: whether the toggle is on. Required: the consumer owns it.
 * - `disabled`: sets the native `disabled` attribute, so the toggle is
 *   skipped by Tab and ignores clicks.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ToggleProps {
  readonly pressed: boolean
  readonly disabled?: boolean | undefined
}

/**
 * A `<button>` builder: what `Toggle` accepts as `element`, from the
 * consumer's `h.button`, and what it returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ToggleElement<Msg, R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>

/**
 * A toggle button. Call it with the consumer's `h`, the `props`, and the
 * click as `onToggle`, then chain the label with `.children(...)`.
 *
 * **Details**
 *
 * `onToggle` is what a click sends: it gets the value the user asked for,
 * which the consumer stores and passes back as `pressed`. It never cancels
 * the click. A disabled toggle sets no click handler, and the browser gives
 * a disabled button no click.
 *
 * `Toggle` returns the builder it was given, or `h.button`, and writes its
 * own attributes when the element is built. So they win over the
 * consumer's, set on `element` or chained after the call: `type`,
 * `disabled`, `aria-pressed`, `aria-disabled`, `data-pressed` and
 * `data-disabled`, including the ones a state leaves absent. A `disabled`
 * the consumer sets is removed unless the `disabled` prop is set. The
 * consumer's other attributes, handlers and children, and a part's layer,
 * stay.
 *
 * With `onToggle`, a click handler of the consumer's own, set on
 * `element` or chained after the call, throws at render, whatever the
 * state: send the message from `onToggle`. Without it, `Toggle` sets no
 * click handler, so the consumer's stays, and without one a click reaches
 * an ancestor's.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Toggle = <Msg, R = never>(
  h: { readonly button: ToggleElement<Msg> },
  options: {
    /** The consumer's `h.button`, to stack a part on it. `h.button` when left out. */
    readonly element?: ToggleElement<Msg, R> | undefined
    readonly props: ToggleProps
    /** The message a click sends, from the value the user asked for. */
    readonly onToggle?:
      | ((event: { readonly pressed: boolean }) => NoInfer<Msg> | undefined)
      | undefined
  }
): ToggleElement<Msg, R> => {
  const element: ToggleElement<Msg, R> = options.element ?? h.button
  const { onToggle, props } = options
  const disabled = props.disabled === true
  // The writes wait for the finished button, so they come after whatever
  // the consumer chains on it, and the check sees a click handler chained
  // after the call.
  return element.forward((node) => {
    // By `onToggle` alone, not by the state: a clash that waited for the
    // toggle to be enabled would first show in production.
    if (onToggle !== undefined && node.handlers.click !== undefined) {
      throw new Error(
        "Toggle: the element already handles click, which onToggle would replace. Send the message from onToggle"
      )
    }
    const button = pressedAttrs(node, props.pressed, disabled)
    return !disabled && onToggle !== undefined
      ? button.onClick(() => onToggle({ pressed: !props.pressed }))
      : button
  })
}
