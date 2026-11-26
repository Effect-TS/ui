// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Calendar } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { DateTime, Effect, Schema } from "effect"
import { byId, click, container, tick } from "./utils/document.ts"

const utc = (iso: string) => DateTime.makeUnsafe(iso + "T00:00:00Z")

const Message = UiSchema.TaggedEnum({ Jumped: {} })

const Page = Html.component({
  name: "Page",
  model: Schema.Struct({ month: Schema.DateTimeUtc }),
  message: Message
}).make({
  init: () => ({ month: utc("2026-12-01") }),
  update: { Jumped: () => ({ month: utc("2026-11-01") }) },
  view: (h, model) =>
    h.div(
      h.button.attrs({ id: "jump", type: "button" }).on(
        "click",
        Message.Jumped()
      ),
      Calendar(h, {
        props: {
          value: null,
          month: model.month,
          today: utc("2026-12-15"),
          min: utc("2026-12-01"),
          firstDayOfWeek: 0,
          locale: "en-US"
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
  it.effect("a controlled month change moves focus to the new tab stop, even outside the shown month", () =>
    Effect.gen(function*() {
      yield* BrowserHost.mountEffect(Page, {}, yield* container)
      yield* tick
      byId("2026-12-15").focus()
      yield* tick
      // Changes `month` to November, whose days are all before `min`
      click(byId("jump"))
      yield* tick
      assert.strictEqual(byId("2026-12-01").getAttribute("tabindex"), "0")
      assert.strictEqual(document.activeElement?.id, "2026-12-01")
    }).pipe(Effect.scoped))
})
