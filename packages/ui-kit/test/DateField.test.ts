import { type Component, UiSchema, type View } from "@effect/ui"
import {
  DateField,
  type DateFieldEvents,
  type DateFieldProps,
  Field
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlPlay, HtmlScene } from "@effect/ui/html/testing"
import { Locator, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { DateTime, Effect, Schema } from "effect"

type Parts = Component.Headless.Parts<typeof DateField>
type H = View.Helper<never, DateFieldProps> & View.Tags<Html.Elements, never>

const standIn = {
  elements: Html,
  view: (dateField: Parts, h: H) =>
    h.div(
      dateField.input(h.input.class("input")).attr(
        "placeholder",
        dateField.pattern
      )
    )
}

const input = Locator.attr("class", "input")
const hiddenInput = Locator.attr("type", "hidden")
const utc = (iso: string): DateTime.Utc => DateTime.makeUnsafe(iso)
const committed = (date: DateTime.Utc | null): DateFieldEvents => ({
  _tag: "Committed",
  date
})
const quiet = (
  scene: { readonly current: { readonly emitted: ReadonlyArray<unknown> } }
) => assert.deepStrictEqual(scene.current.emitted, [])
const text = (
  scene: { readonly get: (locator: Locator.Locator) => Locator.Node }
) => scene.get(input).props?.value

describe("DateField", () => {
  it.effect("parses locale numeric orders and ISO on blur and Enter, rejecting invalid days and two-digit years", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        DateField,
        { value: null, locale: "en-GB" },
        standIn
      )
      assert.strictEqual(scene.get(input).attrs?.placeholder, "dd/mm/yyyy")
      scene.type(input, "26/11/2026")
      quiet(scene)
      scene.blur(input).emitted(committed(utc("2026-11-26")))

      // en-US mm/dd/yyyy on Enter, then blur does not commit again
      scene.props({ value: utc("2026-11-26"), locale: "en-US" })
      assert.strictEqual(text(scene), "11/26/2026")
      scene.type(input, "3/5/2026")
      scene.keydown(input, "Enter").emitted(committed(utc("2026-03-05")))
      scene.props({ value: utc("2026-03-05"), locale: "en-US" })
      scene.blur(input)
      quiet(scene)

      scene.type(input, "2024-02-29")
      scene.blur(input).emitted(committed(utc("2024-02-29")))

      scene.props({ value: utc("2026-11-26"), locale: "en-GB" })
      for (const bad of ["31/02/2026", "26/11/26"]) {
        scene.type(input, bad)
        scene.keydown(input, "Enter")
        scene.blur(input)
        quiet(scene)
        assert.strictEqual(text(scene), "26/11/2026")
      }

      scene.type(input, "")
      scene.blur(input).emitted(committed(null))
    }))

  it.effect("reads back the text it displays, including a locale suffix and early years", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        DateField,
        { value: utc("2026-11-26"), locale: "bg" },
        standIn
      )
      assert.strictEqual(text(scene), "26.11.2026 г.")
      scene.type(input, "27.11.2026 г.")
      scene.blur(input).emitted(committed(utc("2026-11-27")))

      // ky prints yyyy-dd-mm, so it shows "/" to keep "-" for ISO
      scene.props({ value: utc("2026-03-05"), locale: "ky" })
      assert.strictEqual(text(scene), "2026/05/03")
      assert.strictEqual(scene.get(input).attrs?.placeholder, "yyyy/dd/mm")
      scene.type(input, "2026/06/03")
      scene.blur(input).emitted(committed(utc("2026-03-06")))
      scene.type(input, "2026-03-07")
      scene.blur(input).emitted(committed(utc("2026-03-07")))

      scene.props({ value: utc("0007-11-26"), locale: "en-GB" })
      assert.strictEqual(text(scene), "26/11/0007")
      scene.type(input, "27/11/0007")
      scene.blur(input).emitted(committed(utc("0007-11-27")))

      scene.props({ value: utc("0000-11-26"), locale: "en-GB" })
      assert.strictEqual(text(scene), "26/11/0000")
    }))

  it.effect("displays a Zoned value's local day as a normalized Utc and renders the hidden ISO input", () =>
    Effect.gen(function*() {
      // 2026-11-26T23:30:00Z is 2026-11-27 08:30 in Asia/Tokyo
      const tokyo = DateTime.makeZonedUnsafe("2026-11-26T23:30:00Z", {
        timeZone: "Asia/Tokyo"
      })
      const scene = yield* HtmlScene.make(
        DateField,
        { value: tokyo, locale: "en-GB", name: "due" },
        standIn
      )
      assert.strictEqual(text(scene), "27/11/2026")
      assert.isUndefined(scene.get(input).attrs?.name)
      assert.deepInclude(scene.get(hiddenInput).attrs, {
        name: "due",
        value: "2026-11-27"
      })

      const parts = Story.parts(DateField, {
        model: { draft: null },
        props: { value: tokyo, locale: "en-GB" }
      })
      assert.isTrue(
        parts.value !== null &&
          DateTime.isUtc(parts.value) &&
          DateTime.formatIsoDateUtc(parts.value) === "2026-11-27"
      )

      scene.props({ value: tokyo, locale: "en-GB" })
      assert.isUndefined(scene.query(hiddenInput))
    }))

  it.effect("suppresses interaction and form submission when disabled", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        DateField,
        {
          value: utc("2026-11-26"),
          locale: "en-GB",
          name: "due",
          disabled: true
        },
        standIn
      )
      assert.strictEqual(scene.get(input).attrs?.disabled, "")
      assert.strictEqual(scene.get(hiddenInput).attrs?.disabled, "")

      scene.type(input, "01/01/2027")
      scene.keydown(input, "Enter").expectIgnored()
      scene.blur(input)
      quiet(scene)
      assert.strictEqual(text(scene), "26/11/2026")

      // Disabling while editing drops the draft, so re-enabling starts clean
      scene.props({ value: utc("2026-11-26"), locale: "en-GB" })
      scene.type(input, "01/01")
      scene.props({ value: utc("2026-11-26"), locale: "en-GB", disabled: true })
      scene.subscription("lostFocus", {
        _tag: "BlurredInput",
        disabled: true
      })
      scene.props({ value: utc("2026-11-26"), locale: "en-GB" })
      assert.strictEqual(text(scene), "26/11/2026")
    }))

  it.effect("keeps input focusable while read-only and suppresses commits", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        DateField,
        {
          value: utc("2026-11-26"),
          locale: "en-GB",
          readOnly: true
        },
        standIn
      )
      assert.strictEqual(scene.get(input).attrs?.readonly, "")
      assert.isUndefined(scene.get(input).attrs?.disabled)

      scene.type(input, "01/01/2027")
      scene.keydown(input, "Enter").expectIgnored()
      scene.blur(input)
      quiet(scene)
      assert.strictEqual(text(scene), "26/11/2026")
    }))

  it.effect("leaves aria-invalid to Field", () =>
    Effect.gen(function*() {
      const Msg = UiSchema.TaggedEnum({
        Committed: { date: Schema.NullOr(Schema.DateTimeUtc) }
      })
      const Consumer = Html.component({
        name: "Consumer",
        model: Schema.Struct({ date: Schema.NullOr(Schema.DateTimeUtc) }),
        message: Msg
      }).make({
        init: () => ({ date: null }),
        update: { Committed: ($, { date }) => $.evolve({ date }) },
        view: (h, model) =>
          Field(h, {
            props: { invalid: model.date === null },
            view: (field) =>
              DateField(h, {
                props: { value: model.date, locale: "en-GB" },
                onEmit: { Committed: ({ date }) => Msg.Committed({ date }) },
                view: (dateField) =>
                  field.root(h.div).children(
                    dateField.input(field.control(h.input.class("input")))
                  )
              })
          })
      })

      const play = yield* HtmlPlay.make(Consumer, {})
      assert.strictEqual(play.root.get(input).attrs?.["aria-invalid"], "true")

      yield* play.fire(input, "focus")
      yield* play.type(input, "26/11/2026")
      yield* play.blur(input)
      assert.isUndefined(play.root.get(input).attrs?.["aria-invalid"])

      // Bad text does not make DateField write aria-invalid when Field is valid
      yield* play.fire(input, "focus")
      yield* play.type(input, "31/02/2026")
      assert.isUndefined(play.root.get(input).attrs?.["aria-invalid"])
      yield* play.blur(input)
      assert.isUndefined(play.root.get(input).attrs?.["aria-invalid"])
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))
})
