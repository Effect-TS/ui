/**
 * A controlled input for a number, with stepper buttons and an area to drag
 * across. Pass the current value as `value`, a number or `null` for an
 * empty field, and store the one `Updated` carries. Your view supplies the
 * markup; the component formats and parses the text for a locale, steps the
 * value from the keyboard, the buttons, the wheel and a drag, and adds the
 * ARIA and data attributes. It is a headless component, because it keeps the
 * text being typed and the press or drag under way.
 *
 * **Anatomy**
 *
 * | Part              | Element                                              |
 * | :---------------- | :--------------------------------------------------- |
 * | `root`            | any element, around every other part                 |
 * | `group`           | any element, `role="group"`, around the input and the buttons |
 * | `input`           | `<input>`, the text field                           |
 * | `decrement`       | `<button>`                                           |
 * | `increment`       | `<button>`                                           |
 * | `scrubArea`       | any element, dragged across to change the value      |
 * | `scrubAreaCursor` | any element inside the scrub area, shown during a drag |
 *
 * `root`, `group`, `input` and `scrubAreaCursor` each take the consumer's
 * builder and return it, so the consumer goes on chaining and adds children
 * with `.children(...)`. The others take an options object and return its
 * `element`:
 *
 * - `decrement({ element, disabled })` and `increment({ element, disabled })`:
 *   `disabled` makes that one button unavailable.
 * - `scrubArea({ element, direction, pixelSensitivity, teleportDistance })`:
 *   `direction` is `"horizontal"` by default, or `"vertical"`.
 *   `pixelSensitivity`, `2` by default, is how many pixels the pointer
 *   moves before the value changes. `teleportDistance` is how far the
 *   cursor goes from the scrub area before it comes back in on the other
 *   side. Without it the cursor wraps at the edges of the viewport.
 *
 * `root` adds a visually hidden `<input type="number">` after the
 * children you chain, which holds the form value. `scrubAreaCursor` returns
 * `undefined` unless a drag holds the pointer lock, so write
 * `numberField.scrubAreaCursor(h.span)?.children(icon)`.
 *
 * The parts also return `value`, `inputValue`, the text the input shows,
 * `disabled`, `readOnly`, `required` and `scrubbing`, for markup that
 * depends on them.
 *
 * The kit sets no look. A button and the scrub area get `user-select: none`
 * and the scrub area `touch-action: none`. The cursor is a popover, so it
 * sits in the top layer, and it gets `position: fixed`, its `inset`,
 * `margin: 0`, `pointer-events: none` and the `transform` that moves it.
 * A browser also gives a popover a border, padding, a background and
 * `overflow: auto`, so reset those on the cursor.
 *
 * **Naming**
 *
 * Name the input with a `<label for>`, an `aria-label`, or a `Field`: draw
 * it with `numberField.input(field.control(h.input))` and pass
 * `disabled: field.disabled`. The input keeps the id its builder has, the
 * field's or your own, and gets a generated one otherwise. Each button
 * points at it with `aria-controls`. The input gets
 * `aria-roledescription="Number field"` and the buttons `aria-label`
 * "Decrease" and "Increase", unless the builder has its own.
 *
 * **Data attributes**
 *
 * On every part, each present with an empty value or absent:
 *
 * - `data-disabled`: on a button, also while the value is at that
 *   button's bound or the button has `disabled`
 * - `data-readonly`
 * - `data-required`
 * - `data-scrubbing`: a drag on a scrub area is under way
 *
 * A `Field`'s data attributes, such as `data-invalid` and `data-touched`, go
 * on its own parts and on the input `field.control` decorates.
 *
 * **Keyboard**
 *
 * On the input:
 *
 * - ArrowUp and ArrowDown add `step` and take it away
 * - Shift with an arrow moves by `largeStep`, and Alt by `smallStep`
 * - Home and End go to `min` and `max`, when they are set
 *
 * Only the characters the locale and the format can show may be typed: its
 * digits, separators, signs, and the currency or unit. A second sign or
 * decimal separator is refused unless the selection replaces the first.
 * Digits of the Arabic-Indic, Persian, fullwidth and Han systems are read
 * too, and so are a typed percent or permille sign. Pasted text goes in at
 * the caret without the characters that may not be typed, and is dropped
 * unless the text then reads as a number. The buttons have
 * `tabindex="-1"`, as the arrows do their job from the input.
 *
 * The input's `keydown` handler cancels the default of the stepping keys
 * and of a character that may not be typed, so the input gets every
 * `keydown` while it has focus, and an ancestor's `onKeyDown` never sees
 * them. To handle them, add `onKeyDown` to the input's builder.
 *
 * **Pointer**
 *
 * A press on a button steps once, and holding it repeats the step after
 * 400 ms, every 60 ms, until the release or the bound. A mouse press also
 * moves focus to the input. A tap steps once, and a touch that scrolls the
 * page steps nothing.
 *
 * A drag across a scrub area steps the value by the pixels moved times the
 * step, with Shift and Alt as on the keyboard. A mouse or pen drag asks for
 * the pointer lock, so it can go on past the edge of the screen, and
 * `scrubAreaCursor` stands in for the pointer the lock hides. The browser
 * may show a notice for the lock. Touch, WebKit and a refused lock drag
 * without it, and then no cursor is drawn.
 *
 * With `allowWheelScrub`, the wheel over the focused input steps the value.
 *
 * **Events**
 *
 * `Updated` reports each value the user asks for: while typing, once the
 * text reads as a number, and for each step. `Committed` reports the value
 * once the user is done: when the input loses focus, after each key and
 * wheel turn, and when a button or a drag is released. Both carry a
 * `reason`. To refuse a change, don't store it: the typed text stays until
 * the input loses focus, and then it shows the stored value again.
 *
 * While typing, the input shows the text as typed, and the value is kept
 * within `min` and `max` unless `allowOutOfRange` is set. When the input
 * loses focus it shows the value, formatted. Text that doesn't read as a
 * number is dropped then.
 *
 * **Forms**
 *
 * The hidden input submits the value as a plain number under `name`, to
 * the form around the root or the one `form` names. It carries `min`, `max`,
 * `step` and `required`, so the browser refuses to submit a value outside
 * the range, or off the step, that `allowOutOfRange` or the consumer let in.
 * Pass `step: "any"` to submit any fraction. A disabled field submits
 * nothing.
 *
 * The server formats with its own default locale, which may differ from the
 * browser's. Pass `locale` when the field is rendered on a server.
 *
 * **Example** (A price in euros whose value lives in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Field, NumberField } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const CartMessage = UiSchema.TaggedEnum({ UpdatedPrice: { value: Schema.NullOr(Schema.Number) } })
 *
 * const Cart = Component.define({
 *   name: "Cart",
 *   model: Schema.Struct({ price: Schema.NullOr(Schema.Number) }),
 *   message: CartMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ price: 1234.5 }),
 *   update: {
 *     UpdatedPrice: (model, { value }) => ({ ...model, price: value })
 *   },
 *   view: (model, h) =>
 *     Field(h, {
 *       view: (field) =>
 *         NumberField(h, {
 *           props: {
 *             value: model.price,
 *             min: 0,
 *             name: "price",
 *             locale: "de-DE",
 *             format: { style: "currency", currency: "EUR" },
 *             disabled: field.disabled
 *           },
 *           onEmit: {
 *             Updated: ({ value }) => CartMessage.UpdatedPrice({ value }),
 *             Committed: () => undefined
 *           },
 *           view: (numberField) =>
 *             numberField.root(field.root(h.div)).children(
 *               numberField.scrubArea({ element: h.span }).children(
 *                 field.label(h.label).children("Price"),
 *                 numberField.scrubAreaCursor(h.span)?.children("↔")
 *               ),
 *               numberField.group(h.div).children(
 *                 numberField.decrement({ element: h.button }).children("-"),
 *                 numberField.input(field.control(h.input.class("amount"))),
 *                 numberField.increment({ element: h.button }).children("+")
 *               )
 *             )
 *         })
 *     })
 * })
 *
 * // The input shows the price as the locale writes it, and the hidden input holds the number.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Cart, {}))
 * const input = /<input class="amount" id="([^"]+)"[^>]*>/.exec(html)
 * if (input === null || !html.includes('<label for="' + input[1] + '"')) throw new Error("the input isn't labelled")
 * if (!/value="1\.234,50\s€"/.test(input[0])) throw new Error("the input doesn't show the formatted price")
 * if (!/<input[^>]*type="number"[^>]*name="price"[^>]*value="1234.5"/.test(html)) throw new Error("no form value")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { type Attributed, flag, idOf, noSelect, visuallyHidden, withStyle } from "./internal/attributes.ts"
import {
  allowedIn,
  allowsKey,
  allowsText,
  type Format,
  formatNumber,
  highest,
  lowest,
  parseNumber,
  type Range,
  rounded,
  typingOf,
  validated
} from "./internal/number.ts"
import { isGecko, isIOS, isWebKit } from "./internal/platform.ts"

/**
 * How a `NumberField` writes its number: the options of
 * `Intl.NumberFormat`, such as `{ style: "currency", currency: "EUR" }`.
 *
 * **Details**
 *
 * The input shows the value in this format and reads what is typed by it.
 * `notation: "compact"` shows a value such as `1.2K`, which can't be read
 * back, so its suffix can't be typed.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const NumberFieldFormat = Schema.Struct({
  localeMatcher: Schema.optional(Schema.Literals(["lookup", "best fit"])),
  numberingSystem: Schema.optional(Schema.String),
  style: Schema.optional(Schema.Literals(["decimal", "percent", "currency", "unit"])),
  currency: Schema.optional(Schema.String),
  currencyDisplay: Schema.optional(Schema.Literals(["code", "symbol", "narrowSymbol", "name"])),
  currencySign: Schema.optional(Schema.Literals(["standard", "accounting"])),
  unit: Schema.optional(Schema.String),
  unitDisplay: Schema.optional(Schema.Literals(["short", "long", "narrow"])),
  notation: Schema.optional(Schema.Literals(["standard", "scientific", "engineering", "compact"])),
  compactDisplay: Schema.optional(Schema.Literals(["short", "long"])),
  signDisplay: Schema.optional(Schema.Literals(["auto", "never", "always", "exceptZero", "negative"])),
  useGrouping: Schema.optional(
    Schema.Union([Schema.Boolean, Schema.Literals(["always", "auto", "min2", "true", "false"])])
  ),
  minimumIntegerDigits: Schema.optional(Schema.Number),
  minimumFractionDigits: Schema.optional(Schema.Number),
  maximumFractionDigits: Schema.optional(Schema.Number),
  minimumSignificantDigits: Schema.optional(Schema.Number),
  maximumSignificantDigits: Schema.optional(Schema.Number),
  roundingPriority: Schema.optional(Schema.Literals(["auto", "morePrecision", "lessPrecision"])),
  roundingIncrement: Schema.optional(Schema.Number),
  roundingMode: Schema.optional(
    Schema.Literals([
      "ceil",
      "floor",
      "expand",
      "trunc",
      "halfCeil",
      "halfFloor",
      "halfExpand",
      "halfTrunc",
      "halfEven"
    ])
  ),
  trailingZeroDisplay: Schema.optional(Schema.Literals(["auto", "stripIfInteger"]))
})

/**
 * How a `NumberField` writes its number.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NumberFieldFormat = typeof NumberFieldFormat.Type

const Locale = Schema.Union([Schema.String, Schema.Array(Schema.String)])

/**
 * Props for the number field's value, its range, its steps and its format.
 *
 * **Details**
 *
 * - `value`: the number, or `null` for an empty field.
 * - `min` and `max`: the range. Typed values and steps are kept within it.
 * - `step`: what an arrow key, a button, the wheel and a dragged pixel
 *   change the value by, `1` by default. `"any"` steps by `1` and lets the
 *   form submit any fraction.
 * - `smallStep`: the step while Alt is held, `0.1` by default.
 * - `largeStep`: the step while Shift is held, `10` by default.
 * - `snapOnStep`: a step lands on a multiple of the step from `min`, or
 *   from `0` without one.
 * - `allowOutOfRange`: a typed value may be outside `min` and `max`, for
 *   the form's own validation to report. Steps still stay within them.
 * - `allowWheelScrub`: the wheel over the focused input steps the value.
 * - `format`: the options of `Intl.NumberFormat`.
 * - `locale`: the locale to format and parse with, the runtime's default
 *   when left out.
 * - `disabled`: disables the input, makes the buttons unavailable, and the
 *   field emits and submits nothing.
 * - `readOnly`: the value can be read and focused, not changed.
 * - `required`: the form needs a value.
 * - `name`: the name the value is submitted under.
 * - `form`: the id of the form that submits it, when the field isn't
 *   inside one.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const NumberFieldProps = Schema.Struct({
  value: Schema.NullOr(Schema.Number),
  min: Schema.optional(Schema.Number),
  max: Schema.optional(Schema.Number),
  step: Schema.optional(Schema.Union([Schema.Number, Schema.Literal("any")])),
  smallStep: Schema.optional(Schema.Number),
  largeStep: Schema.optional(Schema.Number),
  snapOnStep: Schema.optional(Schema.Boolean),
  allowOutOfRange: Schema.optional(Schema.Boolean),
  allowWheelScrub: Schema.optional(Schema.Boolean),
  format: Schema.optional(NumberFieldFormat),
  locale: Schema.optional(Locale),
  disabled: Schema.optional(Schema.Boolean),
  readOnly: Schema.optional(Schema.Boolean),
  required: Schema.optional(Schema.Boolean),
  name: Schema.optional(Schema.String),
  form: Schema.optional(Schema.String)
})

/**
 * The props of a `NumberField`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NumberFieldProps = typeof NumberFieldProps.Type

/**
 * Why a `NumberField` asks to change its value.
 *
 * **Details**
 *
 * - `"input-change"`: the text was typed into
 * - `"input-clear"`: the text was emptied
 * - `"input-paste"`: text was pasted
 * - `"input-blur"`: the input lost focus, and the value was rounded to the
 *   format or brought within the range
 * - `"keyboard"`: an arrow key, Home or End
 * - `"increment-press"` and `"decrement-press"`: a button
 * - `"wheel"`: the wheel over the input
 * - `"scrub"`: a drag across a scrub area
 * - `"none"`: the browser filled the form value in
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const NumberFieldChangeReason = Schema.Literals([
  "input-change",
  "input-clear",
  "input-paste",
  "input-blur",
  "keyboard",
  "increment-press",
  "decrement-press",
  "wheel",
  "scrub",
  "none"
])

/**
 * Why a `NumberField` asks to change its value.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NumberFieldChangeReason = typeof NumberFieldChangeReason.Type

/**
 * What ended the change a `NumberField` commits: the input losing focus
 * with a value or without one, a key, the release of a button, a wheel
 * turn, or the release of a drag.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const NumberFieldCommitReason = Schema.Literals([
  "input-blur",
  "input-clear",
  "keyboard",
  "increment-press",
  "decrement-press",
  "wheel",
  "scrub"
])

/**
 * What ended the change a `NumberField` commits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NumberFieldCommitReason = typeof NumberFieldCommitReason.Type

const Direction = Schema.Literals([-1, 1])

type Direction = typeof Direction.Type

/**
 * What a `NumberField` asks of its parent.
 *
 * **Details**
 *
 * - `Updated`: set `value` to `value`. A step also carries its
 *   `direction`, `1` up or `-1` down.
 * - `Committed`: the user is done changing the value, and `value` is the
 *   one they left.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const NumberFieldEvents = UiSchema.TaggedEnum({
  Updated: {
    value: Schema.NullOr(Schema.Number),
    reason: NumberFieldChangeReason,
    direction: Schema.optional(Direction)
  },
  Committed: { value: Schema.NullOr(Schema.Number), reason: NumberFieldCommitReason }
})

/**
 * What a `NumberField` asks of its parent.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NumberFieldEvents = typeof NumberFieldEvents.Type

const Modifiers = { shift: Schema.Boolean, alt: Schema.Boolean }

interface Modifiers {
  readonly shift: boolean
  readonly alt: boolean
}

const Message = UiSchema.TaggedEnum({
  UpdatedInput: { value: Schema.String },
  PastedText: { value: Schema.String },
  BlurredInput: { disabled: Schema.Boolean },
  PressedKey: { key: Schema.String, ...Modifiers },
  TurnedWheel: { direction: Direction, ...Modifiers },
  DetectedIOS: {},
  PressedStepper: { direction: Direction, focus: Schema.Boolean, ...Modifiers },
  HeldStepper: { direction: Direction, ...Modifiers },
  ReleasedStepper: { direction: Direction },
  ClickedStepper: { direction: Direction, ...Modifiers },
  StartedScrub: { focus: Schema.Boolean },
  LockedPointer: {},
  UnlockedPointer: {},
  MovedScrub: { amount: Schema.Number, ...Modifiers },
  EndedScrub: { commit: Schema.Boolean },
  FocusedFormInput: {},
  Autofilled: { value: Schema.String }
})

type Message = typeof Message.Type

const Model = Schema.Struct({
  text: Schema.NullOr(Schema.String),
  pending: Schema.Boolean,
  scrubbing: Schema.Boolean,
  cursor: Schema.Boolean,
  focus: Schema.Number,
  ios: Schema.Boolean
})

type Model = typeof Model.Type

type NumberFieldUpdate = Component.Update<Model, Message, NumberFieldEvents, NumberFieldProps>

interface Settings extends Range {
  readonly value: number | null
  readonly step: number
  readonly smallStep: number
  readonly largeStep: number
  readonly allowOutOfRange: boolean
  readonly locale: string | ReadonlyArray<string> | undefined
  readonly locked: boolean
}

const settingsOf = (props: NumberFieldProps): Settings => ({
  value: props.value,
  min: props.min,
  max: props.max,
  format: props.format as Format | undefined,
  snapOnStep: props.snapOnStep === true,
  step: props.step === undefined || props.step === "any" ? 1 : props.step,
  smallStep: props.smallStep ?? 0.1,
  largeStep: props.largeStep ?? 10,
  allowOutOfRange: props.allowOutOfRange === true,
  locale: props.locale,
  locked: props.disabled === true || props.readOnly === true
})

const typingFor = (s: Settings) => typingOf(s.locale, s.format, lowest(s) < 0 || s.allowOutOfRange)

const parse = (s: Settings, text: string): number | null => parseNumber(text, s.locale, s.format)

const atBound = (s: Settings, direction: Direction): boolean =>
  s.value !== null && (direction === 1 ? s.value >= highest(s) : s.value <= lowest(s))

const reasonOf = (direction: Direction) => direction === 1 ? "increment-press" : "decrement-press"

interface Change {
  readonly model: Model
  readonly events: ReadonlyArray<NumberFieldEvents>
  readonly value: number | null
  readonly fired: boolean
}

const setValue = (
  model: Model,
  s: Settings,
  asked: number | null,
  reason: NumberFieldChangeReason,
  options: { readonly step?: number; readonly small?: boolean; readonly typed?: boolean } = {}
): Change => {
  const entered = reason.startsWith("input-") || reason === "none"
  const value = asked === null
    ? null
    : validated(asked, s, { step: options.step, small: options.small === true, clamp: !s.allowOutOfRange || !entered })
  const fired = value !== s.value || (entered && (asked !== s.value || options.typed === true))
  const direction = options.step === undefined ? undefined : options.step < 0 ? -1 : 1
  return {
    model: { ...model, pending: model.pending || fired },
    events: fired
      ? [NumberFieldEvents.Updated(direction === undefined ? { value, reason } : { value, reason, direction })]
      : [],
    value,
    fired
  }
}

const amountOf = (s: Settings, { alt, shift }: Modifiers): number => alt ? s.smallStep : shift ? s.largeStep : s.step

const stepBy = (
  model: Model,
  s: Settings,
  amount: number,
  modifiers: Modifiers,
  reason: NumberFieldChangeReason,
  from: number | null = s.value
): Change =>
  from === null
    ? setValue(model, s, 0, reason)
    : setValue(model, s, from + amount * amountOf(s, modifiers), reason, {
      step: amountOf(s, modifiers) * Math.sign(amount),
      small: modifiers.alt
    })

const typedValue = (model: Model, s: Settings): number | null => model.text === null ? null : parse(s, model.text)

const apply = ($: NumberFieldUpdate, change: Change) =>
  change.events.length === 0 ? change.model : $.set(change.model).emit(...change.events)

const commit = (
  $: NumberFieldUpdate,
  change: Pick<Change, "model" | "events" | "value">,
  reason: NumberFieldCommitReason
) =>
  $.set({ ...change.model, pending: false }).emit(
    ...change.events,
    NumberFieldEvents.Committed({ value: change.value, reason })
  )

const press = (model: Model, s: Settings, direction: Direction, modifiers: Modifiers): Change =>
  stepBy(
    { ...model, text: null },
    s,
    direction,
    modifiers,
    reasonOf(direction),
    typedValue(model, s) ?? s.value
  )

const touchLike = (pointerType: string): boolean => pointerType === "touch" || pointerType === "pen"

const focusAtEnd = (input: HTMLInputElement) => {
  const length = input.value.length
  // A focus from a script leaves the caret at the start, or selects it all.
  input.setSelectionRange(length, length)
  input.focus()
}

const TrackInput = Mount.makeStream(
  "TrackInput",
  {
    args: {
      locked: Schema.Boolean,
      wheel: Schema.Boolean,
      allowed: Schema.String,
      single: Schema.Array(Schema.String),
      locale: Schema.optional(Locale),
      format: Schema.optional(NumberFieldFormat),
      focus: Schema.Number
    }
  },
  (node: HTMLInputElement, args, changes) =>
    Stream.callback<Message>((queue) =>
      Effect.gen(function*() {
        const document = node.ownerDocument
        let current = args
        let wheel: AbortController | undefined
        if (isIOS(document.defaultView)) Queue.offerUnsafe(queue, Message.DetectedIOS())
        const onKeyDown = (event: KeyboardEvent) => {
          if (event.defaultPrevented || current.locked) return
          const stroke = {
            key: event.key,
            text: node.value,
            start: node.selectionStart,
            end: node.selectionEnd,
            // Safari doesn't set isComposing on the key that composes.
            modified: event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey
          }
          if (!allowsKey(stroke, current)) event.preventDefault()
        }
        const onPaste = (event: ClipboardEvent) => {
          if (event.defaultPrevented || current.locked) return
          let pasted: string
          try {
            pasted = allowedIn(event.clipboardData?.getData("text/plain") ?? "", current)
          } catch {
            return
          }
          event.preventDefault()
          if (pasted === "") return
          const start = node.selectionStart ?? node.value.length
          const end = node.selectionEnd ?? start
          const text = node.value.slice(0, start) + pasted + node.value.slice(end)
          if (parseNumber(text, current.locale, current.format as Format | undefined) === null) return
          node.setRangeText(pasted, start, end, "end")
          Queue.offerUnsafe(queue, Message.PastedText({ value: node.value }))
        }
        const onWheel = (event: WheelEvent) => {
          if (event.ctrlKey || document.activeElement !== node) return
          // Some browsers turn Shift with the wheel into a horizontal scroll.
          const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY)
          const delta = event.shiftKey && horizontal ? event.deltaX : event.deltaY
          if (delta === 0 || (!event.shiftKey && horizontal)) return
          event.preventDefault()
          Queue.offerUnsafe(
            queue,
            Message.TurnedWheel({ direction: delta > 0 ? -1 : 1, shift: event.shiftKey, alt: event.altKey })
          )
        }
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            node.addEventListener("keydown", onKeyDown)
            node.addEventListener("paste", onPaste)
          }),
          () =>
            Effect.sync(() => {
              node.removeEventListener("keydown", onKeyDown)
              node.removeEventListener("paste", onPaste)
              wheel?.abort()
            })
        )
        yield* Stream.runForEach(changes, (next) =>
          Effect.sync(() => {
            const focus = next.focus !== current.focus
            current = next
            const listens = next.wheel && !next.locked
            if (listens && wheel === undefined) {
              wheel = new AbortController()
              node.addEventListener("wheel", onWheel, { passive: false, signal: wheel.signal })
            } else if (!listens && wheel !== undefined) {
              wheel.abort()
              wheel = undefined
            }
            if (focus) focusAtEnd(node)
          })).pipe(Effect.forkScoped)
      })
    )
)

const TrackStepper = Mount.makeStream(
  "TrackStepper",
  { args: { direction: Direction, disabled: Schema.Boolean } },
  (node: HTMLButtonElement, args, changes) =>
    Stream.callback<Message>((queue) =>
      Effect.gen(function*() {
        const view = node.ownerDocument.defaultView
        if (view === null) return
        const { direction } = args
        let disabled = args.disabled
        let pressed = false
        let touching = false
        let ignoreClick = false
        let pointerType = ""
        let moves = 0
        let pointerId = -1
        let down = { x: 0, y: 0 }
        let modifiers: Modifiers = { shift: false, alt: false }
        let check: ReturnType<typeof setTimeout> | undefined
        let delay: ReturnType<typeof setTimeout> | undefined
        let repeat: ReturnType<typeof setInterval> | undefined
        let menu: AbortController | undefined
        let release: AbortController | undefined
        const stop = () => {
          clearTimeout(check)
          clearTimeout(delay)
          clearInterval(repeat)
          menu?.abort()
          moves = 0
        }
        const held = () => Queue.offerUnsafe(queue, Message.HeldStepper({ direction, ...modifiers }))
        const finish = (event: PointerEvent) => {
          if (event.pointerId !== pointerId) return
          release?.abort()
          release = undefined
          pressed = false
          stop()
          Queue.offerUnsafe(queue, Message.ReleasedStepper({ direction }))
        }
        const start = (first: boolean, focus: boolean) => {
          stop()
          menu = new AbortController()
          // A touch held just outside the button would open the context menu.
          view.addEventListener("contextmenu", (event) => event.preventDefault(), { signal: menu.signal })
          release?.abort()
          release = new AbortController()
          view.addEventListener("pointerup", finish, { signal: release.signal })
          if (first) Queue.offerUnsafe(queue, Message.PressedStepper({ direction, focus, ...modifiers }))
          else held()
          delay = setTimeout(() => {
            repeat = setInterval(held, 60)
          }, 400)
        }
        const onPointerDown = (event: PointerEvent) => {
          if (event.defaultPrevented || event.button !== 0 || disabled) return
          modifiers = { shift: event.shiftKey, alt: event.altKey }
          pointerType = event.pointerType
          pointerId = event.pointerId
          ignoreClick = false
          pressed = true
          down = { x: event.clientX, y: event.clientY }
          if (!touchLike(pointerType)) {
            event.preventDefault()
            start(true, true)
            return
          }
          // A touch that scrolls or pinches moves at once, and a tap is over
          // by then: the click steps for it.
          check = setTimeout(() => {
            const moved = moves
            moves = 0
            if (pressed && moved < 3) {
              start(true, false)
              ignoreClick = true
            } else {
              ignoreClick = false
              stop()
            }
          }, 50)
        }
        const onPointerUp = (event: PointerEvent) => {
          if (touchLike(event.pointerType)) pressed = false
        }
        const onPointerCancel = (event: PointerEvent) => {
          if (event.pointerId !== pointerId) return
          if (release !== undefined) return finish(event)
          pressed = false
          stop()
        }
        const onPointerMove = (event: PointerEvent) => {
          if (disabled || !touchLike(event.pointerType) || !pressed) return
          moves += 1
          if ((down.x - event.clientX) ** 2 + (down.y - event.clientY) ** 2 > 64) stop()
        }
        const onMouseEnter = (event: MouseEvent) => {
          if (event.defaultPrevented || disabled || !pressed || touching || touchLike(pointerType)) return
          start(false, false)
        }
        const onMouseOut = () => {
          if (!touching) stop()
        }
        const onClick = (event: MouseEvent) => {
          if (event.defaultPrevented || disabled) return
          // A mouse press stepped on the way down, and a held touch already did.
          if (touchLike(pointerType) ? ignoreClick : event.detail !== 0) return
          Queue.offerUnsafe(
            queue,
            Message.ClickedStepper({ direction, shift: event.shiftKey, alt: event.altKey })
          )
        }
        const onTouch = (event: TouchEvent) => {
          touching = event.type === "touchstart"
        }
        const listening = new AbortController()
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const { signal } = listening
            node.addEventListener("touchstart", onTouch, { passive: true, signal })
            node.addEventListener("touchend", onTouch, { passive: true, signal })
            node.addEventListener("touchcancel", onTouch, { passive: true, signal })
            view.addEventListener("pointercancel", onPointerCancel, { signal })
            node.addEventListener("pointerdown", onPointerDown, { signal })
            node.addEventListener("pointerup", onPointerUp, { signal })
            node.addEventListener("pointermove", onPointerMove, { signal })
            node.addEventListener("mouseenter", onMouseEnter, { signal })
            node.addEventListener("mouseleave", onMouseOut, { signal })
            node.addEventListener("mouseup", onMouseOut, { signal })
            node.addEventListener("click", onClick, { signal })
          }),
          () =>
            Effect.sync(() => {
              listening.abort()
              release?.abort()
              stop()
            })
        )
        yield* Stream.runForEach(changes, (next) =>
          Effect.sync(() => {
            disabled = next.disabled
            if (!disabled) return
            pressed = false
            touching = false
            pointerType = ""
            stop()
          })).pipe(Effect.forkScoped)
      })
    )
)

const liveScrubs = new Set<string>()
// A mount that is closing can't send, so a removed scrub area notifies the root's mount.
const scrubRoots = new Map<string, () => void>()

const TrackScrub = Mount.makeStream(
  "TrackScrub",
  {
    args: {
      vertical: Schema.Boolean,
      pixelSensitivity: Schema.Number,
      teleportDistance: Schema.optional(Schema.Number),
      locked: Schema.Boolean,
      scrubbing: Schema.Boolean,
      cursor: Schema.Boolean,
      cursorId: Schema.String
    }
  },
  (element: unknown, args, changes) =>
    Stream.callback<Message>((queue) =>
      Effect.gen(function*() {
        // A part for any element has no node type to give its mount.
        const node = element as HTMLElement
        const document = node.ownerDocument
        const view = document.defaultView
        if (view === null) return
        let current = args
        let scrubbing = false
        let moved = false
        let clicked = false
        let target: EventTarget | null = null
        let travelled = 0
        let pointerId = -1
        let asked = false
        let client = { x: 0, y: 0 }
        let pointer = { x: 0, y: 0 }
        let listening: AbortController | undefined
        let exit: ReturnType<typeof setTimeout> | undefined
        let click: ReturnType<typeof setTimeout> | undefined
        if (args.scrubbing) Queue.offerUnsafe(queue, Message.EndedScrub({ commit: false }))
        const unlock = () => {
          try {
            document.exitPointerLock()
          } catch {
            return
          }
        }
        const place = () => {
          const cursor = document.getElementById(current.cursorId)
          if (cursor === null) return
          const x = pointer.x - cursor.offsetWidth / 2
          const y = pointer.y - cursor.offsetHeight / 2
          const scale = 1 / (view.visualViewport?.scale ?? 1)
          cursor.style.transform = "translate3d(" + x + "px," + y + "px,0) scale(" + scale + ")"
        }
        const bounds = () => {
          if (current.teleportDistance !== undefined) {
            const rect = node.getBoundingClientRect()
            const half = current.teleportDistance / 2
            return {
              left: rect.left - half,
              top: rect.top - half,
              right: rect.right + half,
              bottom: rect.bottom + half
            }
          }
          const visual = view.visualViewport
          return visual == null
            ? {
              left: 0,
              top: 0,
              right: document.documentElement.clientWidth,
              bottom: document.documentElement.clientHeight
            }
            : {
              left: visual.offsetLeft,
              top: visual.offsetTop,
              right: visual.offsetLeft + visual.width,
              bottom: visual.offsetTop + visual.height
            }
        }
        const wrap = (coordinate: number, low: number, high: number): number =>
          coordinate < low ? high : coordinate > high ? low : coordinate
        const stop = (commit: boolean) => {
          scrubbing = false
          listening?.abort()
          Queue.offerUnsafe(queue, Message.EndedScrub({ commit }))
        }
        const onUp = (event: PointerEvent) => {
          if (!scrubbing || event.pointerId !== pointerId) return
          const pressedOn = moved ? null : target
          stop(true)
          const release = () => {
            unlock()
            // The click of a locked pointer goes to the element that holds
            // the lock, so one that didn't move is sent on to what it pressed.
            if (pressedOn !== null) {
              click = setTimeout(() => {
                if (!clicked) pressedOn.dispatchEvent(new view.MouseEvent("click", { bubbles: true, cancelable: true }))
              }, 0)
            }
          }
          // Firefox keeps the lock of a short click unless it is given a moment.
          if (isGecko(view)) exit = setTimeout(release, 20)
          else release()
        }
        const onCancel = (event: PointerEvent) => {
          if (!scrubbing || event.pointerId !== pointerId) return
          stop(true)
          unlock()
        }
        const onMove = (event: PointerEvent) => {
          if (!scrubbing || event.pointerId !== pointerId) return
          event.preventDefault()
          // A locked pointer reports only how far it moved. Without the lock
          // WebKit reports no movement, so the positions are compared.
          const locked = document.pointerLockElement != null
          const x = locked ? event.movementX : event.clientX - client.x
          const y = locked ? event.movementY : event.clientY - client.y
          client = { x: event.clientX, y: event.clientY }
          if (locked) {
            const rect = bounds()
            pointer = {
              x: wrap(Math.round(pointer.x + x), rect.left, rect.right),
              y: wrap(Math.round(pointer.y + y), rect.top, rect.bottom)
            }
            place()
          } else {
            pointer = client
          }
          travelled += current.vertical ? y : x
          if (Math.abs(travelled) < current.pixelSensitivity) return
          travelled = 0
          moved = true
          const amount = current.vertical ? -y : x
          if (amount !== 0) {
            Queue.offerUnsafe(queue, Message.MovedScrub({ amount, shift: event.shiftKey, alt: event.altKey }))
          }
        }
        const onDown = (event: PointerEvent) => {
          if (event.defaultPrevented || current.locked || event.button !== 0) return
          const mouse = event.pointerType === "mouse"
          if (mouse) event.preventDefault()
          scrubbing = true
          moved = false
          clicked = false
          clearTimeout(click)
          clearTimeout(exit)
          target = event.composedPath()[0] ?? event.target
          travelled = 0
          pointerId = event.pointerId
          client = { x: event.clientX, y: event.clientY }
          pointer = client
          listening?.abort()
          listening = new AbortController()
          const options = { capture: true, signal: listening.signal }
          view.addEventListener("pointerup", onUp, options)
          view.addEventListener("pointercancel", onCancel, options)
          view.addEventListener("pointermove", onMove, options)
          Queue.offerUnsafe(queue, Message.StartedScrub({ focus: mouse }))
          // WebKit shifts the page for the notice it shows with the lock.
          if (event.pointerType === "touch" || isWebKit(view)) return
          if (document.pointerLockElement != null) return Queue.offerUnsafe(queue, Message.LockedPointer())
          asked = true
          try {
            Promise.resolve(document.body.requestPointerLock()).catch(onLockError)
          } catch {
            asked = false
          }
        }
        const onLockError = () => {
          asked = false
        }
        const onLockChange = () => {
          if (document.pointerLockElement == null) {
            asked = false
            if (scrubbing) Queue.offerUnsafe(queue, Message.UnlockedPointer())
          } else if (asked) {
            if (scrubbing) Queue.offerUnsafe(queue, Message.LockedPointer())
            else unlock()
          }
        }
        const onTouchStart = (event: TouchEvent) => {
          if (!current.locked && event.touches.length === 1) event.preventDefault()
        }
        const onClick = () => {
          clicked = true
        }
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            liveScrubs.add(args.cursorId)
            node.addEventListener("pointerdown", onDown)
            node.addEventListener("touchstart", onTouchStart, { passive: false })
            node.addEventListener("click", onClick, { capture: true })
            document.addEventListener("pointerlockchange", onLockChange)
            document.addEventListener("pointerlockerror", onLockError)
          }),
          () =>
            Effect.sync(() => {
              liveScrubs.delete(args.cursorId)
              node.removeEventListener("pointerdown", onDown)
              node.removeEventListener("touchstart", onTouchStart)
              node.removeEventListener("click", onClick, { capture: true })
              document.removeEventListener("pointerlockchange", onLockChange)
              document.removeEventListener("pointerlockerror", onLockError)
              clearTimeout(exit)
              clearTimeout(click)
              listening?.abort()
              if (!scrubbing) return
              unlock()
              scrubRoots.get(args.cursorId)?.()
            })
        )
        yield* Stream.runForEach(changes, (next) =>
          Effect.sync(() => {
            current = next
            if (!scrubbing) return
            if (next.locked) {
              stop(false)
              unlock()
            } else if (next.cursor) {
              place()
              // The cursor has no size until the popover shows.
              view.requestAnimationFrame(place)
            }
          })).pipe(Effect.forkScoped)
      })
    )
)

const WatchScrub = Mount.makeStream(
  "WatchScrub",
  { args: { cursorId: Schema.String } },
  (_node: unknown, args) =>
    Stream.callback<Message>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const end = () => Queue.offerUnsafe(queue, Message.EndedScrub({ commit: false }))
          scrubRoots.set(args.cursorId, end)
          if (!liveScrubs.has(args.cursorId)) end()
        }),
        () =>
          Effect.sync(() => {
            scrubRoots.delete(args.cursorId)
          })
      )
    )
)

const cursorBox = "position:fixed;inset:0 auto auto 0;margin:0;pointer-events:none"

const defaults = <B extends Attributed<B> & { readonly attrs: Readonly<Record<string, string>> }>(
  node: B,
  attrs: Readonly<Record<string, string>>
): B =>
  Object.entries(attrs).reduce(
    (out, [name, value]) => node.attrs[name] === undefined ? out.attr(name, value) : out,
    node
  )

/**
 * A headless number field. Call it with the consumer's `h`, the `props`, and
 * a `view` closure that draws the root and, inside it, the input and the
 * parts it needs of the group, the buttons and the scrub area.
 *
 * **Details**
 *
 * The parts also return `value`, `inputValue`, `disabled`, `readOnly`,
 * `required` and `scrubbing`, for markup that depends on them.
 *
 * The field's own attributes win over the ones the consumer set on the
 * builder before the part, including the ones a state leaves absent:
 *
 * - every part: the data attributes
 * - `group`: `role`
 * - `input`: `id`, `type`, `inputmode`, `form`, `required`, `readonly`,
 *   `disabled` and `value`
 * - `decrement` and `increment`: `type`, `tabindex`, `aria-controls`,
 *   `aria-disabled`, and `disabled`, which they remove: an unavailable
 *   button stays focusable, so a press that reaches the bound isn't lost
 * - `scrubArea`: `role`
 * - `scrubAreaCursor`: `id`, `role` and `popover`
 *
 * The styles the buttons, the scrub area and the cursor need are added to
 * the consumer's `style`, after it. The input's `autocomplete`,
 * `autocorrect`, `spellcheck` and `aria-roledescription`, and a button's
 * `aria-label`, are written only when the builder has none.
 *
 * The input handles `input`, `blur` and `keydown` on a layer of its own, so
 * the consumer's handlers for them, and a `Field`'s, still run.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const NumberField = Component.define({
  name: "NumberField",
  props: NumberFieldProps,
  model: Model,
  message: Message,
  events: NumberFieldEvents,
  elements: Html
}).make({
  init: () => ({ text: null, pending: false, scrubbing: false, cursor: false, focus: 0, ios: false }),
  update: {
    UpdatedInput: (model, { value }, $) => {
      const s = settingsOf($.props)
      if (s.locked) return model
      if (value.trim() === "") {
        return apply($, setValue({ ...model, text: value }, s, null, "input-clear", { typed: true }))
      }
      if (!allowsText(value, typingFor(s))) return model
      const typed = { ...model, text: value }
      const parsed = parse(s, value)
      return parsed === null ? typed : apply($, setValue(typed, s, parsed, "input-change", { typed: true }))
    },
    PastedText: (model, { value }, $) => {
      const s = settingsOf($.props)
      const parsed = s.locked ? null : parse(s, value)
      return parsed === null
        ? model
        : apply($, setValue({ ...model, text: value }, s, parsed, "input-paste", { typed: true }))
    },
    BlurredInput: (model, { disabled }, $) => {
      const s = settingsOf($.props)
      if (disabled || s.locked) return model
      const typed = model.text !== null
      const text = model.text ?? formatNumber(s.value, s.locale, s.format)
      const synced: Model = typed ? { ...model, text: null } : model
      const empty = text.trim() === ""
      const read = empty ? null : typed ? parse(s, text) : s.value
      if (read === null && !empty) return synced
      const reason = empty ? "input-clear" : "input-blur"
      const value = read === null ? null : rounded(read, s.format)
      const change = value === s.value
        ? { model: synced, events: [], value, fired: false }
        : setValue(synced, s, value, reason)
      // The parent was asked for the typed value as it was typed. One that
      // didn't store it is asked once more, with no commit of a value it may
      // decline again.
      const declined = typed && change.fired && s.value !== setValue(synced, s, read, "input-change").value
      if (declined) return apply($, { ...change, model: { ...change.model, pending: false } })
      return typed || model.pending || change.fired ? commit($, change, reason) : apply($, change)
    },
    PressedKey: (model, { key, ...modifiers }, $) => {
      const s = settingsOf($.props)
      if (s.locked) return model
      const synced = { ...model, text: null }
      const up = key === "ArrowUp"
      const bound = key === "Home" ? s.min : key === "End" ? s.max : undefined
      if (!up && key !== "ArrowDown" && bound === undefined) return model
      const change = bound === undefined
        ? stepBy(synced, s, up ? 1 : -1, modifiers, "keyboard", typedValue(model, s) ?? s.value)
        : setValue(synced, s, bound, "keyboard")
      return change.fired ? commit($, change, "keyboard") : apply($, change)
    },
    TurnedWheel: (model, { direction, ...modifiers }, $) => {
      const s = settingsOf($.props)
      if (s.locked || $.props.allowWheelScrub !== true) return model
      const change = stepBy({ ...model, text: null }, s, direction, modifiers, "wheel")
      return change.fired ? commit($, change, "wheel") : apply($, change)
    },
    DetectedIOS: (model) => ({ ...model, ios: true }),
    PressedStepper: (model, { direction, focus, ...modifiers }, $) => {
      const s = settingsOf($.props)
      if (s.locked || atBound(s, direction)) return model
      const change = press(model, s, direction, modifiers)
      return apply($, focus ? { ...change, model: { ...change.model, focus: model.focus + 1 } } : change)
    },
    HeldStepper: (model, { direction, ...modifiers }, $) => {
      const s = settingsOf($.props)
      return s.locked || atBound(s, direction)
        ? model
        : apply($, stepBy(model, s, direction, modifiers, reasonOf(direction)))
    },
    ReleasedStepper: (model, { direction }, $) => {
      const s = settingsOf($.props)
      return s.locked
        ? model
        : commit($, { model, events: [], value: s.value }, reasonOf(direction))
    },
    ClickedStepper: (model, { direction, ...modifiers }, $) => {
      const s = settingsOf($.props)
      if (s.locked || atBound(s, direction)) return model
      const from = typedValue(model, s) ?? s.value
      const change = press(model, s, direction, modifiers)
      return change.value === from ? apply($, change) : commit($, change, reasonOf(direction))
    },
    StartedScrub: (model, { focus }, $) =>
      settingsOf($.props).locked
        ? model
        : { ...model, scrubbing: true, cursor: false, focus: focus ? model.focus + 1 : model.focus },
    LockedPointer: (model) => (model.scrubbing ? { ...model, cursor: true } : model),
    UnlockedPointer: (model) => (model.cursor ? { ...model, cursor: false } : model),
    MovedScrub: (model, { amount, ...modifiers }, $) => {
      const s = settingsOf($.props)
      return !model.scrubbing || s.locked || amount * amountOf(s, modifiers) === 0
        ? model
        : apply($, stepBy({ ...model, text: null }, s, amount, modifiers, "scrub"))
    },
    EndedScrub: (model, { commit: done }, $) => {
      if (!model.scrubbing) return model
      const s = settingsOf($.props)
      const next = { ...model, scrubbing: false, cursor: false }
      return done && !s.locked ? commit($, { model: next, events: [], value: s.value }, "scrub") : next
    },
    FocusedFormInput: (model) => ({ ...model, focus: model.focus + 1 }),
    Autofilled: (model, { value }, $) => {
      const s = settingsOf($.props)
      if (s.locked) return model
      const filled = value.trim() === "" ? Number.NaN : Number(value)
      return apply($, setValue(model, s, Number.isNaN(filled) ? null : filled, "none"))
    }
  },
  parts: (model, p) => {
    const props = p.props
    const s = settingsOf(props)
    const disabled = props.disabled === true
    const readOnly = props.readOnly === true
    const required = props.required === true
    const text = model.text ?? formatNumber(s.value, s.locale, s.format)
    const typing = typingFor(s)
    const cursorId = p.id("cursor")
    let inputId: string | undefined
    const state = <B extends Attributed<B>>(builder: B, off: boolean = disabled): B =>
      builder
        .attr("data-disabled", flag(off))
        .attr("data-readonly", flag(readOnly))
        .attr("data-required", flag(required))
        .attr("data-scrubbing", flag(model.scrubbing))
    const formInput = p.part("input", (b) => {
      const value = s.value === null ? "" : String(s.value)
      return b
        .attr("type", "number")
        .attr("name", props.name)
        .attr("form", props.form)
        .attr("min", props.min === undefined ? undefined : String(props.min))
        .attr("max", props.max === undefined ? undefined : String(props.max))
        .attr("step", String(props.step ?? 1))
        .attr("required", flag(required))
        .attr("readonly", flag(readOnly))
        .attr("aria-hidden", "true")
        .attr("tabindex", "-1")
        .attr("style", visuallyHidden)
        .attr("value", value)
        .value(value)
        .disabled(disabled)
        .on("focus", Message.FocusedFormInput())
        .on("change", ({ value }) => Message.Autofilled({ value }))
    })
    const form = View.toNode(
      formInput(new Html.VoidElement<never, never, Html.EventsOf<"input">, HTMLInputElement, "input">("input"))
    )
    const inputPart = p.part("input", (b, id: string) =>
      state(b)
        .attr("id", id)
        .attr("type", "text")
        // The numeric keypad of iOS has no minus key, and no decimal key
        // either unless it is asked for.
        .attr("inputmode", !model.ios ? "numeric" : lowest(s) >= 0 ? "decimal" : "text")
        .attr("form", props.form)
        .attr("required", flag(required))
        .attr("readonly", flag(readOnly))
        .disabled(disabled)
        .value(text)
        .onInput(({ value }) => Message.UpdatedInput({ value }))
        .onBlur((payload) => Message.BlurredInput({ disabled: payload.disabled === true }))
        .onKeyDown(
          ({ alt, composing, ctrl, key, meta, shift }) => {
            if (s.locked || composing || ctrl || meta) return undefined
            const steps = key === "ArrowUp" || key === "ArrowDown"
            const bounds = !alt && ((key === "Home" && s.min !== undefined) || (key === "End" && s.max !== undefined))
            return steps || bounds ? Message.PressedKey({ key, shift, alt }) : undefined
          },
          { preventDefault: true }
        )
        .onMount(
          TrackInput({
            locked: s.locked,
            wheel: props.allowWheelScrub === true,
            allowed: typing.allowed,
            single: typing.single,
            locale: props.locale,
            format: props.format,
            focus: model.focus
          })
        )
        .forward((node) =>
          defaults(node, {
            autocomplete: "off",
            autocorrect: "off",
            spellcheck: "false",
            "aria-roledescription": "Number field"
          })
        ))
    const stepperPart = p.part("button", (b, direction: Direction, own: boolean) => {
      const off = own || disabled || atBound(s, direction)
      return state(b, off)
        .attr("type", "button")
        .attr("tabindex", "-1")
        .attr("aria-disabled", off || readOnly ? "true" : undefined)
        .disabled(false)
        .onMount(TrackStepper({ direction, disabled: off || readOnly }))
        .forward((node) =>
          defaults(node, { "aria-label": direction === 1 ? "Increase" : "Decrease" })
            .attr("aria-controls", inputId ?? p.id("input"))
            .attr("style", withStyle(node.attrs.style, noSelect))
        )
    })
    const stepper = (direction: Direction) =>
      View.wrapPart(
        stepperPart,
        <B extends View.PartTarget<"button">>(
          { disabled: own, element }: { readonly element: B; readonly disabled?: boolean | undefined }
        ): ReturnType<B["attr"]> => stepperPart(element, direction, own === true)
      )
    const scrubPart = p.part((b, vertical: boolean, pixelSensitivity: number, teleportDistance: number | undefined) =>
      state(b)
        .attr("role", "presentation")
        .onMount(
          TrackScrub({
            vertical,
            pixelSensitivity,
            teleportDistance,
            locked: s.locked,
            scrubbing: model.scrubbing,
            cursor: model.cursor,
            cursorId
          })
        )
        .forward((node) => node.attr("style", withStyle(node.attrs.style, "touch-action:none;" + noSelect)))
    )
    const cursorPart = p.part((b) =>
      state(b)
        .attr("id", cursorId)
        .attr("role", "presentation")
        .attr("popover", "manual")
        .prop("popoverOpen", true)
        .forward((node) => node.attr("style", withStyle(node.attrs.style, cursorBox)))
    )
    return {
      value: s.value,
      inputValue: text,
      disabled,
      readOnly,
      required,
      scrubbing: model.scrubbing,
      root: p.part((b) => {
        const wired = state(b).forward((node) => node.children(form))
        return model.scrubbing ? wired.onMount(WatchScrub({ cursorId })) : wired
      }),
      group: p.part((b) => state(b).attr("role", "group")),
      input: View.wrapPart(
        inputPart,
        <B extends View.PartTarget<"input">>(element: B): ReturnType<B["attr"]> => {
          inputId = idOf(element) ?? p.id("input")
          return inputPart(element, inputId)
        }
      ),
      decrement: stepper(-1),
      increment: stepper(1),
      scrubArea: View.wrapPart(
        scrubPart,
        <B extends View.PartTarget<string>>(
          { direction, element, pixelSensitivity, teleportDistance }: {
            readonly element: B
            readonly direction?: "horizontal" | "vertical" | undefined
            readonly pixelSensitivity?: number | undefined
            readonly teleportDistance?: number | undefined
          }
        ): ReturnType<B["attr"]> =>
          scrubPart(element, direction === "vertical", pixelSensitivity ?? 2, teleportDistance)
      ),
      scrubAreaCursor: View.wrapPart(
        cursorPart,
        <B extends View.PartTarget<string>>(element: B): ReturnType<B["attr"]> | undefined => {
          const cursor = cursorPart(element)
          return model.scrubbing && model.cursor ? cursor : undefined
        }
      )
    }
  }
})
