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
  RequestedMonth: { month: Schema.DateTimeUtc },
  ToggledDecline: {},
  Closed: {}
})

const Page = Html.component({
  name: "Page",
  props: Schema.Struct({ topLayer: Schema.Boolean }),
  model: Schema.Struct({
    date: Schema.NullOr(Schema.DateTimeUtc),
    open: Schema.Boolean,
    declining: Schema.Boolean,
    log: Schema.Array(Schema.String)
  }),
  message: Message
}).make({
  init: () => ({
    date: utc("2026-11-15"),
    open: false,
    declining: false,
    log: []
  }),
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
        open: $.model.declining,
        log: [...$.model.log, "RequestedClose " + reason]
      }),
    RequestedMonth: ($) => $.model,
    ToggledDecline: ($) => $.evolve({ declining: !$.model.declining }),
    Closed: ($) => $.evolve({ open: false })
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
              locale: "en-GB",
              topLayer: h.props.topLayer
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
      h.button.attrs({ id: "outside", type: "button" }),
      // Clicked with a synthetic event, which moves no focus
      h.button.attrs({ id: "decline", type: "button" }).on(
        "click",
        Message.ToggledDecline()
      ),
      h.button.attrs({ id: "close", type: "button" }).on(
        "click",
        Message.Closed()
      )
    )
})

const log = () =>
  byId("log").textContent!.split("\n").filter((line) => line !== "")
const touched = () => byId("field").hasAttribute("data-touched")
const shown = () => {
  const positioner = byId("positioner") as HTMLElement
  return positioner.hasAttribute("popover")
    ? positioner.matches(":popover-open")
    : !positioner.hidden
}
// The day takes focus a frame after the popup shows, which can take a while
// on a busy machine
const focusOn = (id: string) =>
  Effect.promise(async () => {
    for (let i = 0; i < 50 && document.activeElement?.id !== id; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.strictEqual(document.activeElement?.id, id)
  })
const open = Effect.fnUntraced(function*(day: string) {
  click(byId("trigger"))
  yield* focusOn(day)
  assert.isTrue(shown())
})
const escape = (target: Element) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true
    })
  )
// A synthetic click sends the button's message without moving focus
const send = (id: string) =>
  byId(id).dispatchEvent(new MouseEvent("click", { bubbles: true }))

describe("DatePicker in a document", { concurrent: false }, () => {
  it.effect("moves focus to the focused day and back to the trigger, so the field isn't touched until focus leaves", () =>
    Effect.gen(function*() {
      yield* popovers
      yield* BrowserHost.mountEffect(Page, { topLayer: true }, yield* container)
      yield* tick
      byId("trigger").focus()
      yield* open("2026-11-15")
      escape(document.activeElement!)
      yield* tick
      assert.isFalse(shown())
      assert.strictEqual(document.activeElement?.id, "trigger")

      // Escape also closes it from the trigger, as after Shift+Tab out of the popup
      yield* open("2026-11-15")
      byId("trigger").focus()
      escape(byId("trigger"))
      yield* tick
      assert.isFalse(shown())

      yield* open("2026-11-15")
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
      yield* open("2026-11-20")
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
      yield* open("2026-11-20")
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

  for (const topLayer of [true, false]) {
    it.effect(`focus follows open, not the close request (topLayer: ${topLayer})`, () =>
      Effect.gen(function*() {
        yield* popovers
        yield* BrowserHost.mountEffect(Page, { topLayer }, yield* container)
        yield* tick
        byId("trigger").focus()
        send("decline")
        yield* open("2026-11-15")
        // The consumer keeps it open, so focus stays on the day
        escape(document.activeElement!)
        yield* tick
        assert.isTrue(shown())
        assert.strictEqual(document.activeElement?.id, "2026-11-15")
        // The consumer closes it on its own while a day has focus
        send("close")
        yield* tick
        assert.isFalse(shown())
        assert.strictEqual(document.activeElement?.id, "trigger")
        assert.isFalse(touched())
        assert.deepStrictEqual(log(), [
          "RequestedOpen trigger-press",
          "RequestedClose escape-key"
        ])
      }).pipe(Effect.scoped))
  }
})
