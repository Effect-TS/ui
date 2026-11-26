// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Calendar } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { DateTime, Effect, Schema } from "effect"
import { byId, click, container, tick } from "./utils/document.ts"

const utc = (iso: string) => DateTime.makeUnsafe(iso + "T00:00:00Z")

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
        view: (calendar) =>
          calendar.root(h.div).children(
            calendar.grid(h.table).children(
              h.tbody(
                ...calendar.weeks.map((week) =>
                  h.tr(
                    ...week.map((date) =>
                      calendar.cell({ element: h.td, date }).children(
                        calendar.day({
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
      })
    )
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
        assert.strictEqual(byId("2026-12-01").getAttribute("tabindex"), "0")
        assert.strictEqual(document.activeElement?.id, "2026-12-01")
        click(byId("reset"))
        yield* tick
      })
      // The parent changes `month` on its own
      yield* landsOnFirst(() => click(byId("jump")))
      // The parent accepts a keyboard month request
      yield* landsOnFirst(() =>
        byId("2026-12-15").dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "PageUp",
            bubbles: true,
            cancelable: true
          })
        )
      )
    }).pipe(Effect.scoped))
})
