import { type Component, UiSchema, View } from "@effect/ui"
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
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

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
      assert.strictEqual(text(scene), "")
      assert.strictEqual(scene.get(input).attrs?.placeholder, "dd/mm/yyyy")

      // en-GB dd/mm/yyyy on blur
      scene.fire(input, "focus")
      scene.type(input, "26/11/2026")
      quiet(scene)
      assert.strictEqual(text(scene), "26/11/2026")
      scene.blur(input).emitted(committed(utc("2026-11-26")))

      // en-US mm/dd/yyyy on Enter, then blur does not double-commit
      scene.props({ value: utc("2026-11-26"), locale: "en-US" })
      assert.strictEqual(text(scene), "11/26/2026")
      assert.strictEqual(scene.get(input).attrs?.placeholder, "mm/dd/yyyy")
      scene.fire(input, "focus")
      scene.type(input, "3/5/2026")
      scene.keydown(input, "Enter").emitted(committed(utc("2026-03-05")))
      scene.props({ value: utc("2026-03-05"), locale: "en-US" })
      assert.strictEqual(text(scene), "03/05/2026")
      scene.blur(input)
      quiet(scene)

      // ISO YYYY-MM-DD accepted in non-ISO locale
      scene.fire(input, "focus")
      scene.type(input, "2024-02-29")
      scene.blur(input).emitted(committed(utc("2024-02-29")))

      // Non-existent days and two-digit years commit nothing and revert on blur
      scene.props({ value: utc("2026-11-26"), locale: "en-GB" })
      for (
        const bad of ["31/02/2026", "29/02/2026", "26/11/26", "not a date"]
      ) {
        scene.fire(input, "focus")
        scene.type(input, bad)
        scene.keydown(input, "Enter")
        quiet(scene)
        assert.strictEqual(text(scene), bad)
        scene.blur(input)
        quiet(scene)
        assert.strictEqual(text(scene), "26/11/2026")
      }
    }))

  it.effect("commits null when cleared and keeps quiet on unchanged blur", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        DateField,
        { value: utc("2026-11-26"), locale: "en-GB" },
        standIn
      )
      scene.fire(input, "focus")
      scene.blur(input)
      quiet(scene)

      scene.fire(input, "focus")
      scene.type(input, "")
      scene.blur(input).emitted(committed(null))

      scene.props({ value: null, locale: "en-GB" })
      assert.strictEqual(text(scene), "")
      scene.fire(input, "focus")
      scene.type(input, "   ")
      scene.blur(input)
      quiet(scene)
    }))

  it.effect("displays a Zoned value's local day, normalizes part value, and renders the hidden ISO input", () =>
    Effect.gen(function*() {
      // 2026-11-26T23:30:00Z is 2026-11-27 08:30 in Asia/Tokyo
      const tokyo = DateTime.makeZonedUnsafe("2026-11-26T23:30:00Z", {
        timeZone: "Asia/Tokyo"
      })
      const scene = yield* HtmlScene.make(
        DateField,
        { value: tokyo, locale: "en-GB", name: "due", form: "booking" },
        standIn
      )
      assert.strictEqual(text(scene), "27/11/2026")
      assert.isUndefined(scene.get(input).attrs?.name)
      assert.strictEqual(scene.get(input).attrs?.form, "booking")
      assert.deepInclude(scene.get(hiddenInput).attrs, {
        type: "hidden",
        name: "due",
        form: "booking",
        value: "2026-11-27"
      })
      assert.strictEqual(scene.get(hiddenInput).props?.value, "2026-11-27")

      const parts = Story.parts(DateField, {
        model: { draft: null, focused: false },
        props: { value: tokyo, locale: "en-GB" }
      })
      assert.isTrue(
        parts.value !== null &&
          DateTime.isUtc(parts.value) &&
          DateTime.formatIsoDateUtc(parts.value) === "2026-11-27"
      )
      assert.strictEqual(parts.pattern, "dd/mm/yyyy")
      assert.strictEqual(parts.inputValue, "27/11/2026")
      assert.throws(
        () => parts.input(h.div as any),
        /a part for <input> was given <div>/
      )

      // Clearing value empties the hidden input; omitting name removes it
      scene.props({ value: null, locale: "en-GB", name: "due" })
      assert.strictEqual(scene.get(hiddenInput).attrs?.value, "")
      scene.props({ value: null, locale: "en-GB" })
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
      assert.deepInclude(scene.get(input).attrs, {
        disabled: "",
        "data-disabled": ""
      })
      assert.isUndefined(scene.get(input).attrs?.["aria-disabled"])
      assert.strictEqual(scene.get(hiddenInput).attrs?.disabled, "")

      scene.fire(input, "focus")
      scene.type(input, "01/01/2027")
      scene.keydown(input, "Enter").expectIgnored()
      scene.blur(input)
      quiet(scene)
      assert.strictEqual(text(scene), "26/11/2026")

      // Disabling while editing clears draft and focus so re-enabling starts clean
      scene.props({ value: utc("2026-11-26"), locale: "en-GB" })
      scene.fire(input, "focus")
      scene.type(input, "01/01")
      assert.strictEqual(text(scene), "01/01")
      scene.props({ value: utc("2026-11-26"), locale: "en-GB", disabled: true })
      assert.strictEqual(text(scene), "26/11/2026")
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
      assert.deepInclude(scene.get(input).attrs, {
        readonly: "",
        "data-readonly": ""
      })
      assert.isUndefined(scene.get(input).attrs?.disabled)

      scene.fire(input, "focus").expectHandled()
      scene.type(input, "01/01/2027")
      scene.keydown(input, "Enter").expectIgnored()
      scene.blur(input)
      quiet(scene)
      assert.strictEqual(text(scene), "26/11/2026")
    }))

  it.effect("leaves aria-invalid to Field and preserves owned attribute precedence", () =>
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
                props: {
                  value: model.date,
                  locale: "en-GB",
                  name: "dob",
                  required: true,
                  disabled: field.disabled
                },
                onEmit: { Committed: ({ date }) => Msg.Committed({ date }) },
                view: (dateField) =>
                  field.root(h.div).children(
                    field.label(h.label).children("Birth date"),
                    dateField.input(
                      field.control(
                        h.input.class("input").attrs({
                          type: "date",
                          name: "wrong",
                          readonly: "",
                          "aria-disabled": "true",
                          "data-disabled": "yes",
                          autocomplete: "bday"
                        }).disabled(true)
                      )
                    ),
                    field.error(h.div)?.children("Required")
                  )
              })
          })
      })

      const play = yield* HtmlPlay.make(Consumer, {})
      const attrs = play.root.get(input).attrs
      assert.deepInclude(attrs, {
        type: "text",
        required: "",
        "data-required": "",
        "aria-invalid": "true",
        autocomplete: "bday"
      })
      assert.isUndefined(attrs?.name)
      assert.isUndefined(attrs?.disabled)
      assert.isUndefined(attrs?.readonly)
      assert.isUndefined(attrs?.["aria-disabled"])
      assert.isUndefined(attrs?.["data-disabled"])
      assert.strictEqual(
        play.root.get(Locator.tag("label")).attrs?.for,
        attrs?.id
      )

      // Committing a valid date clears Field's invalid state
      yield* play.fire(input, "focus")
      yield* play.type(input, "26/11/2026")
      yield* play.blur(input)
      assert.isUndefined(play.root.get(input).attrs?.["aria-invalid"])
      assert.strictEqual(play.root.get(input).attrs?.["data-touched"], "")
      assert.strictEqual(text(play.root), "26/11/2026")

      // Bad text does not make DateField write aria-invalid when Field is valid
      yield* play.fire(input, "focus")
      yield* play.type(input, "31/02/2026")
      assert.isUndefined(play.root.get(input).attrs?.["aria-invalid"])
      yield* play.blur(input)
      assert.isUndefined(play.root.get(input).attrs?.["aria-invalid"])
      assert.strictEqual(text(play.root), "26/11/2026")
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))
})
