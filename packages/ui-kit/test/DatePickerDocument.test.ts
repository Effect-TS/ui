// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { DatePicker, DatePickerChangeReason, Field } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { DateTime, Effect, Schema } from "effect"
import {
  byId,
  click,
  container,
  popovers,
  press,
  tick
} from "./utils/document.ts"

const utc = (iso: string) => DateTime.makeUnsafe(iso + "T00:00:00Z")

const Message = UiSchema.TaggedEnum({
  Picked: { date: Schema.NullOr(Schema.DateTimeUtc) },
  RequestedOpen: { reason: DatePickerChangeReason },
  RequestedClose: { reason: DatePickerChangeReason },
  RequestedMonth: { month: Schema.DateTimeUtc }
})

const Page = Html.component({
  name: "Page",
  model: Schema.Struct({
    date: Schema.NullOr(Schema.DateTimeUtc),
    open: Schema.Boolean,
    log: Schema.Array(Schema.String)
  }),
  message: Message
}).make({
  init: () => ({ date: utc("2026-11-15"), open: false, log: [] }),
  update: {
    Picked: ($, { date }) =>
      $.evolve({
        date,
        log: [
          ...$.model.log,
          "Picked " + (date && DateTime.formatIsoDateUtc(date))
        ]
      }),
    RequestedOpen: ($, { reason }) =>
      $.evolve({
        open: true,
        log: [...$.model.log, "RequestedOpen " + reason]
      }),
    RequestedClose: ($, { reason }) =>
      $.evolve({
        open: false,
        log: [...$.model.log, "RequestedClose " + reason]
      }),
    RequestedMonth: ($) => $.model
  },
  view: (h, model) =>
    h.div(
      h.pre.attr("id", "log").children(model.log.join("\n")),
      Field(h, {
        view: (field) =>
          DatePicker(h, {
            props: {
              value: model.date,
              open: model.open,
              month: utc("2026-11-01"),
              today: utc("2026-11-26"),
              locale: "en-GB"
            },
            onEmit: {
              Picked: ({ date }) => Message.Picked({ date }),
              RequestedOpen: ({ reason }) => Message.RequestedOpen({ reason }),
              RequestedClose: ({ reason }) =>
                Message.RequestedClose({ reason }),
              RequestedMonth: ({ month }) => Message.RequestedMonth({ month })
            },
            view: (datePicker) =>
              field.root(field.focusWithin(h.div.attr("id", "field"))).children(
                datePicker.input(field.member(h.input.attr("id", "input"))),
                datePicker.trigger(h.button.attr("id", "trigger")),
                datePicker.positioner(h.div.attr("id", "positioner")).children(
                  datePicker.popup(h.div).children(
                    datePicker.grid(h.table).children(
                      h.tbody(
                        ...datePicker.weeks.map((week) =>
                          h.tr(
                            ...week.map((date) =>
                              datePicker.cell({ element: h.td, date }).children(
                                datePicker.day({
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
              )
          })
      }),
      h.button.attrs({ id: "outside", type: "button" })
    )
})

const log = () =>
  byId("log").textContent!.split("\n").filter((line) => line !== "")
const touched = () => byId("field").hasAttribute("data-touched")
const shown = () => byId("positioner").matches(":popover-open")
// The day takes focus a frame after the popup shows, which can take a while
// on a busy machine
const focusOn = (id: string) =>
  Effect.promise(async () => {
    for (let i = 0; i < 50 && document.activeElement?.id !== id; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  })
const escape = (target: Element) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true
    })
  )

describe("DatePicker in a document", { concurrent: false }, () => {
  it.effect("moves focus to the focused day and back to the trigger, so the field isn't touched until focus leaves", () =>
    Effect.gen(function*() {
      yield* popovers
      yield* BrowserHost.mountEffect(Page, {}, yield* container)
      yield* tick
      byId("trigger").focus()
      click(byId("trigger"))
      yield* focusOn("2026-11-15")
      assert.isTrue(shown())
      assert.strictEqual(document.activeElement?.id, "2026-11-15")
      escape(document.activeElement!)
      yield* tick
      assert.isFalse(shown())
      assert.strictEqual(document.activeElement?.id, "trigger")

      // Escape also closes it from the trigger, as after Shift+Tab out of the popup
      click(byId("trigger"))
      yield* focusOn("2026-11-15")
      byId("trigger").focus()
      escape(byId("trigger"))
      yield* tick
      assert.isFalse(shown())

      click(byId("trigger"))
      yield* focusOn("2026-11-15")
      assert.strictEqual(document.activeElement?.id, "2026-11-15")
      click(byId("2026-11-20"))
      yield* tick
      assert.isFalse(shown())
      assert.strictEqual(document.activeElement?.id, "trigger")
      assert.strictEqual(
        (byId("input") as HTMLInputElement).value,
        "20/11/2026"
      )
      assert.isFalse(touched())

      // A press in the input keeps the popup open
      click(byId("trigger"))
      yield* focusOn("2026-11-15")
      press(byId("input"))
      byId("input").focus()
      yield* tick
      assert.isTrue(shown())
      assert.isFalse(touched())

      press(byId("outside"))
      byId("outside").focus()
      yield* tick
      assert.isFalse(shown())
      assert.strictEqual(document.activeElement?.id, "outside")
      assert.isTrue(touched())

      // Focus leaving for the page, as Tab out of the popup does, closes it
      click(byId("trigger"))
      yield* focusOn("2026-11-15")
      byId("outside").focus()
      yield* tick
      assert.isFalse(shown())
      assert.strictEqual(document.activeElement?.id, "outside")
      assert.deepStrictEqual(log(), [
        "RequestedOpen trigger-press",
        "RequestedClose escape-key",
        "RequestedOpen trigger-press",
        "RequestedClose escape-key",
        "RequestedOpen trigger-press",
        "Picked 2026-11-20",
        "RequestedClose day-press",
        "RequestedOpen trigger-press",
        "RequestedClose outside-press",
        "RequestedOpen trigger-press",
        "RequestedClose focus-out"
      ])
    }).pipe(Effect.scoped))
})
