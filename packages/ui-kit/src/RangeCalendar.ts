/**
 * A controlled single-month calendar grid for picking a range of dates. Pass
 * the selected range as `value`, the visible month as `month` and the
 * current day as `today`. Handle `Picked` to update `value` and
 * `RequestedMonth` to update `month`. A headless component built on
 * `Calendar`: it has the same parts, keyboard and focus handling, and adds
 * range selection.
 *
 * **Anatomy**
 *
 * | Part       | Element    |
 * | :--------- | :--------- |
 * | `root`     | any element, around the header and the grid |
 * | `heading`  | any element, showing `rangeCalendar.title` |
 * | `previous` | `<button>` |
 * | `next`     | `<button>` |
 * | `grid`     | `<table>` |
 * | `weekday`  | `<th>` inside the grid header |
 * | `cell`     | `<td>` inside the grid body |
 * | `day`      | `<button>` inside each `cell` |
 *
 * The parts take the same arguments as `Calendar`'s, and no part adds
 * markup. The parts object also carries `weeks`, `weekdays`, `month` and
 * `title`, as `Calendar`'s does, and `anchor`: the first day of a range in
 * progress, or `null`.
 *
 * Inside a `Field`, apply `field.group` to `root`, `field.member` to each
 * `day`, and pass `disabled: field.disabled`.
 *
 * **Selection**
 *
 * The first press on a day sets the anchor and emits nothing. Until the
 * second press, the days between the anchor and the day last hovered or
 * focused show as a preview. The second press emits `Picked` with the two
 * days in order and clears the anchor. Pressing the anchor again picks that
 * one day. An unavailable day can't be an anchor or an end, but a range may
 * span unavailable days: validate that in the consumer. Dates follow
 * `Calendar`'s rules: every date is normalized with `DateTime.removeTime`.
 *
 * **Data attributes**
 *
 * Those of `Calendar`, each present with an empty value or absent, with
 * these on `day`:
 *
 * - `data-selected`: the day is in the selected range
 * - `data-range-start`, `data-range-end`: the day is the first or last day
 *   of the range shown
 * - `data-in-range`: the day is in the range shown, its ends included
 *
 * The range shown is the preview while an anchor is set, and the selected
 * range otherwise.
 *
 * **Keyboard**
 *
 * As `Calendar`, plus Escape on a day, which clears the anchor. Escape
 * keeps its default when no anchor is set.
 *
 * **Usage**
 *
 * A range field is two `DateField`s and a `RangeCalendar` in a `Popover`:
 * a typed commit updates one end of the range, and `Picked` updates both.
 *
 * **Example** (A controlled range calendar whose range and month live in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { RangeCalendar } from "@effect/ui-kit"
 * import { DateTime, Effect, Schema } from "effect"
 *
 * const StayMessage = UiSchema.TaggedEnum({
 *   PickedStay: { start: Schema.DateTimeUtc, end: Schema.DateTimeUtc },
 *   RequestedMonth: { month: Schema.DateTimeUtc }
 * })
 *
 * const Stay = Html.component({
 *   name: "Stay",
 *   model: Schema.Struct({
 *     stay: Schema.NullOr(
 *       Schema.Struct({ start: Schema.DateTimeUtc, end: Schema.DateTimeUtc })
 *     ),
 *     month: Schema.DateTimeUtc
 *   }),
 *   message: StayMessage
 * }).make({
 *   init: () => ({
 *     stay: {
 *       start: DateTime.makeUnsafe("2026-11-12T00:00:00Z"),
 *       end: DateTime.makeUnsafe("2026-11-15T00:00:00Z")
 *     },
 *     month: DateTime.makeUnsafe("2026-11-01T00:00:00Z")
 *   }),
 *   update: {
 *     PickedStay: ($, stay) => $.evolve({ stay: { start: stay.start, end: stay.end } }),
 *     RequestedMonth: ($, { month }) => $.evolve({ month })
 *   },
 *   view: (h, model) =>
 *     RangeCalendar(h, {
 *       props: {
 *         value: model.stay,
 *         month: model.month,
 *         today: DateTime.makeUnsafe("2026-11-26T00:00:00Z"),
 *         locale: "en-US"
 *       },
 *       onEmit: {
 *         Picked: ({ end, start }) => StayMessage.PickedStay({ start, end }),
 *         RequestedMonth: ({ month }) => StayMessage.RequestedMonth({ month })
 *       },
 *       view: (rangeCalendar) =>
 *         rangeCalendar.root(h.div).children(
 *           rangeCalendar.heading(h.h2).children(rangeCalendar.title),
 *           rangeCalendar.grid(h.table).children(
 *             h.tbody(
 *               ...rangeCalendar.weeks.map((week) =>
 *                 h.tr(
 *                   ...week.map((date) =>
 *                     rangeCalendar.cell({ element: h.td, date }).children(
 *                       rangeCalendar.day({ element: h.button, date }).children(
 *                         String(DateTime.getPartUtc(date, "day"))
 *                       )
 *                     )
 *                   )
 *                 )
 *               )
 *             )
 *           )
 *         )
 *     })
 * })
 *
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Stay, {}))
 * const selected = html.match(/aria-selected="true"/g) ?? []
 * if (selected.length !== 4) throw new Error("the stay isn't four selected days")
 * if (!/November 12, 2026"[^>]* data-range-start/.test(html)) throw new Error("the stay doesn't start on the 12th")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { Calendar } from "./Calendar.ts"
import { flag, type Keyed } from "./internal/attributes.ts"
import {
  CalendarDate,
  CalendarGridPropsFields,
  isOutOfRange,
  sameDay
} from "./internal/calendar.ts"

/**
 * Props for a `RangeCalendar`.
 *
 * **Details**
 *
 * - `value`: the selected range, or `null` for none. Both ends are
 *   normalized with `DateTime.removeTime`, and a `start` after `end` is
 *   read in order.
 * - The rest are `Calendar`'s: `month`, `today`, `min`, `max`,
 *   `firstDayOfWeek`, `locale`, `disabled` and `readOnly`. A disabled or
 *   read-only range calendar sets no anchor and shows no preview.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const RangeCalendarProps = Schema.Struct({
  value: Schema.NullOr(
    Schema.Struct({ start: CalendarDate, end: CalendarDate })
  ),
  ...CalendarGridPropsFields
})

/**
 * The props of a `RangeCalendar`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type RangeCalendarProps = typeof RangeCalendarProps.Type

/**
 * Events emitted by `RangeCalendar`.
 *
 * **Details**
 *
 * - `Picked`: emitted on the second press of a range, on an enabled,
 *   available day while not `readOnly`. Carries the normalized
 *   midnight-UTC `start` and `end`, in order.
 * - `RequestedMonth`: as `Calendar`'s.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const RangeCalendarEvents = UiSchema.TaggedEnum({
  Picked: { start: Schema.DateTimeUtc, end: Schema.DateTimeUtc },
  RequestedMonth: { month: Schema.DateTimeUtc }
})

/**
 * What a `RangeCalendar` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type RangeCalendarEvents = typeof RangeCalendarEvents.Type

const RangeCalendarModel = Schema.Struct({
  anchor: Schema.NullOr(Schema.DateTimeUtc),
  // The day the preview runs to: the last one hovered or focused.
  target: Schema.NullOr(Schema.DateTimeUtc)
})

type RangeCalendarModel = typeof RangeCalendarModel.Type

const RangeCalendarMessage = UiSchema.TaggedEnum({
  PickedDay: { date: Schema.DateTimeUtc },
  RequestedMonth: { month: Schema.DateTimeUtc },
  EnteredDay: { date: Schema.DateTimeUtc },
  FocusedDay: { date: Schema.DateTimeUtc },
  PressedEscape: {}
})

type RangeCalendarMessage = typeof RangeCalendarMessage.Type

type RangeCalendarUpdate = Component.Update<
  RangeCalendarModel,
  RangeCalendarMessage,
  RangeCalendarEvents,
  RangeCalendarProps
>

interface Range {
  readonly start: DateTime.Utc
  readonly end: DateTime.Utc
}

const rangeOf = (a: DateTime.DateTime, b: DateTime.DateTime): Range => {
  const x = DateTime.removeTime(a)
  const y = DateTime.removeTime(b)
  return { start: DateTime.min(x, y), end: DateTime.max(x, y) }
}

const inRange = (date: DateTime.Utc, range: Range | null): boolean =>
  range !== null && !isOutOfRange(date, range.start, range.end)

const point = (
  $: RangeCalendarUpdate,
  { date }: { readonly date: DateTime.Utc }
) => $.evolve({ target: date })

/**
 * A headless range calendar grid. Call it with the consumer's `h`, the
 * `props`, `onEmit`, and a `view` closure that draws the same parts as
 * `Calendar`.
 *
 * **Details**
 *
 * The parts write what `Calendar`'s do, and these over the values the
 * consumer set on the builder before applying the part:
 *
 * - `cell`: `aria-selected`, `"true"` for every day in the selected range
 * - `day`: `data-selected`, `data-range-start`, `data-range-end` and
 *   `data-in-range`
 *
 * History restore saves nothing of the range in progress: after Back,
 * forward or a reload it starts from `init`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const RangeCalendar = Html.component({
  name: "RangeCalendar",
  props: RangeCalendarProps,
  model: RangeCalendarModel,
  message: RangeCalendarMessage,
  events: RangeCalendarEvents,
  restore: false
}).make({
  init: () => ({ anchor: null, target: null }),
  update: {
    PickedDay: ($, { date }) =>
      $.model.anchor === null
        ? $.evolve({ anchor: date, target: date })
        : $.evolve({ anchor: null }).emit(
          RangeCalendarEvents.Picked(rangeOf($.model.anchor, date))
        ),
    RequestedMonth: ($, { month }) =>
      $.emit(RangeCalendarEvents.RequestedMonth({ month })),
    EnteredDay: point,
    FocusedDay: point,
    PressedEscape: ($) =>
      $.model.anchor === null ? $.model : $.evolve({ anchor: null })
  },
  parts: (p, model) => {
    const { value, ...props } = p.props
    const selected = value === null ? null : rangeOf(value.start, value.end)
    const anchor = props.disabled === true || props.readOnly === true
      ? null
      : model.anchor
    const shown = anchor === null
      ? selected
      : rangeOf(anchor, model.target ?? anchor)

    const cellPart = p.part(
      "td",
      (b, date: DateTime.Utc) =>
        b.attr("aria-selected", String(inRange(date, selected)))
    )

    const dayPart = p.part("button", (b, date: DateTime.Utc) =>
      b
        .attrs({
          "data-selected": flag(inRange(date, selected)),
          "data-range-start": flag(
            shown !== null && sameDay(date, shown.start)
          ),
          "data-range-end": flag(shown !== null && sameDay(date, shown.end)),
          "data-in-range": flag(inRange(date, shown))
        })
        .on("mouseenter", RangeCalendarMessage.EnteredDay({ date }))
        .on("focus", RangeCalendarMessage.FocusedDay({ date }))
        .on(
          "keydown",
          ({ key }) =>
            key === "Escape" && anchor !== null
              ? RangeCalendarMessage.PressedEscape()
              : undefined,
          { preventDefault: true }
        ))

    return p.child(Calendar, {
      props: { ...props, value: anchor ?? selected?.start ?? null },
      onEmit: {
        Picked: ({ date }) => RangeCalendarMessage.PickedDay({ date }),
        RequestedMonth: ({ month }) =>
          RangeCalendarMessage.RequestedMonth({ month })
      },
      parts: (calendar) => ({
        ...calendar,
        anchor,
        cell: View.wrapPart(
          cellPart,
          <B extends Keyed<"td">>(
            { date, element }: {
              readonly element: B
              readonly date: DateTime.DateTime
            }
          ): ReturnType<B["attr"]> =>
            cellPart(
              calendar.cell({ element, date }),
              DateTime.removeTime(date)
            )
        ),
        day: View.wrapPart(
          dayPart,
          <B extends Keyed<"button">>(
            { date, element, unavailable }: {
              readonly element: B
              readonly date: DateTime.DateTime
              readonly unavailable?: boolean | undefined
            }
          ): ReturnType<B["attr"]> =>
            dayPart(
              calendar.day({ element, date, unavailable }),
              DateTime.removeTime(date)
            )
        )
      })
    })
  }
})
