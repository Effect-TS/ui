import * as Command from "@effect/ui/Command"
import * as Html from "@effect/ui/html/Html"
import * as HtmlCommand from "@effect/ui/html/HtmlCommand"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { type Attributed, flag } from "./attributes.ts"
import { cached, type Locale } from "./number.ts"

export const CalendarDate = Schema.Union([
  Schema.DateTimeUtc,
  Schema.DateTimeZoned
])

export const CalendarLocale = Schema.Union([
  Schema.String,
  Schema.Array(Schema.String)
])

export const CalendarWeekdayNumber = Schema.Literals([0, 1, 2, 3, 4, 5, 6])

export type CalendarWeekdayNumber = typeof CalendarWeekdayNumber.Type

export interface CalendarWeekdayName {
  readonly short: string
  readonly long: string
}

export const CalendarGridKey = Schema.Literals([
  "previousDay",
  "nextDay",
  "previousWeek",
  "nextWeek",
  "startOfWeek",
  "endOfWeek",
  "previousMonth",
  "nextMonth",
  "previousYear",
  "nextYear"
])

export type CalendarGridKey = typeof CalendarGridKey.Type

export const CalendarGridPropsFields = {
  month: CalendarDate,
  today: CalendarDate,
  min: Schema.optional(CalendarDate),
  max: Schema.optional(CalendarDate),
  firstDayOfWeek: Schema.optional(CalendarWeekdayNumber),
  locale: Schema.optional(CalendarLocale),
  disabled: Schema.optional(Schema.Boolean),
  readOnly: Schema.optional(Schema.Boolean)
} as const

export const CalendarGridModelFields = {
  focusedDay: Schema.NullOr(Schema.DateTimeUtc),
  focused: Schema.Boolean,
  shownMonth: Schema.DateTimeUtc,
  pendingFocus: Schema.NullOr(Schema.DateTimeUtc),
  // The root's CSS `direction` is right-to-left.
  rtl: Schema.Boolean
} as const

export const CalendarGridModel = Schema.Struct(CalendarGridModelFields)

export type CalendarGridModel = typeof CalendarGridModel.Type

export type CalendarGridPhase =
  & Pick<CalendarGridModel, "focusedDay" | "focused" | "pendingFocus">
  & { readonly shouldFocus: boolean }

export interface CalendarDayState {
  readonly selected: boolean
  readonly today: boolean
  readonly outsideMonth: boolean
  readonly unavailable: boolean
  readonly disabled: boolean
  readonly focused: boolean
  readonly tabStop: boolean
}

export const CalendarDayRef = Html.ref("CalendarDay", "button")

export const normalizeOptional = (
  date: DateTime.DateTime | null | undefined
): DateTime.Utc | null => date == null ? null : DateTime.removeTime(date)

export const startOfMonth = (date: DateTime.Utc): DateTime.Utc =>
  DateTime.startOf(date, "month")

export const endOfMonth = (date: DateTime.Utc): DateTime.Utc =>
  DateTime.removeTime(DateTime.endOf(date, "month"))

export const dateKey = (date: DateTime.Utc): string =>
  DateTime.formatIsoDateUtc(date)

export const sameDay = (a: DateTime.Utc, b: DateTime.Utc): boolean =>
  DateTime.Equivalence(a, b)

export const sameMonth = (a: DateTime.Utc, b: DateTime.Utc): boolean =>
  DateTime.getPartUtc(a, "year") === DateTime.getPartUtc(b, "year") &&
  DateTime.getPartUtc(a, "month") === DateTime.getPartUtc(b, "month")

export const isOutOfRange = (
  date: DateTime.Utc,
  min: DateTime.Utc | null,
  max: DateTime.Utc | null
): boolean =>
  (min !== null && DateTime.isLessThan(date, min)) ||
  (max !== null && DateTime.isGreaterThan(date, max))

export const clampDate = (
  date: DateTime.Utc,
  min: DateTime.Utc | null,
  max: DateTime.Utc | null
): DateTime.Utc => {
  const lower = min === null ? date : DateTime.max(date, min)
  return max === null ? lower : DateTime.min(lower, max)
}

// Whether the month `months` (-1 or 1) away from `monthStart` has a day in
// range.
export const canStepMonth = (
  monthStart: DateTime.Utc,
  months: -1 | 1,
  min: DateTime.Utc | null,
  max: DateTime.Utc | null
): boolean =>
  months < 0
    ? min === null || DateTime.isGreaterThan(monthStart, min)
    : max === null || DateTime.isLessThan(endOfMonth(monthStart), max)

export const focusDay = (date: DateTime.Utc) =>
  HtmlCommand.Focus.make({ ref: CalendarDayRef.at(dateKey(date)) }).pipe(
    Command.asNoop
  )

interface LocaleWithWeekInfo extends Intl.Locale {
  readonly getWeekInfo?: (() => { readonly firstDay: number }) | undefined
  readonly weekInfo?: { readonly firstDay: number } | undefined
}

const formatters = new Map<string, Intl.DateTimeFormat>()

const formatterOf = (
  locale: Locale,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat =>
  cached(
    formatters,
    { locale, options },
    () =>
      new Intl.DateTimeFormat(
        locale as string | Array<string> | undefined,
        // The grid is Gregorian, so labels must be too, whatever the locale's
        // default calendar.
        { ...options, calendar: "gregory", timeZone: "UTC" }
      )
  )

const weekStarts = new Map<string, CalendarWeekdayNumber>()

export const firstDayOfWeek = (locale: Locale): CalendarWeekdayNumber =>
  cached(weekStarts, { locale }, () => {
    try {
      // `supportedLocalesOf` keeps a `-u-fw-` override that a resolved locale
      // drops.
      const loc = new Intl.Locale(
        Intl.DateTimeFormat.supportedLocalesOf(
          locale as string | Array<string> | undefined
        )[0] ?? formatterOf(locale, {}).resolvedOptions().locale
      ) as LocaleWithWeekInfo
      const info = typeof loc.getWeekInfo === "function"
        ? loc.getWeekInfo()
        : loc.weekInfo
      const firstDay = info?.firstDay
      if (typeof firstDay === "number" && firstDay >= 1 && firstDay <= 7) {
        return (firstDay % 7) as CalendarWeekdayNumber
      }
    } catch {
      // Fall back to Monday when Intl.Locale week info is unavailable.
    }
    return 1
  })

export const weeksOfMonth = (
  monthStart: DateTime.Utc,
  weekStartsOn: CalendarWeekdayNumber
): ReadonlyArray<ReadonlyArray<DateTime.Utc>> => {
  const first = DateTime.startOf(monthStart, "week", { weekStartsOn })
  const last = DateTime.removeTime(
    DateTime.endOf(endOfMonth(monthStart), "week", { weekStartsOn })
  )
  const weeks: Array<Array<DateTime.Utc>> = []
  let day = first
  while (DateTime.isLessThanOrEqualTo(day, last)) {
    const week: Array<DateTime.Utc> = []
    for (let i = 0; i < 7; i++) {
      week.push(day)
      day = DateTime.add(day, { days: 1 })
    }
    weeks.push(week)
  }
  return weeks
}

// 2023-01-01 is a Sunday in UTC (weekDay === 0).
const referenceSunday = DateTime.makeUnsafe("2023-01-01T00:00:00Z")

export const weekdayNames = (
  locale: Locale,
  weekStartsOn: CalendarWeekdayNumber
): ReadonlyArray<CalendarWeekdayName> => {
  const shortFmt = formatterOf(locale, { weekday: "short" })
  const longFmt = formatterOf(locale, { weekday: "long" })
  const names: Array<CalendarWeekdayName> = []
  for (let i = 0; i < 7; i++) {
    const day = DateTime.add(referenceSunday, { days: (weekStartsOn + i) % 7 })
    names.push({
      short: DateTime.formatIntl(day, shortFmt),
      long: DateTime.formatIntl(day, longFmt)
    })
  }
  return names
}

export const formatMonthTitle = (
  monthStart: DateTime.Utc,
  locale: Locale
): string =>
  DateTime.formatIntl(
    monthStart,
    formatterOf(locale, { month: "long", year: "numeric" })
  )

export const fullDateFormatter = (locale: Locale): Intl.DateTimeFormat =>
  formatterOf(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  })

export const gridKeyOf = (
  key: string,
  shift: boolean,
  rtl: boolean
): CalendarGridKey | undefined => {
  if (key === "PageUp") return shift ? "previousYear" : "previousMonth"
  if (key === "PageDown") return shift ? "nextYear" : "nextMonth"
  if (shift) return undefined
  if (key === "ArrowLeft") return rtl ? "nextDay" : "previousDay"
  if (key === "ArrowRight") return rtl ? "previousDay" : "nextDay"
  if (key === "ArrowUp") return "previousWeek"
  if (key === "ArrowDown") return "nextWeek"
  if (key === "Home") return "startOfWeek"
  if (key === "End") return "endOfWeek"
  return undefined
}

export const moveDate = (
  date: DateTime.Utc,
  move: CalendarGridKey,
  weekStartsOn: CalendarWeekdayNumber,
  min: DateTime.Utc | null,
  max: DateTime.Utc | null
): DateTime.Utc => {
  let raw: DateTime.Utc
  switch (move) {
    case "previousDay":
      raw = DateTime.subtract(date, { days: 1 })
      break
    case "nextDay":
      raw = DateTime.add(date, { days: 1 })
      break
    case "previousWeek":
      raw = DateTime.subtract(date, { weeks: 1 })
      break
    case "nextWeek":
      raw = DateTime.add(date, { weeks: 1 })
      break
    case "startOfWeek":
      raw = DateTime.startOf(date, "week", { weekStartsOn })
      break
    case "endOfWeek":
      raw = DateTime.removeTime(DateTime.endOf(date, "week", { weekStartsOn }))
      break
    case "previousMonth":
      raw = DateTime.subtract(date, { months: 1 })
      break
    case "nextMonth":
      raw = DateTime.add(date, { months: 1 })
      break
    case "previousYear":
      raw = DateTime.subtract(date, { years: 1 })
      break
    case "nextYear":
      raw = DateTime.add(date, { years: 1 })
      break
  }
  const clamped = clampDate(raw, min, max)
  // An empty range (`min` after `max`) has no day to move to.
  return isOutOfRange(clamped, min, max) ? date : clamped
}

export interface FocusContext {
  readonly monthStart: DateTime.Utc
  readonly preferred: DateTime.Utc | null
  readonly today: DateTime.Utc
  readonly min: DateTime.Utc | null
  readonly max: DateTime.Utc | null
}

const withDayInMonth = (
  monthStart: DateTime.Utc,
  dayNumber: number
): DateTime.Utc => {
  const maxDay = DateTime.getPartUtc(endOfMonth(monthStart), "day")
  return DateTime.setPartsUtc(monthStart, { day: Math.min(dayNumber, maxDay) })
}

// `date` when it is in the shown month and in range, else `null`.
const shown = (
  context: FocusContext,
  date: DateTime.Utc | null
): DateTime.Utc | null =>
  date !== null &&
    sameMonth(date, context.monthStart) &&
    !isOutOfRange(date, context.min, context.max)
    ? date
    : null

const clampedShown = (
  context: FocusContext,
  date: DateTime.Utc
): DateTime.Utc | null =>
  shown(context, clampDate(date, context.min, context.max))

export const focusInMonth = (
  context: FocusContext,
  previousFocusedDay: DateTime.Utc | null
): DateTime.Utc | null =>
  shown(context, context.preferred) ??
    (previousFocusedDay === null ? null : clampedShown(
      context,
      withDayInMonth(
        context.monthStart,
        DateTime.getPartUtc(previousFocusedDay, "day")
      )
    )) ??
    shown(context, context.today) ??
    clampedShown(context, context.monthStart)

export const syncMonthPhase = (
  model: CalendarGridModel,
  context: FocusContext
): CalendarGridPhase => {
  if (sameMonth(model.shownMonth, context.monthStart)) {
    return {
      focusedDay: model.focusedDay,
      focused: model.focused,
      pendingFocus: model.pendingFocus,
      shouldFocus: false
    }
  }
  if (
    model.pendingFocus !== null &&
    sameMonth(model.pendingFocus, context.monthStart)
  ) {
    const target = clampedShown(context, model.pendingFocus) ??
      focusInMonth(context, model.focusedDay)
    return {
      focusedDay: target,
      focused: model.focused && target !== null,
      pendingFocus: null,
      shouldFocus: target !== null
    }
  }
  const focusedDay = model.focusedDay === null
    ? null
    : focusInMonth(context, model.focusedDay)
  // The focused day left the DOM with its month, so focus follows the tab stop.
  const refocus = model.focused && focusedDay !== null
  return {
    focusedDay,
    focused: refocus,
    pendingFocus: null,
    shouldFocus: refocus
  }
}

export const tabStopOf = (
  focusedDay: DateTime.Utc | null,
  context: FocusContext,
  weeks: ReadonlyArray<ReadonlyArray<DateTime.Utc>>
): DateTime.Utc | null => {
  const first = weeks[0]?.[0]
  const last = weeks.at(-1)?.at(-1)
  // `date` when it is rendered and in range, else `null`.
  const rendered = (date: DateTime.Utc | null) =>
    date !== null &&
      first !== undefined &&
      last !== undefined &&
      !isOutOfRange(date, first, last) &&
      !isOutOfRange(date, context.min, context.max)
      ? date
      : null
  return rendered(focusedDay) ??
    focusInMonth(context, focusedDay) ??
    // No day of the shown month is in range: the rendered day nearest to it.
    rendered(clampDate(context.monthStart, context.min, context.max))
}

export const dayAttrs = <
  B extends Attributed<B> & { readonly disabled: (disabled: boolean) => B }
>(
  builder: B,
  state: CalendarDayState,
  label: string
): B =>
  builder
    .attrs({
      type: "button",
      tabindex: state.tabStop ? "0" : "-1",
      "aria-label": label,
      "aria-disabled": !state.disabled && state.unavailable
        ? "true"
        : undefined,
      "aria-current": state.today ? "date" : undefined,
      "data-selected": flag(state.selected),
      "data-today": flag(state.today),
      "data-outside-month": flag(state.outsideMonth),
      "data-unavailable": flag(state.unavailable),
      "data-disabled": flag(state.disabled),
      "data-focused": flag(state.focused)
    })
    .disabled(state.disabled)
