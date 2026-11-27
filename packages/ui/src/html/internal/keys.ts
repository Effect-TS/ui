/**
 * How `HtmlKeyboard.shortcuts` and `HtmlSubscription.keySequences` match
 * presses against their rows.
 *
 * @internal
 */
import type * as Html from "../Html.ts"
import type * as HtmlKeyboard from "../HtmlKeyboard.ts"

type Row = HtmlKeyboard.Shortcut<unknown> | HtmlKeyboard.Sequence<unknown>

type Press = Pick<
  Html.KeyPayload,
  "key" | "shift" | "ctrl" | "alt" | "meta" | "repeat" | "editable"
>

/**
 * Whether `payload` presses `key` with `row`'s modifiers and guards.
 *
 * @internal
 */
export const matches = (
  row: Omit<HtmlKeyboard.Shortcut<unknown>, "key">,
  key: string,
  payload: Press
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

/**
 * The keys `row` takes, in order.
 *
 * @internal
 */
export const keysOf = (row: Row): ReadonlyArray<string> =>
  "keys" in row ? row.keys : [row.key]

/**
 * The first row `presses` match or begin.
 *
 * @internal
 */
export const first = <R extends Row>(
  table: ReadonlyArray<R>,
  presses: ReadonlyArray<Press>
): R | undefined =>
  table.find((row) => {
    const want = keysOf(row)
    return presses.length <= want.length &&
      presses.every((press, i) => matches(row, want[i]!, press))
  })

const named = (row: Row): string => JSON.stringify(keysOf(row).join(" "))

/**
 * Development only. Throws for a row without keys, and for one no presses
 * can fire: on every run of presses it takes, an earlier row completes on
 * the way or is the {@link first}.
 *
 * @internal
 */
export const checkSequences = (table: ReadonlyArray<Row>): void =>
  table.forEach((row, index) => {
    const keys = keysOf(row)
    if (keys.length === 0) {
      throw new Error(
        "HtmlSubscription.keySequences: row " + index + " has no keys"
      )
    }
    const upTo = table.slice(0, index + 1)
    let blocker: Row | undefined
    // What a run leads to depends only on its length and the rows it fits.
    const seen = new Set<string>()
    // Whether `row` fires after `run`, with every combination of the flags `matches` reads tried for each press.
    const fires = (run: ReadonlyArray<Press>): boolean => {
      for (let i = 0; i < 64; i++) {
        const presses = [...run, {
          key: keys[run.length]!,
          ctrl: (i & 1) > 0,
          meta: (i & 2) > 0,
          alt: (i & 4) > 0,
          shift: (i & 8) > 0,
          editable: (i & 16) > 0,
          repeat: (i & 32) > 0
        }]
        if (first([row], presses) === undefined) continue
        const id = presses.length +
          upTo.map((other) => first([other], presses) ? 1 : 0).join("")
        if (seen.has(id)) continue
        seen.add(id)
        const winner = first(upTo, presses)!
        if (
          presses.length === keys.length ||
          presses.length === keysOf(winner).length
        ) {
          if (upTo.indexOf(winner) === index) return true
          blocker ??= winner
        } else if (fires(presses)) return true
      }
      return false
    }
    if (!fires([])) {
      throw new Error(
        "HtmlSubscription.keySequences: the row " + named(blocker!) +
          " makes the later row " + named(row) + " unreachable"
      )
    }
  })
