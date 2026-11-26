import type { Component, Mount, View } from "@effect/ui"
import {
  Calendar,
  DateField,
  DatePicker,
  type DatePickerEvents,
  type DatePickerProps
} from "@effect/ui-kit"
import { Html, HtmlCommand } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { DateTime, Effect } from "effect"

type Parts = Component.Headless.Parts<typeof DatePicker>
type H = View.Helper<never, DatePickerProps> & View.Tags<Html.Elements, never>

const standIn = {
  elements: Html,
  view: (datePicker: Parts, h: H) =>
    h.div(
      datePicker.input(h.input.class("input")),
      datePicker.trigger(
        h.button.attrs({
          class: "trigger",
          type: "submit",
          "aria-expanded": "x",
          "data-popup-open": "x"
        })
      ),
      datePicker.positioner(h.div.class("positioner")).children(
        datePicker.popup(h.div.attrs({ class: "popup", role: "x" })).children(
          datePicker.grid(h.table.class("grid")).children(
            h.tbody(
              ...datePicker.weeks.map((week) =>
                h.tr(
                  ...week.map((date) =>
                    datePicker.cell({
                      element: h.td.attr(
                        "data-cell",
                        DateTime.formatIsoDateUtc(date)
                      ),
                      date
                    }).children(
                      datePicker.day({ element: h.button, date }).children(
                        DateTime.formatIsoDateUtc(date)
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
}

type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
type Track = Mount.Issued<unknown, never, never, unknown>

const utc = (iso: string) => DateTime.makeUnsafe(iso + "T00:00:00Z")
const input = Locator.attr("class", "input")
const trigger = Locator.attr("class", "trigger")
const positioner = Locator.attr("class", "positioner")
const popup = Locator.attr("class", "popup")
const grid = Locator.attr("class", "grid")
const day = (iso: string) => Locator.text(iso, { exact: true })
const tracked = (scene: Rendered): Track =>
  (scene.get(positioner) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)?.mount as unknown as Track
const sent = (tag: string) => ({ _tag: tag }) as never
const props = (more: Partial<DatePickerProps> = {}): DatePickerProps => ({
  value: utc("2026-11-15"),
  open: false,
  month: utc("2026-11-01"),
  today: utc("2026-11-26"),
  locale: "en-GB",
  ...more
})
const opened: DatePickerEvents = {
  _tag: "RequestedOpen",
  reason: "trigger-press"
}
const closed = (reason: string) =>
  ({ _tag: "RequestedClose", reason }) as DatePickerEvents
const picked = (date: DateTime.Utc | null): DatePickerEvents => ({
  _tag: "Picked",
  date
})
const month = (iso: string): DatePickerEvents => ({
  _tag: "RequestedMonth",
  month: utc(iso)
})
const focusedTrigger = <
  S extends { readonly resolve: (...args: ReadonlyArray<any>) => S }
>(
  scene: S
): S => scene.resolve(HtmlCommand.Focus, { found: true })
const quiet = (
  scene: { readonly current: { readonly emitted: ReadonlyArray<unknown> } }
) => assert.deepStrictEqual(scene.current.emitted, [])

describe("DatePicker", () => {
  it.effect("asks to open from the trigger, and to close from it, Escape, a press or focus outside, or a picked day", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(DatePicker, props(), standIn)
      assert.deepInclude(scene.get(trigger).attrs, {
        type: "button",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
        "aria-label": "Choose date"
      })
      assert.isUndefined(scene.get(trigger).attrs?.["data-popup-open"])
      assert.isUndefined(scene.get(trigger).attrs?.["aria-controls"])
      assert.deepInclude(scene.get(positioner).attrs, {
        role: "presentation",
        "data-closed": "",
        "data-side": "bottom",
        "data-align": "start"
      })
      assert.strictEqual(scene.get(popup).attrs?.role, "dialog")
      scene.click(trigger).emitted(opened)

      scene.props(props({ open: true })).expectMount(tracked(scene))
      assert.deepInclude(scene.get(trigger).attrs, {
        "aria-expanded": "true",
        "aria-controls": scene.get(popup).attrs?.id,
        "data-popup-open": ""
      })
      assert.deepInclude(scene.get(positioner).attrs, { "data-open": "" })
      scene.click(trigger).emitted(closed("trigger-press"))
      scene.mounted(tracked(scene), sent("PressedEscape")).emitted(
        closed("escape-key")
      )
      focusedTrigger(scene)
      // A press outside leaves focus where the press put it
      scene.mounted(tracked(scene), sent("PressedOutside")).emitted(
        closed("outside-press")
      )
      scene.mounted(tracked(scene), sent("FocusedOutside")).emitted(
        closed("focus-out")
      )
      assert.deepStrictEqual(scene.current.pending, [])
      scene.childEmit(Calendar, { _tag: "Picked", date: utc("2026-11-20") })
        .emitted(picked(utc("2026-11-20")), closed("day-press"))
      focusedTrigger(scene)
      // A day of the next month asks for that month too
      scene.childEmit(Calendar, { _tag: "Picked", date: utc("2026-12-01") })
        .emitted(
          picked(utc("2026-12-01")),
          month("2026-12-01"),
          closed("day-press")
        )
      focusedTrigger(scene)
      scene.childEmit(Calendar, {
        _tag: "RequestedMonth",
        month: utc("2026-10-01")
      }).emitted(
        month("2026-10-01")
      )
    }))

  it.effect("a typed date outside the shown month also asks for that month", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(DatePicker, props(), standIn)
      const committed = (date: DateTime.Utc | null) =>
        scene.childEmit(DateField, { _tag: "Committed", date })
      committed(utc("2027-01-03")).emitted(
        picked(utc("2027-01-03")),
        month("2027-01-01")
      )
      committed(utc("2026-11-20")).emitted(picked(utc("2026-11-20")))
      committed(null).emitted(picked(null))
    }))

  it.effect("a Zoned value and month show their local day, not their UTC day", () =>
    Effect.gen(function*() {
      // 02:00Z on Dec 1 is still Nov 30 in Los Angeles
      const lateNovember = DateTime.makeZonedUnsafe("2026-12-01T02:00:00Z", {
        timeZone: "America/Los_Angeles"
      })
      const scene = yield* HtmlScene.make(
        DatePicker,
        props({ value: lateNovember, month: lateNovember, locale: "en-US" }),
        standIn
      )
      assert.strictEqual(scene.get(input).props?.value, "11/30/2026")
      assert.strictEqual(
        scene.get(Locator.attr("data-cell", "2026-11-30"))
          .attrs?.["aria-selected"],
        "true"
      )
      // Nov 30 is in the shown month, so no other month is asked for
      scene.childEmit(Calendar, { _tag: "Picked", date: utc("2026-11-30") })
        .emitted(picked(utc("2026-11-30")), closed("day-press"))
      focusedTrigger(scene)
    }))

  it.effect("disabled, it disables every control and asks for nothing", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        DatePicker,
        props({ open: true, disabled: true }),
        standIn
      ).pipe(Effect.map((scene) => scene.expectMount(tracked(scene))))
      assert.deepInclude(scene.get(trigger).attrs, {
        disabled: "",
        "data-disabled": ""
      })
      assert.strictEqual(scene.get(input).attrs?.disabled, "")
      assert.strictEqual(scene.get(day("2026-11-20")).attrs?.disabled, "")
      scene.mounted(tracked(scene), sent("PressedEscape"))
      scene.mounted(tracked(scene), sent("PressedOutside"))
      scene.mounted(tracked(scene), sent("FocusedOutside"))
      quiet(scene)
    }))

  it.effect("read-only, it still opens and closes, and its input and calendar are read-only", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        DatePicker,
        props({ readOnly: true }),
        standIn
      )
      assert.deepInclude(scene.get(trigger).attrs, { "data-readonly": "" })
      assert.isUndefined(scene.get(trigger).attrs?.disabled)
      assert.strictEqual(scene.get(input).attrs?.readonly, "")
      assert.strictEqual(scene.get(grid).attrs?.["aria-readonly"], "true")
      scene.click(trigger).emitted(opened)
      scene.props(props({ readOnly: true, open: true })).expectMount(
        tracked(scene)
      )
      scene.mounted(tracked(scene), sent("PressedEscape")).emitted(
        closed("escape-key")
      )
      focusedTrigger(scene)
    }))
})
