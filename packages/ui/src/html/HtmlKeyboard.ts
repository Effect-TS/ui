/**
 * Pure keyboard helpers over `Html.KeyPayload`: turn a table of single-key
 * shortcuts into a handler for `HtmlSubscription.onDocument` or element
 * `onKeyDown`.
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Html from "./Html.ts"
import type * as HtmlSubscription from "./HtmlSubscription.ts"

/**
 * One row of a table for {@link shortcuts}: a key to match, the message to
 * produce, and optional modifier and guard overrides.
 *
 * **Details**
 *
 * `ctrl`, `alt` and `meta` default to `false`. `mod: true` matches a
 * cross-platform primary shortcut — either `ctrl` or `meta` pressed, but not
 * both — and takes precedence over `ctrl` and `meta`. `shift` is ignored
 * unless set, so a character key such as `"?"` or `"G"` matches regardless of
 * whether the user's keyboard layout requires Shift to type it. `whileTyping`
 * defaults to `false` (ignored when `editable` is true), and `repeat` defaults
 * to `false` (ignored while the key auto-repeats).
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface Shortcut<Msg> {
  readonly key: string
  readonly message: Msg
  readonly mod?: boolean | undefined
  readonly shift?: boolean | undefined
  readonly ctrl?: boolean | undefined
  readonly alt?: boolean | undefined
  readonly meta?: boolean | undefined
  readonly whileTyping?: boolean | undefined
  readonly repeat?: boolean | undefined
}

/**
 * Turns a table of single-key {@link Shortcut} rows into a pure `keydown` or
 * `keyup` handler usable with `HtmlSubscription.onDocument` or element
 * `onKeyDown`.
 *
 * **Details**
 *
 * Events with `composing` are always ignored, and on document listeners
 * (`HtmlSubscription.onDocument`) events with `defaultPrevented` are ignored as
 * well (element payloads carry no `defaultPrevented`). Each row is checked in
 * order and the first match returns its `message`. Unmatched events return
 * `undefined`, so `{ preventDefault: true }` cancels the browser's default
 * only for matched shortcuts. On element handlers, returning `undefined` does
 * not fall through to an ancestor element's handler because the host stops at
 * the innermost element that listens; a document listener can still receive it.
 *
 * Because this returns a plain handler function with no state and no
 * listener registration, it can be combined with other keydown logic inside
 * an instance's single document listener. For a table that is the whole
 * document listener, use `HtmlSubscription.shortcuts`.
 *
 * **Example** (Shortcuts on an element)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlKeyboard } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ PressedNext: {}, PressedPrevious: {} })
 *
 * const Rows = Component.define({
 *   name: "Rows",
 *   scoped: false,
 *   model: Schema.Number,
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => 0,
 *   update: { PressedNext: ($) => $.model + 1, PressedPrevious: ($) => $.model - 1 },
 *   view: (h, row) =>
 *     h.button.onKeyDown(
 *       HtmlKeyboard.shortcuts([
 *         { key: "j", message: Message.PressedNext() },
 *         { key: "k", message: Message.PressedPrevious() }
 *       ]),
 *       { preventDefault: true }
 *     ).children(`row ${row}`)
 * })
 *
 * Effect.gen(function*() {
 *   const s = yield* HtmlScene.make(Rows, {})
 *   s.keydown(Locator.tag("button"), "x").expectIgnored()
 *     .keydown(Locator.tag("button"), "j").expectDefaultPrevented()
 *     .expect(Locator.text("row 1")).toExist()
 * }).pipe(Effect.scoped, Effect.runSync)
 * ```
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export const shortcuts = <const Rows extends ReadonlyArray<Shortcut<unknown>>>(
  table: Rows
): (
  payload: Html.KeyPayload | HtmlSubscription.GlobalPayload<Html.KeyPayload>
) => Rows[number]["message"] | undefined =>
(payload) => {
  if (("defaultPrevented" in payload && payload.defaultPrevented) || payload.composing) return undefined
  for (const shortcut of table) {
    if (
      shortcut.key === payload.key &&
      (shortcut.mod === true
        ? payload.ctrl !== payload.meta
        : payload.ctrl === (shortcut.ctrl ?? false) && payload.meta === (shortcut.meta ?? false)) &&
      payload.alt === (shortcut.alt ?? false) &&
      (shortcut.shift === undefined || payload.shift === shortcut.shift) &&
      (!payload.editable || shortcut.whileTyping === true) &&
      (!payload.repeat || shortcut.repeat === true)
    ) {
      return shortcut.message as Rows[number]["message"]
    }
  }
  return undefined
}
