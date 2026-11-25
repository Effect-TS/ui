/**
 * Pure keyboard shortcut matcher over `OpenTui.KeyPayload`: turns a table of
 * single-key shortcuts into a handler for `OpenTuiSubscription.onKeyPress` or
 * an element's `keydown` handler.
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as OpenTui from "./OpenTui.ts"
import type * as OpenTuiSubscription from "./OpenTuiSubscription.ts"

/**
 * One row of a shortcut table for {@link shortcuts}.
 *
 * **Details**
 *
 * `ctrl`, `option` and `meta` default to `false`. `mod: true` matches either
 * `ctrl` or `meta` (but not both) and takes precedence over `ctrl` and `meta`.
 * `shift` is ignored unless specified. `whileTyping` defaults to `false`
 * (ignored when `editable` is true), and `repeat` defaults to `false`.
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
  readonly option?: boolean | undefined
  readonly meta?: boolean | undefined
  readonly whileTyping?: boolean | undefined
  readonly repeat?: boolean | undefined
}

/**
 * Turns a table of {@link Shortcut} rows into a pure key handler.
 *
 * **Details**
 *
 * Events with `defaultPrevented` set are ignored. Rows are checked in order
 * and the first match returns its `message`; unmatched keys return `undefined`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export const shortcuts = <const Rows extends ReadonlyArray<Shortcut<unknown>>>(
  table: Rows
): (
  payload:
    | OpenTui.KeyPayload
    | OpenTuiSubscription.GlobalPayload<OpenTui.KeyPayload>
) => Rows[number]["message"] | undefined =>
(payload) => {
  if ("defaultPrevented" in payload && payload.defaultPrevented) {
    return undefined
  }
  for (const shortcut of table) {
    if (
      shortcut.key === payload.key &&
      (shortcut.mod === true
        ? payload.ctrl !== payload.meta
        : payload.ctrl === (shortcut.ctrl ?? false) &&
          payload.meta === (shortcut.meta ?? false)) &&
      payload.option === (shortcut.option ?? false) &&
      (shortcut.shift === undefined || payload.shift === shortcut.shift) &&
      (!payload.editable || shortcut.whileTyping === true) &&
      (!payload.repeat || shortcut.repeat === true)
    ) {
      return shortcut.message as Rows[number]["message"]
    }
  }
  return undefined
}
