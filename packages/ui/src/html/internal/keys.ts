/**
 * The per-press test `HtmlKeyboard.shortcuts` and
 * `HtmlSubscription.keySequences` share.
 *
 * @internal
 */
import type * as Html from "../Html.ts"
import type * as HtmlKeyboard from "../HtmlKeyboard.ts"

/**
 * Whether `payload` presses `key` with `row`'s modifiers and guards.
 *
 * @internal
 */
export const matches = (
  row: Omit<HtmlKeyboard.Shortcut<unknown>, "key">,
  key: string,
  payload: Html.KeyPayload
): boolean =>
  key === payload.key &&
  (row.mod === true
    ? payload.ctrl !== payload.meta
    : payload.ctrl === (row.ctrl ?? false) &&
      payload.meta === (row.meta ?? false)) &&
  payload.alt === (row.alt ?? false) &&
  (row.shift === undefined || payload.shift === row.shift) &&
  (!payload.editable || row.whileTyping === true) &&
  (!payload.repeat || row.repeat === true)
