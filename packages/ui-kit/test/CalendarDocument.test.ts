// @vitest-environment happy-dom
import { type Component, UiSchema, type View } from "@effect/ui"
import { Calendar, Field } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { DateTime, Effect, Schema } from "effect"
import { byId, click, container, tick } from "./utils/document.ts"

const utc = (iso: string) => DateTime.makeUnsafe(iso + "T00:00:00Z")

// A grid whose day buttons have their ISO date as `id`.
const grid = (
  h: View.Tags<Html.Elements, any>,
  calendar: Component.Headless.Parts<typeof Calendar>
) =>
  calendar.root(h.div).children(
    ...calendar.months.map((month) =>
      month.grid(h.table).children(
        h.tbody(
          ...month.weeks.map((week) =>
            h.tr(
              ...week.map((date) =>
                month.cell({ element: h.td, date }).children(
                  month.day({
                    element: h.button.attr(
                      "id",
                      DateTime.formatIsoDateUtc(date)
                    ),
                    date
                  })
                )
              )
            )
          )
        )
      )
    )
  )

const Message = UiSchema.TaggedEnum({
  Jumped: {},
  Reset: {},
  RequestedMonth: { month: Schema.DateTimeUtc }
})

// The parent moves to a month whose days are all before its new `min`.
const november = { month: utc("2026-11-01"), min: utc("2026-12-01") }

const Page = Html.component({
  name: "Page",
  model: Schema.Struct({
    month: Schema.DateTimeUtc,
    min: Schema.NullOr(Schema.DateTimeUtc)
  }),
  message: Message
}).make({
  init: () => ({ month: utc("2026-12-01"), min: null }),
  update: {
    Jumped: () => november,
    Reset: () => ({ month: utc("2026-12-01"), min: null }),
    RequestedMonth: (_, { month }) => ({ ...november, month })
  },
  view: (h, model) =>
    h.div(
      h.button.attrs({ id: "jump", type: "button" }).on(
        "click",
        Message.Jumped()
      ),
      h.button.attrs({ id: "reset", type: "button" }).on(
        "click",
        Message.Reset()
      ),
      Calendar(h, {
        props: {
          value: null,
          month: model.month,
          today: utc("2026-12-15"),
          min: model.min ?? undefined,
          firstDayOfWeek: 0,
          locale: "en-US"
        },
        onEmit: {
          Picked: () => undefined,
          RequestedMonth: ({ month }) => Message.RequestedMonth({ month })
        },
        view: (calendar) => grid(h, calendar)
      })
    )
})

const FieldMessage = UiSchema.TaggedEnum({
  Applied: {},
  RequestedMonth: { month: Schema.DateTimeUtc }
})

// The parent holds a requested month until `apply` is clicked.
const FieldPage = Html.component({
  name: "FieldPage",
  model: Schema.Struct({
    month: Schema.DateTimeUtc,
    requested: Schema.DateTimeUtc
  }),
  message: FieldMessage
}).make({
  init: () => ({ month: utc("2026-12-01"), requested: utc("2026-12-01") }),
  update: {
    Applied: ($) => $.evolve({ month: $.model.requested }),
    RequestedMonth: ($, { month }) => $.evolve({ requested: month })
  },
  view: (h, model) =>
    h.div(
      h.button.attrs({ id: "apply", type: "button" }).on(
        "click",
        FieldMessage.Applied()
      ),
      Field(h, {
        view: (field) =>
          Calendar(h, {
            props: {
              value: null,
              month: model.month,
              today: utc("2026-12-15"),
              locale: "en-US"
            },
            onEmit: {
              Picked: () => undefined,
              RequestedMonth: ({ month }) =>
                FieldMessage.RequestedMonth({ month })
            },
            view: (calendar) =>
              calendar.root(field.group(h.div.attr("id", "group"))).children(
                // Keyed by month, so each month change replaces the grid.
                ...calendar.months.map((month) =>
                  month.grid(
                    h.table.key(DateTime.formatIsoDateUtc(month.month))
                  ).children(
                    h.tbody(
                      ...month.weeks.map((week) =>
                        h.tr(
                          ...week.map((date) =>
                            month.cell({ element: h.td, date }).children(
                              month.day({
                                element: field.member(
                                  h.button.attr(
                                    "id",
                                    DateTime.formatIsoDateUtc(date)
                                  )
                                ),
                                date
                              })
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
          })
      })
    )
})

const PickMessage = UiSchema.TaggedEnum({
  Picked: { date: Schema.DateTimeUtc },
  RequestedMonth: { month: Schema.DateTimeUtc }
})

const PickPage = Html.component({
  name: "PickPage",
  model: Schema.Struct({
    month: Schema.DateTimeUtc,
    picked: Schema.Array(Schema.String)
  }),
  message: PickMessage
}).make({
  init: () => ({ month: utc("2026-11-01"), picked: [] }),
  update: {
    Picked: ($, { date }) =>
      $.evolve({
        picked: [...$.model.picked, DateTime.formatIsoDateUtc(date)]
      }),
    RequestedMonth: ($, { month }) => $.evolve({ month })
  },
  view: (h, model) =>
    h.div(
      h.p.attr("id", "picked").children(model.picked.join(" ")),
      Calendar(h, {
        props: {
          value: null,
          month: model.month,
          today: utc("2026-11-15"),
          firstDayOfWeek: 0,
          locale: "en-US"
        },
        onEmit: {
          Picked: ({ date }) => PickMessage.Picked({ date }),
          RequestedMonth: ({ month }) => PickMessage.RequestedMonth({ month })
        },
        view: (calendar) => grid(h, calendar)
      })
    )
})

// A browser blurs an element that has focus as it leaves the document.
const blurOnRemoval = Effect.acquireRelease(
  Effect.sync(() => {
    const proto = window.Node.prototype
    const removeChild = proto.removeChild
    proto.removeChild = function<T extends Node>(this: Node, child: T): T {
      const active = document.activeElement as HTMLElement | null
      if (active !== null && child.contains(active)) active.blur()
      return removeChild.call(this, child) as T
    }
    return removeChild
  }),
  (removeChild) =>
    Effect.sync(() => (window.Node.prototype.removeChild = removeChild))
)

// A month change settles over several frames, which can outlast one `tick`.
const focusLands = Effect.fnUntraced(function*(id: string) {
  for (let i = 0; i < 20 && document.activeElement?.id !== id; i++) {
    yield* tick
  }
  assert.strictEqual(document.activeElement?.id, id)
})

const keydown = (id: string, key: string) =>
  byId(id).dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  )

const arrowRight = () => keydown(document.activeElement!.id, "ArrowRight")
const arrowUp = () => keydown(document.activeElement!.id, "ArrowUp")

// Enter on a focused button activates it with a click.
const enter = () => (document.activeElement as HTMLElement).click()

// A browser runs microtasks between two trusted events, but no other task.
const rapidly = (...events: Array<() => void>) =>
  Effect.promise(async () => {
    for (const send of events) {
      send()
      for (let i = 0; i < 10; i++) await Promise.resolve()
    }
  })

describe("Calendar in a document", { concurrent: false }, () => {
  it.effect("a month change moves focus to the new tab stop, even outside the shown month", () =>
    Effect.gen(function*() {
      yield* BrowserHost.mountEffect(Page, {}, yield* container)
      yield* tick
      const landsOnFirst = Effect.fnUntraced(function*(change: () => void) {
        byId("2026-12-15").focus()
        yield* tick
        change()
        yield* tick
        yield* focusLands("2026-12-01")
        assert.strictEqual(byId("2026-12-01").getAttribute("tabindex"), "0")
        click(byId("reset"))
        yield* tick
      })
      // The parent changes `month` on its own
      yield* landsOnFirst(() => click(byId("jump")))
      // The parent accepts a keyboard month request
      yield* landsOnFirst(() => keydown("2026-12-15", "PageUp"))
    }).pipe(Effect.scoped))

  it.effect("a month change keeps focus inside the calendar, unless the user left", () =>
    Effect.gen(function*() {
      yield* blurOnRemoval
      yield* BrowserHost.mountEffect(FieldPage, {}, yield* container)
      yield* tick
      byId("2026-12-15").focus()
      yield* tick
      keydown("2026-12-15", "PageDown")
      yield* tick
      // `click` sends the event without moving focus.
      click(byId("apply"))
      yield* tick
      yield* focusLands("2027-01-15")
      assert.isFalse(byId("group").hasAttribute("data-touched"))

      keydown("2027-01-15", "PageDown")
      yield* tick
      byId("apply").focus()
      yield* tick
      assert.isTrue(byId("group").hasAttribute("data-touched"))
      click(byId("apply"))
      yield* tick
      assert.isNotNull(document.getElementById("2027-02-15"))
      assert.strictEqual(document.activeElement?.id, "apply")
    }).pipe(Effect.scoped))

  it.effect("rapid keys move from the day just reached, Enter picks it, and a non-focusing click keeps keyboard focus", () =>
    Effect.gen(function*() {
      yield* BrowserHost.mountEffect(PickPage, {}, yield* container)
      yield* tick
      byId("2026-11-15").focus()
      yield* tick
      yield* rapidly(arrowRight, arrowRight, enter)
      yield* tick
      assert.strictEqual(document.activeElement?.id, "2026-11-17")
      assert.strictEqual(byId("picked").textContent, "2026-11-17")

      byId("2026-11-21").click()
      yield* tick
      assert.strictEqual(document.activeElement?.id, "2026-11-17")
      assert.strictEqual(byId("picked").textContent, "2026-11-17 2026-11-21")
      arrowRight()
      yield* tick
      assert.strictEqual(document.activeElement?.id, "2026-11-18")
    }).pipe(Effect.scoped))

  it.effect("rapid keys across a month change handle reversals, pointer clicks, and Enter", () =>
    Effect.gen(function*() {
      yield* BrowserHost.mountEffect(PickPage, {}, yield* container)
      yield* tick
      byId("2026-11-30").focus()
      yield* tick
      yield* rapidly(arrowRight, arrowUp, enter)
      yield* tick
      assert.strictEqual(document.activeElement?.id, "2026-11-24")
      assert.strictEqual(byId("picked").textContent, "2026-11-24")

      byId("2026-11-30").focus()
      yield* tick
      yield* rapidly(arrowRight, () => click(byId("2026-11-30")))
      yield* tick
      assert.strictEqual(byId("picked").textContent, "2026-11-24 2026-11-30")

      byId("2026-12-31").focus()
      yield* tick
      yield* rapidly(arrowRight, arrowRight, enter)
      yield* tick
      assert.strictEqual(document.activeElement?.id, "2027-01-02")
      assert.strictEqual(byId("picked").textContent, "2026-11-24 2026-11-30")
    }).pipe(Effect.scoped))
})
