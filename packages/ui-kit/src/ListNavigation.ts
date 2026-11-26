/**
 * Moves an index across a list of items in response to arrow keys, `Home` and
 * `End`, respecting orientation, text direction and looping.
 *
 * `step` and `target` return indexes; the caller moves focus or updates a
 * highlight such as `aria-activedescendant`. Filter disabled items with
 * `available` before calculating indexes.
 *
 * **Example** (Navigating a horizontal right-to-left list)
 *
 * ```ts import.meta.vitest
 * import { ListNavigation } from "@effect/ui-kit"
 *
 * const items = [
 *   { value: "a" },
 *   { value: "b", disabled: true },
 *   { value: "c" }
 * ].filter(ListNavigation.available)
 *
 * const next = ListNavigation.target("ArrowLeft", {
 *   at: 0,
 *   last: items.length - 1,
 *   orientation: "horizontal",
 *   rtl: true,
 *   loop: "wrap"
 * })
 * if (next !== 1 || items[next]?.value !== "c") {
 *   throw new Error("ArrowLeft in RTL should move from a to c")
 * }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Html from "@effect/ui/html/Html"
import * as Schema from "effect/Schema"

/**
 * The axis a list runs along, which decides which arrow keys move through it.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Orientation = Schema.Literals(["horizontal", "vertical"])

/**
 * The axis a list runs along.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Orientation = typeof Orientation.Type

/**
 * What `step` and `target` do at the ends of a list.
 *
 * - `"none"`: stay on the first or last item.
 * - `"wrap"`: jump from the last item to the first and back.
 * - `"escape"`: return `-1` past either end, so a highlight can clear before
 *   entering the other end on the next press.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Loop = Schema.Literals(["none", "wrap", "escape"])

/**
 * What `step` and `target` do at the ends of a list.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Loop = typeof Loop.Type

/**
 * The `KeyboardEvent.key` names for moving forward and backward along an axis.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ArrowKeys {
  readonly next: string
  readonly previous: string
}

/**
 * The subset of `Html.KeyPayload` that `isKey` inspects.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type KeyEvent = Pick<
  Html.KeyPayload,
  "key" | "alt" | "ctrl" | "meta" | "shift" | "composing"
>

/**
 * Options for `target`.
 *
 * - `at`: the current index, or `-1` when no item is active.
 * - `last`: the last valid index (`items.length - 1`), or `-1` for an empty
 *   list.
 * - `orientation`: `"vertical"` by default.
 * - `rtl`: swaps `ArrowLeft` and `ArrowRight` when `orientation` is
 *   `"horizontal"`. `false` by default.
 * - `loop`: `"wrap"` by default.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TargetOptions {
  readonly at: number
  readonly last: number
  readonly orientation?: Orientation | undefined
  readonly rtl?: boolean | undefined
  readonly loop?: Loop | undefined
}

/**
 * Returns `true` when an item is defined and not disabled.
 *
 * @stability experimental
 * @category guards
 * @since 0.1.0
 */
export const available = <
  A extends { readonly disabled?: boolean | undefined }
>(item: A | undefined): item is A =>
  item !== undefined && item.disabled !== true

/**
 * Returns the `next` and `previous` arrow key names for an `orientation` and
 * reading direction.
 *
 * @stability experimental
 * @category navigation
 * @since 0.1.0
 */
export const arrowKeys = (
  orientation: Orientation,
  rtl = false
): ArrowKeys =>
  orientation === "vertical"
    ? { next: "ArrowDown", previous: "ArrowUp" }
    : {
      next: rtl ? "ArrowLeft" : "ArrowRight",
      previous: rtl ? "ArrowRight" : "ArrowLeft"
    }

/**
 * Moves an index by one step (`1` or `-1`) within `[0, last]`, following
 * `loop` at the ends. Returns `-1` when `last < 0` or when `loop` is
 * `"escape"` and the step leaves the list.
 *
 * @stability experimental
 * @category navigation
 * @since 0.1.0
 */
export const step = (
  at: number,
  last: number,
  direction: 1 | -1,
  loop: Loop = "wrap"
): number => {
  if (last < 0) return -1
  if (at === -1) return direction === 1 ? 0 : last
  const next = at + direction
  if (next >= 0 && next <= last) return next
  return loop === "none"
    ? at
    : loop === "escape"
    ? -1
    : direction === 1
    ? 0
    : last
}

/**
 * Resolves a key press to the next list index, or `undefined` when `key` is
 * not a navigation key for the given `orientation`.
 *
 * Handles `Home`, `End`, and the arrow keys of `orientation` (swapped when
 * `rtl` is `true` for `"horizontal"`). Returns `-1` when the list is empty
 * (`last < 0`) or when `loop` is `"escape"` and the press leaves the list.
 *
 * @stability experimental
 * @category navigation
 * @since 0.1.0
 */
export const target = (
  key: string,
  options: TargetOptions
): number | undefined => {
  const { at, last, loop } = options
  const { next, previous } = arrowKeys(
    options.orientation ?? "vertical",
    options.rtl
  )
  if (key === "Home") return last < 0 ? -1 : 0
  if (key === "End") return last < 0 ? -1 : last
  if (key === next) return step(at, last, 1, loop)
  if (key === previous) return step(at, last, -1, loop)
  return undefined
}

/**
 * Returns `true` when a keydown payload is an unmodified, non-composing
 * navigation key (`Home`, `End`, or the arrow keys for `orientation`).
 *
 * Use it in a view or `parts` `keydown` handler with `{ preventDefault: true }`
 * to cancel the browser default only for matching keys.
 *
 * @stability experimental
 * @category guards
 * @since 0.1.0
 */
export const isKey = (
  event: KeyEvent,
  orientation: Orientation = "vertical"
): boolean => {
  if (
    event.composing || event.alt || event.ctrl || event.meta || event.shift
  ) return false
  const { next, previous } = arrowKeys(orientation, false)
  return event.key === next || event.key === previous ||
    event.key === "Home" || event.key === "End"
}
