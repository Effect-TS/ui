/**
 * Type-to-jump matching over a list of labelled items: pressing characters
 * moves to the first enabled item whose label starts with what was typed,
 * repeating the same letter cycles through matching items, and a reset timer
 * clears the buffer after a pause.
 *
 * `Select`, `Menu`, `Combobox` and `Autocomplete` use this module. Use it in
 * any custom list, picker or trigger that needs keyboard typeahead.
 *
 * Keep `Typeahead.State` in your component's Model, call `Typeahead.step` in
 * `update`, and schedule `Typeahead.waitReset` to clear the buffer after the
 * user stops typing.
 *
 * **Example** (Typing to jump and cycling on repeated letters)
 *
 * ```ts import.meta.vitest
 * import { Typeahead } from "@effect/ui-kit"
 *
 * const items = [
 *   { label: "Apple" },
 *   { label: "Apricot", disabled: true },
 *   { label: "Avocado" },
 *   { label: "Banana" }
 * ]
 *
 * const first = Typeahead.step(Typeahead.initial, "a", items, -1)
 * if (first.index !== 0) throw new Error("should match Apple")
 *
 * // Repeating the same letter cycles past disabled Apricot to Avocado.
 * const second = Typeahead.step(first.state, "a", items, first.index)
 * if (second.index !== 2) throw new Error("should cycle to Avocado")
 *
 * // Resetting clears the buffer so typing starts fresh.
 * const cleared = Typeahead.reset(second.state)
 * if (Typeahead.isTyping(cleared)) throw new Error("buffer should be cleared")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import type * as Html from "@effect/ui/html/Html"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { available } from "./ListNavigation.ts"

const defaultDelay = 750

/**
 * An item `step` can match: a `label` to match against, and an optional
 * `disabled` flag. Disabled items are skipped.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Item {
  readonly label: string
  readonly disabled?: boolean | undefined
}

/**
 * The typeahead buffer stored in a component's Model.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const State = Schema.Struct({
  typed: Schema.String,
  typedFrom: Schema.Number,
  matched: Schema.Number
})

/**
 * The typeahead buffer stored in a component's Model.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type State = typeof State.Type

/**
 * The result of `step`: the next `State` to store in the Model, and `index`,
 * the index of the matched item in `items` or `-1` when nothing matched.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Step {
  readonly state: State
  readonly index: number
}

/**
 * The subset of `Html.KeyPayload` that `isPrintable` inspects.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type KeyEvent = Pick<
  Html.KeyPayload,
  "key" | "alt" | "ctrl" | "meta" | "composing"
>

/**
 * The initial empty `State`.
 *
 * @stability experimental
 * @category constants
 * @since 0.1.0
 */
export const initial: State = {
  typed: "",
  typedFrom: -1,
  matched: -1
}

const matchOf = (
  items: ReadonlyArray<Item>,
  text: string,
  start: number
): number => {
  if (items.length === 0) return -1
  const lower = text.toLowerCase()
  const from = ((start % items.length) + items.length) % items.length
  for (let offset = 0; offset < items.length; offset++) {
    const index = (from + offset) % items.length
    const item = items[index]!
    if (available(item) && item.label.toLowerCase().startsWith(lower)) {
      return index
    }
  }
  return -1
}

/**
 * Advances the typeahead `state` by one typed `key` over `items`, starting
 * after `from` (or from the start of `items` when `from` is `-1`).
 *
 * **Details**
 *
 * Matching is case-insensitive and skips disabled items. Pressing the same
 * single letter repeatedly cycles through items starting with that letter,
 * unless an enabled item's label begins with that letter doubled (such as
 * `"Aaron"`). A space that fails to extend a match is kept in the buffer so
 * multi-word labels can still match; any other unmatched key clears it.
 *
 * @stability experimental
 * @category matching
 * @since 0.1.0
 */
export const step = (
  state: State,
  key: string,
  items: ReadonlyArray<Item>,
  from = -1
): Step => {
  let typed = state.typed
  let typedFrom = typed === "" ? from : state.typedFrom
  if (
    typed.toLowerCase() === key.toLowerCase() &&
    items.every((item) =>
      !available(item) ||
      item.label[0]?.toLowerCase() !== item.label[1]?.toLowerCase()
    )
  ) {
    typed = ""
    typedFrom = state.matched
  }
  typed += key
  const index = matchOf(items, typed, typedFrom + 1)
  if (index !== -1) {
    return { state: { typed, typedFrom, matched: index }, index }
  }
  return {
    state: {
      typed: key === " " ? typed : "",
      typedFrom,
      matched: state.matched
    },
    index
  }
}

/**
 * Clears the buffered text so the next key starts a fresh search.
 *
 * @stability experimental
 * @category matching
 * @since 0.1.0
 */
export const reset = (state: State): State =>
  state.typed === "" ? state : { ...state, typed: "" }

/**
 * Returns `true` while characters are buffered in `state`.
 *
 * **Details**
 *
 * Use it to distinguish a Space pressed mid-word (part of typeahead) from a
 * standalone Space (which activates the highlighted item or opens a trigger).
 *
 * @stability experimental
 * @category guards
 * @since 0.1.0
 */
export const isTyping = (state: State): boolean => state.typed !== ""

/**
 * Returns `true` when a keydown payload is a single printable character that
 * is not part of an IME composition and has no `Alt`, `Ctrl` or `Meta`
 * modifier.
 *
 * @stability experimental
 * @category guards
 * @since 0.1.0
 */
export const isPrintable = (event: KeyEvent): boolean =>
  !event.composing && event.key.length === 1 && !event.alt && !event.ctrl &&
  !event.meta

/**
 * The switch-mode Command behind `waitReset`, for a story's
 * `.resolve(Typeahead.WaitReset, undefined)`.
 *
 * **Details**
 *
 * Waits `delay` milliseconds (750 ms when omitted). Each new
 * run interrupts the previous one in the same component instance, so the timer
 * restarts on every key press.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const WaitReset: Command.Factory<
  { readonly delay?: number | undefined },
  void
> = Command.make(
  "Typeahead.waitReset",
  { args: { delay: Schema.optional(Schema.Number) }, mode: "switch" },
  ({ delay }) => Effect.sleep(Duration.millis(delay ?? defaultDelay))
)

/**
 * Waits `delay` milliseconds (750 ms when omitted) before
 * sending `onComplete`'s message, restarting the timer whenever issued again.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const waitReset = <Msg>(
  onComplete: () => Msg,
  delay?: number | undefined
): Command.Mapped<Command.Issued<void, never, void, "Effect">, Msg> =>
  Command.map(
    WaitReset.make(delay === undefined ? {} : { delay }),
    onComplete
  )
