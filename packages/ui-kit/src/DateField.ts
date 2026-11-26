/**
 * A controlled text input for a calendar date. Pass the current date as
 * `value`, a `DateTime` or `null` for an empty field, and store the
 * `DateTime.Utc | null` that `Committed` carries. Your view supplies the
 * `<input>` builder; the component formats and parses the text for a locale,
 * adds a hidden form input carrying the ISO date, and sets the state and data
 * attributes. It is a headless component, because it keeps the draft text
 * while the user types.
 *
 * **Anatomy**
 *
 * | Part    | Element                                |
 * | :------ | :------------------------------------- |
 * | `input` | `<input>`, the editable date field     |
 *
 * `input` takes the consumer's `<input>` builder and returns it, so you can
 * chain classes, attributes and handlers. When `name` is set, `input` wraps
 * the element and a hidden `<input type="hidden">` in a `<span style="display:contents">`
 * when built, so the form submits the ISO date (`YYYY-MM-DD`) without affecting
 * layout.
 *
 * The parts also return `value` (normalized `DateTime.Utc | null`),
 * `inputValue` (the text the input currently shows), `pattern` (the locale's
 * date pattern, such as `"dd/mm/yyyy"`, for a placeholder or hint),
 * `disabled`, `readOnly` and `required`.
 *
 * **Date values**
 *
 * Every date prop accepts any `DateTime` (`DateTime.Utc` or `DateTime.Zoned`)
 * and is normalized with `DateTime.removeTime` to midnight UTC. A `Zoned`
 * value gives its day in its own time zone, and a `Utc` value gives its UTC
 * day. Because a `Utc` "now" gives the UTC day, derive "today" from
 * `DateTime.nowInCurrentZone` or another zoned value. Every date emitted by
 * `Committed` or exposed on `dateField.value` is a normalized `DateTime.Utc`.
 * Formatting always uses `timeZone: "UTC"` so the printed day cannot shift.
 *
 * **Naming and validation**
 *
 * Name the input with a `<label for>`, an `aria-label`, or a `Field`: draw it
 * with `dateField.input(field.control(h.input))` and pass
 * `disabled: field.disabled`. `DateField` never writes `aria-invalid` or `id`,
 * leaving validation and labelling to `Field`.
 *
 * **Data attributes**
 *
 * On `input`, each present with an empty value or absent:
 *
 * - `data-disabled`
 * - `data-readonly`
 * - `data-required`
 *
 * A `Field`'s data attributes, such as `data-invalid` and `data-touched`, stay
 * on the input `field.control` decorates.
 *
 * **Keyboard**
 *
 * On `input`, pressing Enter parses and commits the typed text. Text that does
 * not parse commits nothing and stays in the input until edited or blurred.
 * Keys pressed while an input method is composing or with modifier keys are
 * ignored.
 *
 * **Events**
 *
 * `Committed` carries `{ date: DateTime.Utc | null }` when the user finishes
 * editing on blur or Enter and the parsed date differs from the current
 * normalized `value`. Parsing accepts the locale's numeric order (derived from
 * `Intl.DateTimeFormat#formatToParts`, with 4-digit years) and ISO
 * `YYYY-MM-DD`, rejecting calendar dates that do not exist (such as
 * `31/02/2026`). Empty or whitespace-only text commits `null`. Text that does
 * not parse commits nothing and reverts to the current value's formatted text
 * on blur.
 *
 * **Forms**
 *
 * When `name` is set, the hidden input submits the normalized date as
 * `YYYY-MM-DD` (or `""` when empty) under `name`, and the visible input has no
 * `name`. A disabled field disables both inputs and submits nothing.
 *
 * The server formats with its own default locale, which may differ from the
 * browser's. Pass `locale` when rendering on a server.
 *
 * **Example** (A labelled date field whose value lives in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { DateField, Field } from "@effect/ui-kit"
 * import { DateTime, Effect, Schema } from "effect"
 *
 * const EventMessage = UiSchema.TaggedEnum({
 *   CommittedDate: { date: Schema.NullOr(Schema.DateTimeUtc) }
 * })
 *
 * const EventForm = Html.component({
 *   name: "EventForm",
 *   model: Schema.Struct({ date: Schema.NullOr(Schema.DateTimeUtc) }),
 *   message: EventMessage
 * }).make({
 *   init: () => ({ date: DateTime.makeUnsafe({ year: 2026, month: 11, day: 26 }) }),
 *   update: {
 *     CommittedDate: ($, { date }) => $.evolve({ date })
 *   },
 *   view: (h, model) =>
 *     Field(h, {
 *       view: (field) =>
 *         DateField(h, {
 *           props: {
 *             value: model.date,
 *             locale: "en-GB",
 *             name: "date",
 *             disabled: field.disabled
 *           },
 *           onEmit: {
 *             Committed: ({ date }) => EventMessage.CommittedDate({ date })
 *           },
 *           view: (dateField) =>
 *             field.root(h.div).children(
 *               field.label(h.label).children("Date"),
 *               dateField.input(field.control(h.input.class("date"))).attr(
 *                 "placeholder",
 *                 dateField.pattern
 *               )
 *             )
 *         })
 *     })
 * })
 *
 * // The visible input shows the locale-formatted date and pattern, while the hidden input carries ISO.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(EventForm, {}))
 * const input = /<input class="date" id="([^"]+)"[^>]*>/.exec(html)
 * if (input === null || !html.includes('<label for="' + input[1] + '"')) throw new Error("the input isn't labelled")
 * if (!input[0].includes('value="26/11/2026"')) throw new Error("the input doesn't show the formatted date")
 * if (!input[0].includes('placeholder="dd/mm/yyyy"')) throw new Error("the placeholder doesn't show the pattern")
 * if (!/<input[^>]*type="hidden"[^>]*name="date"[^>]*value="2026-11-26"/.test(html)) throw new Error("no ISO form value")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Subscription from "@effect/ui/Subscription"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as DateTime from "effect/DateTime"
import * as Equal from "effect/Equal"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { defaults, flag, textInputDefaults } from "./internal/attributes.ts"
import { input as hiddenInput } from "./internal/formInputs.ts"
import {
  cached,
  type Locale as LocaleOption,
  toAsciiDigits
} from "./internal/number.ts"

const DateValue = Schema.Union([Schema.DateTimeUtc, Schema.DateTimeZoned])

const Locale = Schema.Union([Schema.String, Schema.Array(Schema.String)])

/**
 * Props for a `DateField`.
 *
 * **Details**
 *
 * - `value`: the date, any `DateTime` (normalized to midnight UTC in its own
 *   time zone with `DateTime.removeTime`), or `null` for an empty field.
 * - `locale`: the locale used to format, parse and derive `pattern`; the
 *   runtime's default when left out.
 * - `name`: the form field name for the hidden input carrying the ISO date.
 * - `form`: the id of the form that submits it, when the field is not inside
 *   one.
 * - `disabled`: disables the input and hidden input; suppresses all
 *   interaction and commits nothing.
 * - `readOnly`: keeps the input focusable and selectable, sets `readonly`, and
 *   commits nothing.
 * - `required`: sets the native `required` attribute and `data-required`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DateFieldProps = Schema.Struct({
  value: Schema.NullOr(DateValue),
  locale: Schema.optional(Locale),
  name: Schema.optional(Schema.String),
  form: Schema.optional(Schema.String),
  disabled: Schema.optional(Schema.Boolean),
  readOnly: Schema.optional(Schema.Boolean),
  required: Schema.optional(Schema.Boolean)
})

/**
 * The props of a `DateField`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DateFieldProps = typeof DateFieldProps.Type

/**
 * What a `DateField` emits.
 *
 * **Details**
 *
 * - `Committed`: asks for `value` to be `date`, a normalized `DateTime.Utc` at
 *   midnight UTC, or `null` when the field was cleared.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DateFieldEvents = UiSchema.TaggedEnum({
  Committed: {
    date: Schema.NullOr(Schema.DateTimeUtc)
  }
})

/**
 * What a `DateField` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DateFieldEvents = typeof DateFieldEvents.Type

const DateFieldModel = Schema.Struct({
  draft: Schema.NullOr(Schema.String)
})

type DateFieldModel = typeof DateFieldModel.Type

const DateFieldMessage = UiSchema.TaggedEnum({
  UpdatedInput: { value: Schema.String },
  BlurredInput: { disabled: Schema.Boolean },
  PressedEnter: {}
})

type DateFieldMessage = typeof DateFieldMessage.Type

type DateFieldUpdate = Component.Update<
  DateFieldModel,
  DateFieldMessage,
  DateFieldEvents,
  DateFieldProps
>

type DatePart = "year" | "month" | "day"

interface LocaleInfo {
  readonly formatter: Intl.DateTimeFormat
  readonly order: ReadonlyArray<DatePart>
  readonly pattern: string
}

const formatControls = /\p{Cf}/gu
const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/
const numericDate = /^(\d{1,4})\s*([/.-])\s*(\d{1,4})\s*\2\s*(\d{1,4})(\.)?$/
const sampleDate = new Date(Date.UTC(2026, 10, 26))
const patternOf = { year: "yyyy", month: "mm", day: "dd" }

const locales = new Map<string, LocaleInfo>()

const localeOf = (locale: LocaleOption): LocaleInfo =>
  cached(locales, locale, () => {
    const formatter = new Intl.DateTimeFormat(
      locale as string | Array<string> | undefined,
      {
        calendar: "gregory",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "UTC"
      }
    )
    const order: Array<DatePart> = []
    let pattern = ""
    for (const { type, value } of formatter.formatToParts(sampleDate)) {
      if (type === "year" || type === "month" || type === "day") {
        order.push(type)
        pattern += patternOf[type]
      } else if (type === "literal") {
        pattern += value.replace(formatControls, "")
      }
    }
    return { formatter, order, pattern }
  })

const normalize = (value: DateTime.DateTime | null): DateTime.Utc | null =>
  value === null ? null : DateTime.removeTime(value)

const formatDate = (
  value: DateTime.Utc | null,
  locale: LocaleOption
): string =>
  value === null ? "" : DateTime.formatIntl(value, localeOf(locale).formatter)

// `DateTime.make` rolls an out-of-range month or day over, so a date that
// doesn't read back as the same parts doesn't exist.
const makeDate = (
  year: number,
  month: number,
  day: number
): DateTime.Utc | null => {
  const date = DateTime.make({ year, month, day })
  if (Option.isNone(date)) return null
  const parts = DateTime.toPartsUtc(date.value)
  return parts.year === year && parts.month === month && parts.day === day
    ? date.value
    : null
}

const parseDate = (
  text: string,
  locale: LocaleOption
): DateTime.Utc | null => {
  const iso = isoDate.exec(text)
  if (iso !== null) {
    return makeDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  }
  const match = numericDate.exec(text)
  if (match === null || (match[5] !== undefined && match[2] !== ".")) {
    return null
  }
  const tokens = [match[1]!, match[3]!, match[4]!]
  const by = {} as Record<DatePart, string>
  localeOf(locale).order.forEach((part, i) => {
    by[part] = tokens[i]!
  })
  return by.year.length !== 4 || by.month.length > 2 || by.day.length > 2
    ? null
    : makeDate(Number(by.year), Number(by.month), Number(by.day))
}

const isLocked = (props: DateFieldProps): boolean =>
  props.disabled === true || props.readOnly === true

const idle: DateFieldModel = { draft: null }

const commit = ($: DateFieldUpdate, keepOnInvalid: boolean) => {
  if ($.model.draft === null) return $.model
  const locale = $.props.locale
  const text = toAsciiDigits($.model.draft.replace(formatControls, ""), locale)
    .trim()
  const date = text === "" ? null : parseDate(text, locale)
  if (date === null && text !== "") return keepOnInvalid ? $.model : idle
  return Equal.equals(date, normalize($.props.value))
    ? idle
    : $.set(idle).emit(DateFieldEvents.Committed({ date }))
}

// A browser may send no blur event when disabling a focused input, so clear
// any in-progress draft when disabled becomes true.
const lostFocus = Subscription.make(
  "lostFocus",
  Stream.make(DateFieldMessage.BlurredInput({ disabled: true }))
)

/**
 * A headless date field. Call it with the consumer's `h`, the `props`, and a
 * `view` closure that draws the input with `dateField.input(h.input)`.
 *
 * **Details**
 *
 * The parts also return `value`, `inputValue`, `pattern`, `disabled`,
 * `readOnly` and `required`.
 *
 * The field's own attributes win over the ones the consumer set on the builder
 * before the part, including the ones a state leaves absent:
 *
 * - `input`: `type`, `name` (removed from the visible input so the hidden
 *   input submits the ISO date), `form`, `required`, `readonly`, `disabled`,
 *   `aria-disabled` (removed), `data-disabled`, `data-readonly`,
 *   `data-required` and `value`.
 *
 * `autocomplete`, `autocorrect` and `spellcheck` are written only when the
 * builder has none. `aria-invalid` and `id` are never written, so `Field`
 * keeps full ownership of them.
 *
 * The input handles `input`, `blur` and `keydown` on a layer of its
 * own, so the consumer's handlers for them, and a `Field`'s, still run.
 *
 * History restore saves nothing of it: after Back, forward or a reload it
 * starts from `init`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const DateField = Html.component({
  name: "DateField",
  props: DateFieldProps,
  model: DateFieldModel,
  message: DateFieldMessage,
  events: DateFieldEvents,
  restore: false
}).make({
  init: () => idle,
  update: {
    UpdatedInput: ($, { value }) =>
      isLocked($.props) ? $.model : { draft: value },
    BlurredInput: ($, { disabled }) =>
      disabled || isLocked($.props) ? idle : commit($, false),
    PressedEnter: ($) => isLocked($.props) ? $.model : commit($, true)
  },
  subscriptions: ({ model, props }) => [
    model.draft !== null && props.disabled === true && lostFocus
  ],
  parts: (p, model) => {
    const props = p.props
    const disabled = props.disabled === true
    const readOnly = props.readOnly === true
    const required = props.required === true
    const locked = disabled || readOnly
    const value = normalize(props.value)
    const { pattern } = localeOf(props.locale)
    const inputValue = model.draft !== null && !disabled
      ? model.draft
      : formatDate(value, props.locale)
    const isoValue = value === null ? "" : DateTime.formatIsoDateUtc(value)
    const hidden = props.name === undefined ? undefined : View.toNode(
      hiddenInput()
        .attrs({
          type: "hidden",
          name: props.name,
          form: props.form,
          value: isoValue
        })
        .value(isoValue)
        .disabled(disabled)
    )
    return {
      value,
      inputValue,
      pattern,
      disabled,
      readOnly,
      required,
      input: p.part("input", (b) =>
        b
          .attrs({
            type: "text",
            name: undefined,
            form: props.form,
            required: flag(required),
            readonly: flag(readOnly),
            "aria-disabled": undefined,
            "data-disabled": flag(disabled),
            "data-readonly": flag(readOnly),
            "data-required": flag(required)
          })
          .disabled(disabled)
          .value(inputValue)
          .on("input", ({ value }) => DateFieldMessage.UpdatedInput({ value }))
          .on("blur", (payload) =>
            DateFieldMessage.BlurredInput({
              disabled: payload.disabled === true
            }))
          .on("keydown", ({ alt, composing, ctrl, key, meta, shift }) =>
            !locked && !composing && !alt && !ctrl && !meta && !shift &&
              key === "Enter"
              ? DateFieldMessage.PressedEnter()
              : undefined)
          .forward((node) => {
            const decorated = defaults(node, textInputDefaults)
            return hidden === undefined
              ? decorated
              : new Html.Element<DateFieldMessage>("span")
                .attr("style", "display:contents")
                .children(decorated, hidden)
          }))
    }
  }
})
