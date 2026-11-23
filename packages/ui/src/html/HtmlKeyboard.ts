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
 * `ctrl`, `alt` and `meta` default to `false`. `shift` is ignored unless set,
 * so a character key such as `"?"` or `"G"` matches regardless of whether the
 * user's keyboard layout requires Shift to type it. `whileTyping` defaults to
 * `false` (ignored when `editable` is true), and `repeat` defaults to `false`
 * (ignored while the key auto-repeats).
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface Shortcut<Msg> {
  readonly key: string
  readonly message: Msg
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
 * an instance's single document listener.
 *
 * **Example** (Document shortcuts with `HtmlSubscription.onDocument`)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlKeyboard, HtmlSubscription } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Locator } from "@effect/ui/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ OpenedHelp: {}, ClosedHelp: {} })
 *
 * const App = Component.define({
 *   name: "App",
 *   scoped: false,
 *   model: Schema.Boolean,
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => false,
 *   update: { OpenedHelp: () => true, ClosedHelp: () => false },
 *   view: (h, open) => h.p(open ? "help open" : "help closed"),
 *   subscriptions: () => [
 *     HtmlSubscription.onDocument(
 *       "keydown",
 *       HtmlKeyboard.shortcuts([
 *         { key: "?", message: Message.OpenedHelp() },
 *         { key: "Escape", message: Message.ClosedHelp(), whileTyping: true }
 *       ]),
 *       { preventDefault: true }
 *     )
 *   ]
 * })
 *
 * Effect.gen(function*() {
 *   const s = yield* HtmlScene.make(App, {})
 *   s.fireDocument("keydown", { key: "?", editable: true }).expectIgnored()
 *     .fireDocument("keydown", { key: "?", shift: true }).expect(Locator.text("help open")).toExist()
 *     .fireDocument("keydown", { key: "Escape", editable: true }).expect(Locator.text("help closed")).toExist()
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
      payload.ctrl === (shortcut.ctrl ?? false) &&
      payload.alt === (shortcut.alt ?? false) &&
      payload.meta === (shortcut.meta ?? false) &&
      (shortcut.shift === undefined || payload.shift === shortcut.shift) &&
      (!payload.editable || shortcut.whileTyping === true) &&
      (!payload.repeat || shortcut.repeat === true)
    ) {
      return shortcut.message as Rows[number]["message"]
    }
  }
  return undefined
}
