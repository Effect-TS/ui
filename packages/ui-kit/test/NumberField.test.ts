import type { Component, Mount } from "@effect/ui"
import { View } from "@effect/ui"
import {
  NumberField,
  type NumberFieldEvents,
  type NumberFieldProps
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof NumberField>
type H = View.Helper<never, NumberFieldProps> & View.Tags<Html.Elements, never>

const standIn = {
  elements: Html,
  view: (numberField: Parts, h: H) =>
    numberField.root(h.div.class("root")).children(
      numberField.scrubArea({ element: h.span.class("scrub") }).children(
        numberField.scrubAreaCursor(h.span.class("cursor"))
      ),
      numberField.group(h.div.class("group")).children(
        numberField.decrement({ element: h.button.class("decrement") }),
        numberField.input(h.input.class("input")),
        numberField.increment({ element: h.button.class("increment") })
      )
    )
}

const root = Locator.attr("class", "root")
const scrub = Locator.attr("class", "scrub")
const cursor = Locator.attr("class", "cursor")
const group = Locator.attr("class", "group")
const input = Locator.attr("class", "input")
const decrement = Locator.attr("class", "decrement")
const increment = Locator.attr("class", "increment")
const formInput = Locator.attr("type", "number")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const idle = {
  text: null,
  pending: false,
  scrubbing: false,
  cursor: false,
  focus: 0,
  ios: false
}
const parts = (props: NumberFieldProps) =>
  Story.parts(NumberField, { model: idle, props })

type Tracked = Mount.Issued<unknown, never, never, unknown> & {
  readonly args: Record<string, unknown>
}
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const tracked = (scene: Rendered, locator: Locator.Locator): Tracked =>
  (scene.get(locator) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)
    ?.mount as unknown as Tracked
const makeScene = (props: NumberFieldProps, view: typeof standIn = standIn) =>
  HtmlScene.make(NumberField, props, view).pipe(
    Effect.map((scene) =>
      scene.expectMount(tracked(scene, input))
        .expectMount(tracked(scene, decrement))
        .expectMount(tracked(scene, increment))
        .expectMount(tracked(scene, scrub))
    )
  )

const updated = (value: number | null, reason: string, direction?: 1 | -1) =>
  (direction === undefined
    ? { _tag: "Updated", value, reason }
    : { _tag: "Updated", value, reason, direction }) as NumberFieldEvents
const committed = (value: number | null, reason: string) =>
  ({ _tag: "Committed", value, reason }) as NumberFieldEvents
const keyed = (
  value: number,
  direction?: 1 | -1
): readonly [NumberFieldEvents, NumberFieldEvents] => [
  updated(value, "keyboard", direction),
  committed(value, "keyboard")
]
const quiet = (
  scene: { readonly current: { readonly emitted: ReadonlyArray<unknown> } }
) => assert.deepStrictEqual(scene.current.emitted, [])
const text = (scene: Rendered) => scene.get(input).props?.value

describe("NumberField", () => {
  it.effect("renders default anatomy, hidden form input, and consumer attribute precedence", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({
        value: 1234.5,
        locale: "en-US",
        name: "amount",
        form: "order",
        min: 0,
        max: 5000
      })
      const id = scene.get(input).attrs?.id
      assert.isString(id)
      assert.deepInclude(scene.get(input).attrs, {
        type: "text",
        inputmode: "numeric",
        autocomplete: "off",
        autocorrect: "off",
        spellcheck: "false",
        form: "order"
      })
      assert.isUndefined(scene.get(input).attrs?.["aria-roledescription"])
      assert.isUndefined(scene.get(input).attrs?.name)
      assert.strictEqual(text(scene), "1,234.5")
      assert.strictEqual(scene.get(group).attrs?.role, "group")
      assert.deepInclude(scene.get(scrub).attrs, {
        role: "presentation",
        style: "touch-action:none;user-select:none;-webkit-user-select:none"
      })
      for (
        const [button, label] of [[decrement, "Decrease"], [
          increment,
          "Increase"
        ]] as const
      ) {
        assert.deepInclude(scene.get(button).attrs, {
          type: "button",
          tabindex: "-1",
          "aria-label": label,
          "aria-controls": id,
          style: "user-select:none;-webkit-user-select:none"
        })
      }
      assert.strictEqual(scene.query(cursor), undefined)
      const activeCursor = Story.parts(NumberField, {
        model: { ...idle, scrubbing: true, cursor: true },
        props: { value: 1234.5 }
      }).scrubAreaCursor(h.span.class("cursor"))
      assert(activeCursor)
      const cursorAttrs = View.build(activeCursor, []).attrs
      assert.strictEqual(cursorAttrs["aria-hidden"], "true")
      assert.isUndefined(cursorAttrs.role)
      const children = scene.get(root).children ?? []
      assert.strictEqual(children[children.length - 1], scene.get(formInput))
      assert.deepInclude(scene.get(formInput).attrs, {
        type: "number",
        name: "amount",
        form: "order",
        min: "0",
        max: "5000",
        step: "1",
        value: "1234.5",
        "aria-hidden": "true",
        tabindex: "-1"
      })
      assert.strictEqual(scene.get(formInput).props?.value, "1234.5")
      scene.props({ value: null, step: "any", required: true })
      assert.deepInclude(scene.get(formInput).attrs, {
        step: "any",
        value: "",
        required: ""
      })
      assert.isUndefined(scene.get(formInput).attrs?.min)

      const custom = yield* makeScene({ value: 5, max: 5, disabled: true }, {
        elements: Html,
        view: (numberField, h) =>
          numberField.root(
            h.div.class("root").attrs({
              "data-disabled": "no",
              "data-scrubbing": "yes"
            })
          ).children(
            numberField.scrubArea({
              element: h.span.class("scrub").attrs({
                role: "button",
                style: "cursor:ew-resize"
              })
            }),
            numberField.group(h.div.class("group").attr("role", "toolbar"))
              .children(
                numberField.decrement({
                  element: h.button.class("decrement").attrs({
                    "aria-label": "Less",
                    tabindex: "0",
                    "aria-controls": "other",
                    type: "submit",
                    style: "color:red"
                  }).disabled(true)
                }),
                numberField.input(
                  h.input.class("input").attrs({
                    id: "amount",
                    type: "number",
                    inputmode: "tel",
                    "aria-roledescription": "Amount",
                    autocomplete: "transaction-amount",
                    readonly: "",
                    "aria-disabled": "true"
                  }).value("nine").disabled(false)
                ),
                numberField.increment({
                  element: h.button.class("increment").attr(
                    "aria-disabled",
                    "false"
                  )
                })
              )
          )
      })
      assert.strictEqual(custom.get(root).attrs?.["data-disabled"], "")
      assert.isUndefined(custom.get(root).attrs?.["data-scrubbing"])
      assert.deepInclude(custom.get(scrub).attrs, {
        role: "presentation",
        style:
          "cursor:ew-resize;touch-action:none;user-select:none;-webkit-user-select:none"
      })
      assert.strictEqual(custom.get(group).attrs?.role, "group")
      assert.deepInclude(custom.get(decrement).attrs, {
        "aria-label": "Less",
        tabindex: "-1",
        "aria-controls": "amount",
        type: "button",
        style: "color:red;user-select:none;-webkit-user-select:none"
      })
      assert.isUndefined(custom.get(decrement).attrs?.disabled)
      assert.strictEqual(custom.get(increment).attrs?.["aria-disabled"], "true")
      assert.deepInclude(custom.get(input).attrs, {
        id: "amount",
        type: "text",
        inputmode: "numeric",
        "aria-roledescription": "Amount",
        autocomplete: "transaction-amount",
        disabled: ""
      })
      assert.isUndefined(custom.get(input).attrs?.readonly)
      assert.isUndefined(custom.get(input).attrs?.["aria-disabled"])
      assert.strictEqual(text(custom), "5")

      custom.props({ value: 5, max: 5, disabled: false })
      assert.isUndefined(custom.get(input).attrs?.disabled)
      assert.isUndefined(custom.get(input).attrs?.["aria-disabled"])
    }))

  it.effect("propagates state attributes, bound disabled states, part state, and element guards", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({
        value: 5,
        min: 0,
        max: 5,
        required: true
      })
      const all = [root, group, input, decrement, increment, scrub]
      for (const part of all) {
        assert.strictEqual(scene.get(part).attrs?.["data-required"], "")
      }
      assert.deepInclude(scene.get(increment).attrs, {
        "aria-disabled": "true",
        "data-disabled": ""
      })
      assert.isUndefined(scene.get(decrement).attrs?.["aria-disabled"])

      scene.props({ value: 0, min: 0, max: 5 })
      assert.deepInclude(scene.get(decrement).attrs, {
        "aria-disabled": "true",
        "data-disabled": ""
      })
      assert.isUndefined(scene.get(increment).attrs?.["aria-disabled"])

      scene.props({ value: 2, min: 0, max: 5, readOnly: true })
      for (const part of all) {
        assert.strictEqual(scene.get(part).attrs?.["data-readonly"], "")
      }
      assert.strictEqual(scene.get(input).attrs?.readonly, "")
      for (const button of [decrement, increment]) {
        assert.strictEqual(scene.get(button).attrs?.["aria-disabled"], "true")
      }

      scene.props({ value: 2, disabled: true })
      for (const part of all) {
        assert.strictEqual(scene.get(part).attrs?.["data-disabled"], "")
      }
      assert.strictEqual(scene.get(input).attrs?.disabled, "")
      assert.strictEqual(scene.get(formInput).attrs?.disabled, "")

      const own = yield* makeScene({ value: 2 }, {
        elements: Html,
        view: (numberField, h) =>
          numberField.root(h.div.class("root")).children(
            numberField.scrubArea({ element: h.span.class("scrub") }),
            numberField.decrement({
              element: h.button.class("decrement"),
              disabled: true
            }),
            numberField.input(h.input.class("input")),
            numberField.increment({ element: h.button.class("increment") })
          )
      })
      assert.deepInclude(own.get(decrement).attrs, {
        "aria-disabled": "true",
        "data-disabled": ""
      })
      for (const part of [root, input, increment]) {
        assert.isUndefined(own.get(part).attrs?.["data-disabled"])
      }

      const numberField = parts({
        value: 1234.5,
        locale: "de-DE",
        readOnly: true,
        required: true
      })
      assert.deepInclude(numberField, {
        value: 1234.5,
        inputValue: "1.234,5",
        disabled: false,
        readOnly: true,
        required: true,
        scrubbing: false
      })
      assert.throws(
        () => numberField.input(h.div as any),
        /a part for <input> was given <div>/
      )
      assert.throws(
        () => numberField.increment({ element: h.div as any }),
        /a part for <button> was given <div>/
      )
    }))

  it.effect("steps with keyboard modifiers, bounds, empty start, floating-point precision, and snapOnStep", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ value: 5, locale: "en-US" })
      scene.keydown(input, "ArrowUp").emitted(...keyed(6, 1))
        .expectDefaultPrevented()
      scene.keydown(input, "ArrowDown").emitted(...keyed(4, -1))
        .expectDefaultPrevented()
      scene.keydown(input, "ArrowUp", { shift: true }).emitted(...keyed(15, 1))
      scene.keydown(input, "ArrowDown", { alt: true }).emitted(
        ...keyed(4.9, -1)
      )

      scene.props({ value: 5, step: 0.25, smallStep: 0.01, largeStep: 100 })
      scene.keydown(input, "ArrowUp").emitted(...keyed(5.25, 1))
      scene.keydown(input, "ArrowUp", { shift: true }).emitted(...keyed(105, 1))
      scene.keydown(input, "ArrowDown", { alt: true }).emitted(
        ...keyed(4.99, -1)
      )

      scene.props({ value: 5, step: "any" })
      scene.keydown(input, "ArrowUp").emitted(...keyed(6, 1))

      scene.props({ value: 9, min: 0, max: 10 })
      scene.keydown(input, "Home").emitted(...keyed(0)).expectDefaultPrevented()
      scene.keydown(input, "End").emitted(...keyed(10)).expectDefaultPrevented()
      scene.keydown(input, "ArrowUp", { shift: true }).emitted(...keyed(10, 1))
      scene.keydown(input, "ArrowUp", { ctrl: true }).expectIgnored()
        .expectDefaultPrevented(false)
      scene.fire(input, "keydown", {
        key: "ArrowUp",
        shift: false,
        ctrl: false,
        alt: false,
        meta: false,
        composing: true
      })
        .expectIgnored()
      scene.keydown(input, "PageUp").expectIgnored().expectDefaultPrevented(
        false
      )
      scene.props({ value: 10, min: 0, max: 10 })
      scene.keydown(input, "ArrowUp").expectHandled()
      quiet(scene)
      scene.props({ value: 5, max: 10 })
      scene.keydown(input, "Home").expectIgnored().expectDefaultPrevented(false)

      scene.props({ value: null })
      assert.strictEqual(text(scene), "")
      scene.keydown(input, "ArrowUp").emitted(...keyed(0))
      scene.props({ value: null, min: 5 })
      scene.keydown(input, "ArrowDown").emitted(...keyed(5))

      scene.props({ value: 0.1, step: 0.2 })
      scene.keydown(input, "ArrowUp").emitted(...keyed(0.3, 1))
      scene.props({ value: 3, step: 5, min: 2, snapOnStep: true })
      scene.keydown(input, "ArrowUp").emitted(...keyed(7, 1))
      scene.props({ value: 1.26, smallStep: 0.5, snapOnStep: true })
      scene.keydown(input, "ArrowUp", { alt: true }).emitted(...keyed(2, 1))
      scene.props({ value: 5, step: 5, max: 8, snapOnStep: true })
      scene.keydown(input, "ArrowUp").emitted(...keyed(8, 1))
    }))

  it.effect("handles typing, clearing, invalid input, range clamping, rounding, and blur commit", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ value: 5, locale: "en-US" })
      scene.blur(input)
      quiet(scene)
      scene.type(input, "1,234.50").emitted(updated(1234.5, "input-change"))
      assert.strictEqual(text(scene), "1,234.50")
      scene.props({ value: 1234.5, locale: "en-US" })
      assert.strictEqual(text(scene), "1,234.50")
      scene.blur(input).emitted(committed(1234.5, "input-blur"))
      assert.strictEqual(text(scene), "1,234.5")
      scene.blur(input)
      quiet(scene)

      scene.type(input, "1234.5").emitted(updated(1234.5, "input-change"))
      scene.type(input, "").emitted(updated(null, "input-clear"))
      scene.props({ value: null, locale: "en-US" })
      scene.blur(input).emitted(committed(null, "input-clear"))

      scene.props({ value: 5, locale: "en-US" })
      scene.type(input, "12a").expectHandled()
      quiet(scene)
      scene.type(input, "$12")
      quiet(scene)
      scene.type(input, "-").expectHandled()
      scene.blur(input).expectHandled()
      quiet(scene)
      assert.strictEqual(text(scene), "5")

      scene.type(input, "20").emitted(updated(20, "input-change"))
      scene.keydown(input, "ArrowDown").emitted(...keyed(19, -1))
      assert.strictEqual(text(scene), "5")

      scene.props({ value: 5, min: 0, max: 10 })
      scene.type(input, "50").emitted(updated(10, "input-change"))
      scene.props({ value: 5, min: 0, max: 10, allowOutOfRange: true })
      scene.type(input, "50").emitted(updated(50, "input-change"))
      scene.props({ value: 50, min: 0, max: 10, allowOutOfRange: true })
      scene.keydown(input, "ArrowUp").emitted(...keyed(10, 1))

      const rounded = yield* makeScene({
        value: 1,
        locale: "en-US",
        format: { maximumFractionDigits: 2 }
      })
      rounded.type(input, "1.239").emitted(updated(1.24, "input-change"))
      assert.strictEqual(text(rounded), "1.239")
      rounded.props({
        value: 1.24,
        locale: "en-US",
        format: { maximumFractionDigits: 2 }
      })
      rounded.blur(input).emitted(committed(1.24, "input-blur"))
      assert.strictEqual(text(rounded), "1.24")
      rounded.props({
        value: 2.555,
        locale: "en-US",
        format: { maximumFractionDigits: 2 }
      })
      assert.strictEqual(text(rounded), "2.56")
      rounded.blur(input).emitted(
        updated(2.56, "input-blur"),
        committed(2.56, "input-blur")
      )
    }))

  it.effect("formats and parses locales, non-Latin numbering systems, and percent, currency, and unit styles", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ value: 1234.5, locale: "de-DE" })
      assert.strictEqual(text(scene), "1.234,5")
      scene.type(input, "2.345,75").emitted(updated(2345.75, "input-change"))
      scene.props({ value: 1234.5, locale: "fr-FR" })
      scene.blur(input).emitted(updated(2345.75, "input-blur"))
      assert.match(text(scene) as string, /^1\s234,5$/)
      scene.type(input, "9 876,5").emitted(updated(9876.5, "input-change"))
      scene.props({ value: 1234.5, locale: "de-CH" })
      scene.type(input, "1'234.25").emitted(updated(1234.25, "input-change"))
      scene.props({ value: 1234.5, locale: "en-IN" })
      scene.type(input, "12,34,567").emitted(updated(1234567, "input-change"))

      const ar = yield* makeScene({ value: 1234.5, locale: "ar-EG" })
      assert.strictEqual(text(ar), "١٬٢٣٤٫٥")
      ar.type(input, "٢٬٣٤٥٫٧٥").emitted(updated(2345.75, "input-change"))
      ar.type(input, "۱۲۳").emitted(updated(123, "input-change"))
      ar.type(input, "１２３．５").emitted(updated(123.5, "input-change"))
      ar.type(input, "一二三").emitted(updated(123, "input-change"))
      ar.type(input, "−4").emitted(updated(-4, "input-change"))

      const pct = yield* makeScene({
        value: 0.5,
        locale: "en-US",
        format: { style: "percent" }
      })
      assert.strictEqual(text(pct), "50%")
      pct.type(input, "25%").emitted(updated(0.25, "input-change"))
      pct.type(input, "5‰").emitted(updated(0.005, "input-change"))
      pct.props({
        value: 50,
        locale: "en-US",
        format: { style: "unit", unit: "percent" }
      })
      pct.blur(input).emitted(updated(0.005, "input-blur"))
      assert.strictEqual(text(pct), "50%")
      pct.type(input, "25%").emitted(updated(25, "input-change"))

      const eur = yield* makeScene({
        value: 1234.5,
        locale: "de-DE",
        format: { style: "currency", currency: "EUR" }
      })
      assert.match(text(eur) as string, /^1\.234,50\s€$/)
      eur.type(input, "99,90 €").emitted(updated(99.9, "input-change"))

      const speed = yield* makeScene({
        value: 12,
        locale: "en-US",
        format: { style: "unit", unit: "kilometer-per-hour" }
      })
      assert.strictEqual(text(speed), "12 km/h")
      speed.type(input, "80 km/h").emitted(updated(80, "input-change"))

      const debt = yield* makeScene({
        value: -12,
        locale: "en-US",
        format: {
          style: "currency",
          currency: "USD",
          currencySign: "accounting"
        }
      })
      assert.strictEqual(text(debt), "($12.00)")
      debt.type(input, "($7.50)").emitted(updated(-7.5, "input-change"))
    }))

  it.effect("ignores input when disabled or read-only", () =>
    Effect.gen(function*() {
      for (const lock of [{ disabled: true }, { readOnly: true }]) {
        const scene = yield* makeScene({ value: 5, ...lock })
        scene.keydown(input, "ArrowUp").expectIgnored()
        scene.fire(input, "input", { value: "9" }).expectHandled()
        scene.fire(formInput, "change", { value: "9" })
        scene.fire(input, "blur", {})
        quiet(scene)
        assert.strictEqual(text(scene), "5")
      }
    }))

  it.effect("handles hidden form input autofill and iOS inputmode", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ value: 5, max: 10 })
      scene.change(formInput, "7.5").emitted(updated(7.5, "none"))
      scene.change(formInput, "70").emitted(updated(10, "none"))
      scene.change(formInput, "").emitted(updated(null, "none"))
      scene.change(formInput, "5")
      quiet(scene)
      scene.props({ value: 5, min: 0 })
      scene.mounted(tracked(scene, input), { _tag: "DetectedIOS" } as never)
      assert.strictEqual(scene.get(input).attrs?.inputmode, "decimal")
      scene.props({ value: 5, min: -1 })
      assert.strictEqual(scene.get(input).attrs?.inputmode, "text")
    }))
})
