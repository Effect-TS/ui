import type { Component, Mount, View } from "@effect/ui"
import { Command, Route, Router, UiSchema, View as V } from "@effect/ui"
import {
  Calendar,
  CalendarEvents,
  type CalendarProps,
  DirectionProvider,
  Field
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, DateTime, Effect, Exit, Schema } from "effect"

type Parts = Component.Headless.Parts<typeof Calendar>
type H = View.Helper<never, CalendarProps> & View.Tags<Html.Elements, never>

const utc = (iso: string): DateTime.Utc =>
  DateTime.makeUnsafe(iso + "T00:00:00Z")
const iso = (date: DateTime.Utc): string => DateTime.formatIsoDateUtc(date)

const consumer = <B extends { attr(name: string, value: string): B }>(
  builder: B,
  attrs: Record<string, string>
) =>
  Object.entries(attrs).reduce(
    (b, [name, value]) => b.attr(name, value),
    builder
  )

const ownedDay = {
  type: "submit",
  tabindex: "4",
  disabled: "",
  "aria-label": "Custom day",
  "aria-disabled": "true",
  "aria-current": "step",
  "data-selected": "x",
  "data-today": "x",
  "data-outside-month": "x",
  "data-unavailable": "x",
  "data-disabled": "x",
  "data-focused": "x"
}

const makeStandIn = (unavailable: ReadonlySet<string> = new Set()) => ({
  elements: Html,
  view: (calendar: Parts, h: H) =>
    calendar.root(
      consumer(h.div.class("root"), {
        "data-disabled": "x",
        "data-readonly": "x",
        "data-keep": "yes"
      })
    ).children(
      calendar.heading(
        consumer(h.h2.class("heading"), {
          id: "mine",
          "aria-live": "assertive",
          "data-disabled": "x",
          "data-readonly": "x"
        })
      ).children(calendar.title),
      calendar.previous(
        consumer(h.button.class("prev"), {
          type: "submit",
          disabled: "",
          "aria-disabled": "true",
          "data-disabled": "x"
        })
      ).children("‹"),
      calendar.next(
        consumer(h.button.class("next"), {
          type: "submit",
          disabled: "",
          "aria-disabled": "true",
          "data-disabled": "x"
        })
      ).children("›"),
      calendar.grid(
        consumer(h.table.class("grid"), {
          role: "presentation",
          "aria-labelledby": "elsewhere",
          "aria-disabled": "true",
          "aria-readonly": "true",
          "data-disabled": "x",
          "data-readonly": "x"
        })
      ).children(
        h.thead(
          h.tr(
            ...calendar.weekdays.map((weekday, index) =>
              calendar.weekday({
                element: consumer(h.th.class("weekday-" + index), {
                  scope: "row",
                  abbr: "Wrong"
                }),
                index
              }).children(weekday.short)
            )
          )
        ),
        h.tbody(
          ...calendar.weeks.map((week) =>
            h.tr(
              ...week.map((date) => {
                const key = iso(date)
                return calendar.cell({
                  element: consumer(h.td.class("cell-" + key), {
                    role: "cell",
                    "aria-selected": "mixed"
                  }),
                  date
                }).children(
                  calendar.day({
                    element: consumer(
                      h.button.class("day-" + key).attr("data-custom", key),
                      ownedDay
                    ),
                    date,
                    unavailable: unavailable.has(key)
                  }).children(String(DateTime.getPartUtc(date, "day")))
                )
              })
            )
          )
        )
      )
    )
})

const loc = (name: string) => Locator.attr("class", name)
const dayLoc = (date: string) => loc("day-" + date)
const cellLoc = (date: string) => loc("cell-" + date)

const baseProps = (extra: Partial<CalendarProps> = {}): CalendarProps => ({
  value: utc("2026-11-15"),
  month: utc("2026-11-01"),
  today: utc("2026-11-26"),
  locale: "en-US",
  ...extra
})

type Issued = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const mountOf = (scene: Rendered, locator: Locator.Locator): Issued =>
  (scene.get(locator) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)?.mount as unknown as Issued

const makeScene = (
  initial: CalendarProps = baseProps(),
  unavailable: ReadonlySet<string> = new Set()
) =>
  HtmlScene.make(Calendar, initial, makeStandIn(unavailable)).pipe(
    Effect.map((scene) => {
      scene.expectMount(mountOf(scene, loc("root")))
      return scene
    })
  )

type Scene = Effect.Success<ReturnType<typeof makeScene>>

const owns = (
  scene: Scene,
  locator: Locator.Locator,
  expected: Record<string, string | undefined>
) => {
  const attrs = scene.get(locator).attrs ?? {}
  for (const [name, value] of Object.entries(expected)) {
    assert.strictEqual(attrs[name], value, name)
  }
}

const focused = (scene: Scene): ReadonlyArray<string> =>
  scene.current.pending.map(({ command }) => {
    scene.resolve(command as never, { found: true } as never)
    return (command.args as { readonly ref: { readonly key: string } }).ref.key
      .replace(/^CalendarDay\[(.*)\]$/, "$1")
  })

const syncMonth = (scene: Scene, next: CalendarProps) => {
  scene.props(next)
  const sub = scene.subscriptions.find((key) => key.startsWith("syncedMonth"))
  if (sub !== undefined) {
    scene.subscription(sub, {
      _tag: "SyncedMonth",
      month: DateTime.startOf(DateTime.removeTime(next.month), "month")
    } as never)
  }
  return scene
}

describe("Calendar", () => {
  it.effect("parts carry roles, ARIA, data attributes, part values, and override consumer-owned attributes", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(
        baseProps({
          min: utc("2026-11-05"),
          max: utc("2026-11-28"),
          firstDayOfWeek: 1
        }),
        new Set(["2026-11-18"])
      )

      scene.parts((calendar) => {
        assert.strictEqual(iso(calendar.month), "2026-11-01")
        assert.strictEqual(calendar.title, "November 2026")
        assert.strictEqual(calendar.weekdays.length, 7)
        assert.strictEqual(calendar.weekdays[0]!.long, "Monday")
        assert.strictEqual(calendar.weekdays[6]!.long, "Sunday")
        // Nov 2026 starting Monday: Oct 26 .. Dec 6 (6 weeks)
        assert.strictEqual(calendar.weeks.length, 6)
        assert.strictEqual(iso(calendar.weeks[0]![0]!), "2026-10-26")
        assert.strictEqual(iso(calendar.weeks[5]![6]!), "2026-12-06")
      })

      const headingId = scene.get(loc("heading")).attrs!.id!
      assert.notStrictEqual(headingId, "mine")

      owns(scene, loc("root"), {
        class: "root",
        "data-keep": "yes",
        "data-disabled": undefined,
        "data-readonly": undefined
      })
      owns(scene, loc("heading"), {
        class: "heading",
        id: headingId,
        "aria-live": "polite",
        "data-disabled": undefined,
        "data-readonly": undefined
      })
      // min is Nov 5 and max is Nov 28, so both previous and next are disabled
      owns(scene, loc("prev"), {
        type: "button",
        disabled: "",
        "aria-disabled": undefined,
        "aria-label": "Previous month",
        "data-disabled": ""
      })
      owns(scene, loc("next"), {
        type: "button",
        disabled: "",
        "aria-disabled": undefined,
        "aria-label": "Next month",
        "data-disabled": ""
      })
      owns(scene, loc("grid"), {
        role: "grid",
        "aria-labelledby": "elsewhere " + headingId,
        "aria-disabled": undefined,
        "aria-readonly": undefined,
        "data-disabled": undefined,
        "data-readonly": undefined
      })
      owns(scene, loc("weekday-0"), { scope: "col", abbr: "Monday" })
      owns(scene, loc("weekday-6"), { scope: "col", abbr: "Sunday" })

      // Selected day (also initial tab stop)
      owns(scene, cellLoc("2026-11-15"), {
        role: "gridcell",
        "aria-selected": "true"
      })
      owns(scene, dayLoc("2026-11-15"), {
        type: "button",
        tabindex: "0",
        disabled: undefined,
        "aria-label": "Sunday, November 15, 2026",
        "aria-disabled": undefined,
        "aria-current": undefined,
        "data-selected": "",
        "data-today": undefined,
        "data-outside-month": undefined,
        "data-unavailable": undefined,
        "data-disabled": undefined,
        "data-focused": undefined,
        "data-custom": "2026-11-15"
      })

      // Today
      owns(scene, cellLoc("2026-11-26"), {
        role: "gridcell",
        "aria-selected": "false"
      })
      owns(scene, dayLoc("2026-11-26"), {
        tabindex: "-1",
        "aria-current": "date",
        "data-today": "",
        "data-selected": undefined
      })

      // Outside-month & below min (disabled)
      owns(scene, dayLoc("2026-10-26"), {
        disabled: "",
        tabindex: "-1",
        "aria-disabled": undefined,
        "data-outside-month": "",
        "data-disabled": ""
      })

      // Above max (disabled)
      owns(scene, dayLoc("2026-11-29"), {
        disabled: "",
        tabindex: "-1",
        "data-disabled": "",
        "data-outside-month": undefined
      })

      // Unavailable day (not natively disabled, aria-disabled="true")
      owns(scene, dayLoc("2026-11-18"), {
        disabled: undefined,
        "aria-disabled": "true",
        "data-unavailable": "",
        "data-disabled": undefined
      })

      // Focus sets data-focused on that day only
      scene.focus(dayLoc("2026-11-20"))
      owns(scene, dayLoc("2026-11-20"), { "data-focused": "", tabindex: "0" })
      owns(scene, dayLoc("2026-11-15"), {
        "data-focused": undefined,
        tabindex: "-1"
      })

      // Default firstDayOfWeek comes from locale (en-US -> Sunday, en-GB -> Monday)
      const us = yield* makeScene(baseProps({ locale: "en-US" }))
      us.parts((cal) => assert.strictEqual(cal.weekdays[0]!.long, "Sunday"))
      const gb = yield* makeScene(baseProps({ locale: "en-GB" }))
      gb.parts((cal) => assert.strictEqual(cal.weekdays[0]!.long, "Monday"))

      // Invalid weekday index and wrong element tags fail at runtime
      const h = V.makeHelper<never, {}, Html.Elements>({}, Html)
      const p = Story.parts(Calendar, {
        model: {
          focusedDay: null,
          focused: false,
          shownMonth: utc("2026-11-01"),
          pendingFocus: null,
          rtl: false
        },
        props: baseProps()
      })
      assert.throws(() => p.weekday({ element: h.th, index: 7 }))
      assert.throws(() =>
        p.day({ element: h.div as never, date: utc("2026-11-15") })
      )
      assert.throws(() => p.previous(h.div as never))
      assert.throws(() => p.grid(h.div as never))
    }))

  it.effect("emits Picked and RequestedMonth, moves focus on month change, and restore clears focus state", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(
        baseProps({
          value: null,
          month: utc("2026-01-15"),
          today: utc("2026-01-10"),
          min: utc("2025-12-31"),
          max: utc("2026-02-01")
        })
      )

      // Initial tab stop is today when value is null
      owns(scene, dayLoc("2026-01-10"), { tabindex: "0" })

      // Clicking a day emits Picked with normalized UTC midnight
      scene.click(dayLoc("2026-01-31")).emitted(
        CalendarEvents.Picked({ date: utc("2026-01-31") })
      )

      // Previous and next emit RequestedMonth with first of target month
      owns(scene, loc("prev"), { disabled: undefined })
      owns(scene, loc("next"), { disabled: undefined })
      scene.click(loc("prev")).emitted(
        CalendarEvents.RequestedMonth({ month: utc("2025-12-01") })
      )
      scene.click(loc("next")).emitted(
        CalendarEvents.RequestedMonth({ month: utc("2026-02-01") })
      )

      // Focus Jan 31, then change month to Feb 2026 (no value in Feb): clamps to Feb 28 (or max Feb 1)
      scene.focus(dayLoc("2026-01-31"))
      syncMonth(
        scene,
        baseProps({
          value: null,
          month: utc("2026-02-01"),
          today: utc("2026-01-10")
        })
      )
      owns(scene, dayLoc("2026-02-28"), { tabindex: "0" })
      assert.deepStrictEqual(focused(scene), [])

      // Changing month to one containing value moves focus stop to value
      syncMonth(
        scene,
        baseProps({
          value: utc("2026-03-12"),
          month: utc("2026-03-01"),
          today: utc("2026-01-10")
        })
      )
      owns(scene, dayLoc("2026-03-12"), { tabindex: "0" })

      // History restore drops transient focus state while preserving controlled value/month
      const PageRoute = Route.union({
        Pick: Route.make("/"),
        Away: Route.make("/away")
      })
      const PageMsg = UiSchema.TaggedEnum({
        ChangedRoute: { route: PageRoute },
        Left: {},
        Navigated: {}
      })
      const Page = Html.component({
        name: "CalendarRestorePage",
        props: Schema.Struct({ route: PageRoute }),
        model: Schema.Struct({ route: PageRoute }),
        message: PageMsg
      }).make({
        init: ($) => ({ route: $.props.route }),
        update: {
          ChangedRoute: (_, { route }) => ({ route }),
          Left: ($) =>
            $.run(
              Router.push(PageRoute, PageRoute.Away()).pipe(
                Command.map(() => PageMsg.Navigated())
              )
            ),
          Navigated: ($) => $.model
        },
        subscriptions: ({ model }) => [
          Router.subscription(
            PageRoute,
            model.route,
            (route) => PageMsg.ChangedRoute({ route })
          )
        ],
        view: (h, model) =>
          h.div(
            h.button.attr("data-testid", "away").on("click", PageMsg.Left())
              .children("Away"),
            model.route._tag === "Pick"
              ? Calendar(h, {
                props: baseProps(),
                view: (cal) =>
                  cal.root(h.div).children(
                    cal.grid(h.table).children(
                      h.tbody(
                        ...cal.weeks.map((week) =>
                          h.tr(
                            ...week.map((date) =>
                              cal.cell({ element: h.td, date }).children(
                                cal.day({
                                  element: h.button.attr(
                                    "data-testid",
                                    "day-" + iso(date)
                                  ),
                                  date
                                }).children(
                                  String(DateTime.getPartUtc(date, "day"))
                                )
                              )
                            )
                          )
                        )
                      )
                    )
                  )
              })
              : null
          )
      })
      const history = Router.memoryHistory("/")
      yield* Effect.gen(function*() {
        const root = yield* TestHost.mount(Page, Router.props(PageRoute))
        const at = (id: string) => root.get(Locator.testId(id))
        yield* TestHost.settle
        Locator.fire(at("day-2026-11-20"), "focus")
        yield* TestHost.settle
        assert.strictEqual(at("day-2026-11-20").attrs?.["data-focused"], "")
        assert.strictEqual(at("day-2026-11-20").attrs?.tabindex, "0")
        Locator.fire(at("away"), "click")
        yield* TestHost.settle
        history.go(-1)
        yield* TestHost.settle
        assert.isUndefined(at("day-2026-11-20").attrs?.["data-focused"])
        assert.strictEqual(at("day-2026-11-20").attrs?.tabindex, "-1")
        assert.strictEqual(at("day-2026-11-15").attrs?.tabindex, "0")
      }).pipe(
        Effect.provide(Router.make({ routes: PageRoute, history })),
        Effect.provide(TestHost.layer())
      )
    }))

  it.effect("handles every APG grid key, RTL swap, cross-month requests (accepted and refused), and min/max clamping", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(
        baseProps({
          value: null,
          month: utc("2026-11-01"),
          today: utc("2026-11-15"),
          firstDayOfWeek: 0
        })
      )

      scene.focus(dayLoc("2026-11-15"))

      // ArrowRight (+1d), ArrowLeft (-1d), ArrowDown (+7d), ArrowUp (-7d)
      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-15"), "ArrowRight")
            .expectDefaultPrevented()
        ),
        ["2026-11-16"]
      )
      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-16"), "ArrowLeft")
            .expectDefaultPrevented()
        ),
        ["2026-11-15"]
      )
      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-15"), "ArrowDown")
            .expectDefaultPrevented()
        ),
        ["2026-11-22"]
      )
      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-22"), "ArrowUp")
            .expectDefaultPrevented()
        ),
        ["2026-11-15"]
      )

      // Home (start of week) and End (end of week)
      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-18"), "Home").expectDefaultPrevented()
        ),
        ["2026-11-15"]
      )
      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-18"), "End").expectDefaultPrevented()
        ),
        ["2026-11-21"]
      )

      // Modified or unhandled keys are ignored
      scene.keydown(dayLoc("2026-11-15"), "ArrowRight", { alt: true })
        .expectIgnored().expectDefaultPrevented(false)
      scene.keydown(dayLoc("2026-11-15"), "Enter")
        .expectIgnored().expectDefaultPrevented(false)

      // RTL swaps Left and Right
      scene.shared(DirectionProvider, { direction: "rtl" })
      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-15"), "ArrowLeft")
            .expectDefaultPrevented()
        ),
        ["2026-11-16"]
      )
      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-16"), "ArrowRight")
            .expectDefaultPrevented()
        ),
        ["2026-11-15"]
      )
      scene.shared(DirectionProvider, { direction: "ltr" })

      // Leaving shown month: consumer refuses -> focus stays in shown month
      scene.focus(dayLoc("2026-11-30"))
      scene.keydown(dayLoc("2026-11-30"), "ArrowRight")
        .expectDefaultPrevented()
        .emitted(CalendarEvents.RequestedMonth({ month: utc("2026-12-01") }))
      assert.deepStrictEqual(focused(scene), [])
      owns(scene, dayLoc("2026-11-30"), { tabindex: "0", "data-focused": "" })

      // PageDown -> consumer accepts -> focus lands on target day in Dec
      scene.keydown(dayLoc("2026-11-30"), "PageDown")
        .expectDefaultPrevented()
        .emitted(CalendarEvents.RequestedMonth({ month: utc("2026-12-01") }))
      syncMonth(
        scene,
        baseProps({
          value: null,
          month: utc("2026-12-01"),
          today: utc("2026-11-15"),
          firstDayOfWeek: 0
        })
      )
      assert.deepStrictEqual(focused(scene), ["2026-12-30"])
      owns(scene, dayLoc("2026-12-30"), { tabindex: "0" })

      // PageUp (-1 month), Shift+PageUp (-1 year), Shift+PageDown (+1 year)
      scene.keydown(dayLoc("2026-12-30"), "PageUp")
        .expectDefaultPrevented()
        .emitted(CalendarEvents.RequestedMonth({ month: utc("2026-11-01") }))
      scene.keydown(dayLoc("2026-12-30"), "PageUp", { shift: true })
        .expectDefaultPrevented()
        .emitted(CalendarEvents.RequestedMonth({ month: utc("2025-12-01") }))
      scene.keydown(dayLoc("2026-12-30"), "PageDown", { shift: true })
        .expectDefaultPrevented()
        .emitted(CalendarEvents.RequestedMonth({ month: utc("2027-12-01") }))

      // Min/max clamping keeps focus within bounds without leaving month
      const bounded = yield* makeScene(
        baseProps({
          value: null,
          month: utc("2026-11-01"),
          today: utc("2026-11-15"),
          min: utc("2026-11-10"),
          max: utc("2026-11-20")
        })
      )
      bounded.focus(dayLoc("2026-11-15"))
      assert.deepStrictEqual(
        focused(bounded.keydown(dayLoc("2026-11-15"), "ArrowDown")),
        ["2026-11-20"]
      )
      bounded.keydown(dayLoc("2026-11-20"), "ArrowRight")
      assert.deepStrictEqual(bounded.current.emitted, [])
      assert.deepStrictEqual(focused(bounded), [])
      assert.deepStrictEqual(
        focused(bounded.keydown(dayLoc("2026-11-20"), "PageUp")),
        ["2026-11-10"]
      )
      assert.deepStrictEqual(bounded.current.emitted, [])
    }))

  it.effect("unavailable days stay focusable and reachable by arrow keys, with aria-disabled, and never emit Picked", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(
        baseProps({ value: null, today: utc("2026-11-15") }),
        new Set(["2026-11-16"])
      )

      scene.focus(dayLoc("2026-11-15"))
      assert.deepStrictEqual(
        focused(scene.keydown(dayLoc("2026-11-15"), "ArrowRight")),
        ["2026-11-16"]
      )
      scene.focus(dayLoc("2026-11-16"))
      owns(scene, dayLoc("2026-11-16"), {
        tabindex: "0",
        disabled: undefined,
        "aria-disabled": "true",
        "data-unavailable": "",
        "data-focused": ""
      })

      scene.click(dayLoc("2026-11-16")).expectDefaultPrevented()
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it.effect("disabled suppresses all interactions, disables buttons natively, and clears focus state", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(baseProps({ disabled: false }))
      scene.focus(dayLoc("2026-11-15"))
      owns(scene, dayLoc("2026-11-15"), { "data-focused": "" })

      scene.props(baseProps({ disabled: true }))
      owns(scene, loc("root"), { "data-disabled": "" })
      owns(scene, loc("grid"), {
        "aria-disabled": "true",
        "data-disabled": ""
      })
      owns(scene, loc("prev"), { disabled: "", "data-disabled": "" })
      owns(scene, loc("next"), { disabled: "", "data-disabled": "" })
      owns(scene, dayLoc("2026-11-15"), {
        disabled: "",
        tabindex: "-1",
        "data-disabled": "",
        "data-focused": undefined
      })

      // Natively disabled buttons reject user clicks; update also suppresses every interaction
      assert.throws(() => scene.click(dayLoc("2026-11-15")), /disabled/)
      assert.throws(() => scene.click(loc("prev")), /disabled/)
      assert.throws(() => scene.click(loc("next")), /disabled/)
      scene.fire(dayLoc("2026-11-15"), "click")
      assert.deepStrictEqual(scene.current.emitted, [])
      scene.fire(loc("prev"), "click")
      assert.deepStrictEqual(scene.current.emitted, [])
      scene.fire(loc("next"), "click")
      assert.deepStrictEqual(scene.current.emitted, [])
      scene.fire(dayLoc("2026-11-15"), "focus")
      scene.keydown(dayLoc("2026-11-15"), "ArrowRight").expectIgnored()
      assert.deepStrictEqual(scene.current.emitted, [])
      assert.deepStrictEqual(scene.current.pending, [])

      // Re-enabling after disabledWhileFocused keeps data-focused cleared
      const sub = scene.subscriptions.find((key) =>
        key.startsWith("disabledWhileFocused")
      )
      if (sub !== undefined) {
        scene.subscription(sub, { _tag: "BlurredDay" } as never)
      }
      scene.props(baseProps({ disabled: false }))
      owns(scene, dayLoc("2026-11-15"), { "data-focused": undefined })
    }))

  it.effect("read-only allows navigation and month requests but suppresses Picked", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(baseProps({ readOnly: true }))

      owns(scene, loc("root"), { "data-readonly": "" })
      owns(scene, loc("grid"), {
        "aria-readonly": "true",
        "data-readonly": ""
      })
      owns(scene, loc("prev"), { disabled: undefined })
      owns(scene, loc("next"), { disabled: undefined })

      scene.focus(dayLoc("2026-11-15"))
      assert.deepStrictEqual(
        focused(scene.keydown(dayLoc("2026-11-15"), "ArrowRight")),
        ["2026-11-16"]
      )
      scene.click(loc("next")).emitted(
        CalendarEvents.RequestedMonth({ month: utc("2026-12-01") })
      )

      scene.click(dayLoc("2026-11-16"))
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it.effect("Zoned value and today whose UTC day differs from their local day show their local day", () =>
    Effect.gen(function*() {
      // 2026-11-26T02:00:00Z is Nov 25 in America/Los_Angeles (UTC-8)
      const zonedValue = DateTime.makeZonedUnsafe("2026-11-26T02:00:00Z", {
        timeZone: "America/Los_Angeles"
      })
      // 2026-11-26T22:00:00Z is Nov 27 in Pacific/Auckland (UTC+13)
      const zonedToday = DateTime.makeZonedUnsafe("2026-11-26T22:00:00Z", {
        timeZone: "Pacific/Auckland"
      })
      const scene = yield* makeScene({
        value: zonedValue,
        month: zonedValue,
        today: zonedToday,
        locale: "en-US"
      })

      owns(scene, cellLoc("2026-11-25"), { "aria-selected": "true" })
      owns(scene, dayLoc("2026-11-25"), { "data-selected": "" })
      owns(scene, cellLoc("2026-11-26"), { "aria-selected": "false" })
      owns(scene, dayLoc("2026-11-26"), {
        "data-selected": undefined,
        "data-today": undefined
      })
      owns(scene, dayLoc("2026-11-27"), {
        "data-today": "",
        "aria-current": "date"
      })

      // Emitted Picked date is normalized midnight UTC
      scene.click(dayLoc("2026-11-25")).emitted(
        CalendarEvents.Picked({ date: utc("2026-11-25") })
      )
    }))

  it.effect("integrates with Field via field.group on root and field.member on day", () =>
    Effect.gen(function*() {
      const fieldScene = yield* HtmlScene.make(
        Field,
        { invalid: true, described: true },
        {
          elements: Html,
          view: (field, h) =>
            field.root(h.div.class("field")).children(
              field.legend(h.div.class("legend")).children("Date"),
              Calendar(h, {
                props: baseProps({ disabled: field.disabled }),
                view: (calendar) =>
                  calendar.root(field.group(h.div.class("cal-root"))).children(
                    calendar.heading(h.h2).children(calendar.title),
                    calendar.grid(h.table).children(
                      h.tbody(
                        ...calendar.weeks.map((week) =>
                          h.tr(
                            ...week.map((date) =>
                              calendar.cell({ element: h.td, date }).children(
                                calendar.day({
                                  element: field.member(
                                    h.button.class("fday-" + iso(date))
                                  ),
                                  date
                                }).children(
                                  String(DateTime.getPartUtc(date, "day"))
                                )
                              )
                            )
                          )
                        )
                      )
                    )
                  )
              }),
              field.description(h.p.class("desc")).children("Choose a date"),
              field.error(h.span.class("err"))?.children("Required")
            )
        }
      )

      const legendId = fieldScene.get(loc("legend")).attrs!.id!
      const descId = fieldScene.get(loc("desc")).attrs!.id!
      const errId = fieldScene.get(loc("err")).attrs!.id!
      assert.strictEqual(fieldScene.get(loc("cal-root")).attrs?.role, "group")
      assert.strictEqual(
        fieldScene.get(loc("cal-root")).attrs?.["aria-labelledby"],
        legendId
      )
      assert.strictEqual(
        fieldScene.get(loc("fday-2026-11-15")).attrs?.["aria-invalid"],
        "true"
      )
      assert.strictEqual(
        fieldScene.get(loc("fday-2026-11-15")).attrs?.["aria-describedby"],
        descId + " " + errId
      )
      assert.isUndefined(fieldScene.get(loc("fday-2026-11-15")).attrs?.id)
      const bad = yield* Effect.exit(
        HtmlScene.make(Calendar, baseProps(), {
          elements: Html,
          view: (cal, h) => cal.weekday({ element: h.th, index: -1 })
        })
      ).pipe(
        Effect.map((exit) =>
          Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "rendered"
        )
      )
      assert.include(bad, "weekday")
    }))
})
