import type { Component, Mount } from "@effect/ui"
import { View } from "@effect/ui"
import { NumberField, type NumberFieldEvents, type NumberFieldProps } from "@effect/ui-kit"
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

const idle = { text: null, pending: false, scrubbing: false, cursor: false, focus: 0, ios: false }
const parts = (props: NumberFieldProps) => Story.parts(NumberField, { model: idle, props })

type Tracked = Mount.Issued<unknown, never, never, unknown> & { readonly args: Record<string, unknown> }
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const tracked = (s: Rendered, locator: Locator.Locator): Tracked =>
  (s.get(locator) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as Tracked
const scene = (props: NumberFieldProps, view: typeof standIn = standIn) =>
  HtmlScene.make(NumberField, props, view).pipe(
    Effect.map((s) =>
      s.expectMount(tracked(s, input))
        .expectMount(tracked(s, decrement))
        .expectMount(tracked(s, increment))
        .expectMount(tracked(s, scrub))
    )
  )

const updated = (value: number | null, reason: string, direction?: 1 | -1) =>
  (direction === undefined
    ? { _tag: "Updated", value, reason }
    : { _tag: "Updated", value, reason, direction }) as NumberFieldEvents
const committed = (value: number | null, reason: string) => ({ _tag: "Committed", value, reason }) as NumberFieldEvents
const keyed = (value: number, direction?: 1 | -1): readonly [NumberFieldEvents, NumberFieldEvents] => [
  updated(value, "keyboard", direction),
  committed(value, "keyboard")
]
const quiet = (s: { readonly current: { readonly emitted: ReadonlyArray<unknown> } }) =>
  assert.deepStrictEqual(s.current.emitted, [])
const text = (s: Rendered) => s.get(input).props?.value

describe("NumberField", () => {
  it.effect("renders default anatomy, hidden form input, and consumer attribute precedence", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 1234.5, locale: "en-US", name: "amount", form: "order", min: 0, max: 5000 })
      const id = s.get(input).attrs?.id
      assert.isString(id)
      assert.deepInclude(s.get(input).attrs, {
        type: "text",
        inputmode: "numeric",
        autocomplete: "off",
        autocorrect: "off",
        spellcheck: "false",
        "aria-roledescription": "Number field",
        form: "order"
      })
      assert.isUndefined(s.get(input).attrs?.name)
      assert.strictEqual(text(s), "1,234.5")
      assert.strictEqual(s.get(group).attrs?.role, "group")
      assert.deepInclude(s.get(scrub).attrs, {
        role: "presentation",
        style: "touch-action:none;user-select:none;-webkit-user-select:none"
      })
      for (const [button, label] of [[decrement, "Decrease"], [increment, "Increase"]] as const) {
        assert.deepInclude(s.get(button).attrs, {
          type: "button",
          tabindex: "-1",
          "aria-label": label,
          "aria-controls": id,
          style: "user-select:none;-webkit-user-select:none"
        })
      }
      assert.strictEqual(s.query(cursor), undefined)
      const children = s.get(root).children ?? []
      assert.strictEqual(children[children.length - 1], s.get(formInput))
      assert.deepInclude(s.get(formInput).attrs, {
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
      assert.strictEqual(s.get(formInput).props?.value, "1234.5")
      s.props({ value: null, step: "any", required: true })
      assert.deepInclude(s.get(formInput).attrs, { step: "any", value: "", required: "" })
      assert.isUndefined(s.get(formInput).attrs?.min)

      const custom = yield* scene({ value: 5, max: 5, disabled: true }, {
        elements: Html,
        view: (numberField, h) =>
          numberField.root(h.div.class("root").attr("data-disabled", "no").attr("data-scrubbing", "yes")).children(
            numberField.scrubArea({
              element: h.span.class("scrub").attr("role", "button").attr("style", "cursor:ew-resize")
            }),
            numberField.group(h.div.class("group").attr("role", "toolbar")).children(
              numberField.decrement({
                element: h.button.class("decrement").attr("aria-label", "Less").attr("tabindex", "0")
                  .attr("aria-controls", "other").attr("type", "submit").attr("style", "color:red").disabled(true)
              }),
              numberField.input(
                h.input.class("input").attr("id", "amount").attr("type", "number").attr("inputmode", "tel")
                  .attr("aria-roledescription", "Amount").attr("autocomplete", "transaction-amount")
                  .attr("readonly", "").value("nine").disabled(false)
              ),
              numberField.increment({ element: h.button.class("increment").attr("aria-disabled", "false") })
            )
          )
      })
      assert.strictEqual(custom.get(root).attrs?.["data-disabled"], "")
      assert.isUndefined(custom.get(root).attrs?.["data-scrubbing"])
      assert.deepInclude(custom.get(scrub).attrs, {
        role: "presentation",
        style: "cursor:ew-resize;touch-action:none;user-select:none;-webkit-user-select:none"
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
      assert.strictEqual(text(custom), "5")
    }))

  it.effect("propagates state attributes, bound disabled states, part state, and element guards", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, min: 0, max: 5, required: true })
      const all = [root, group, input, decrement, increment, scrub]
      for (const part of all) assert.strictEqual(s.get(part).attrs?.["data-required"], "")
      assert.deepInclude(s.get(increment).attrs, { "aria-disabled": "true", "data-disabled": "" })
      assert.isUndefined(s.get(decrement).attrs?.["aria-disabled"])

      s.props({ value: 0, min: 0, max: 5 })
      assert.deepInclude(s.get(decrement).attrs, { "aria-disabled": "true", "data-disabled": "" })
      assert.isUndefined(s.get(increment).attrs?.["aria-disabled"])

      s.props({ value: 2, min: 0, max: 5, readOnly: true })
      for (const part of all) assert.strictEqual(s.get(part).attrs?.["data-readonly"], "")
      assert.strictEqual(s.get(input).attrs?.readonly, "")
      for (const button of [decrement, increment]) assert.strictEqual(s.get(button).attrs?.["aria-disabled"], "true")

      s.props({ value: 2, disabled: true })
      for (const part of all) assert.strictEqual(s.get(part).attrs?.["data-disabled"], "")
      assert.strictEqual(s.get(input).attrs?.disabled, "")
      assert.strictEqual(s.get(formInput).attrs?.disabled, "")

      const own = yield* scene({ value: 2 }, {
        elements: Html,
        view: (numberField, h) =>
          numberField.root(h.div.class("root")).children(
            numberField.scrubArea({ element: h.span.class("scrub") }),
            numberField.decrement({ element: h.button.class("decrement"), disabled: true }),
            numberField.input(h.input.class("input")),
            numberField.increment({ element: h.button.class("increment") })
          )
      })
      assert.deepInclude(own.get(decrement).attrs, { "aria-disabled": "true", "data-disabled": "" })
      for (const part of [root, input, increment]) assert.isUndefined(own.get(part).attrs?.["data-disabled"])

      const numberField = parts({ value: 1234.5, locale: "de-DE", readOnly: true, required: true })
      assert.deepInclude(numberField, {
        value: 1234.5,
        inputValue: "1.234,5",
        disabled: false,
        readOnly: true,
        required: true,
        scrubbing: false
      })
      assert.isUndefined(numberField.scrubAreaCursor(h.span))
      assert.throws(() => numberField.input(h.div as any), /a part for <input> was given <div>/)
      assert.throws(() => numberField.increment({ element: h.div as any }), /a part for <button> was given <div>/)
    }))

  it.effect("steps with keyboard modifiers, bounds, empty start, floating-point precision, and snapOnStep", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, locale: "en-US" })
      s.keydown(input, "ArrowUp").emitted(...keyed(6, 1)).expectDefaultPrevented()
      s.keydown(input, "ArrowDown").emitted(...keyed(4, -1)).expectDefaultPrevented()
      s.keydown(input, "ArrowUp", { shift: true }).emitted(...keyed(15, 1))
      s.keydown(input, "ArrowDown", { alt: true }).emitted(...keyed(4.9, -1))

      s.props({ value: 5, step: 0.25, smallStep: 0.01, largeStep: 100 })
      s.keydown(input, "ArrowUp").emitted(...keyed(5.25, 1))
      s.keydown(input, "ArrowUp", { shift: true }).emitted(...keyed(105, 1))
      s.keydown(input, "ArrowDown", { alt: true }).emitted(...keyed(4.99, -1))

      s.props({ value: 5, step: "any" })
      s.keydown(input, "ArrowUp").emitted(...keyed(6, 1))

      s.props({ value: 9, min: 0, max: 10 })
      s.keydown(input, "Home").emitted(...keyed(0)).expectDefaultPrevented()
      s.keydown(input, "End").emitted(...keyed(10)).expectDefaultPrevented()
      s.keydown(input, "ArrowUp", { shift: true }).emitted(...keyed(10, 1))
      s.keydown(input, "ArrowUp", { ctrl: true }).expectIgnored().expectDefaultPrevented(false)
      s.fire(input, "keydown", { key: "ArrowUp", shift: false, ctrl: false, alt: false, meta: false, composing: true })
        .expectIgnored()
      s.keydown(input, "PageUp").expectIgnored().expectDefaultPrevented(false)
      s.props({ value: 10, min: 0, max: 10 })
      s.keydown(input, "ArrowUp").expectHandled()
      quiet(s)
      s.props({ value: 5, max: 10 })
      s.keydown(input, "Home").expectIgnored().expectDefaultPrevented(false)

      s.props({ value: null })
      assert.strictEqual(text(s), "")
      s.keydown(input, "ArrowUp").emitted(...keyed(0))
      s.props({ value: null, min: 5 })
      s.keydown(input, "ArrowDown").emitted(...keyed(5))

      s.props({ value: 0.1, step: 0.2 })
      s.keydown(input, "ArrowUp").emitted(...keyed(0.3, 1))
      s.props({ value: 3, step: 5, min: 2, snapOnStep: true })
      s.keydown(input, "ArrowUp").emitted(...keyed(7, 1))
      s.props({ value: 1.26, smallStep: 0.5, snapOnStep: true })
      s.keydown(input, "ArrowUp", { alt: true }).emitted(...keyed(2, 1))
      s.props({ value: 5, step: 5, max: 8, snapOnStep: true })
      s.keydown(input, "ArrowUp").emitted(...keyed(8, 1))
    }))

  it.effect("handles typing, clearing, invalid input, range clamping, rounding, and blur commit", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, locale: "en-US" })
      s.blur(input)
      quiet(s)
      s.type(input, "1,234.50").emitted(updated(1234.5, "input-change"))
      assert.strictEqual(text(s), "1,234.50")
      s.props({ value: 1234.5, locale: "en-US" })
      assert.strictEqual(text(s), "1,234.50")
      s.blur(input).emitted(committed(1234.5, "input-blur"))
      assert.strictEqual(text(s), "1,234.5")
      s.blur(input)
      quiet(s)

      s.type(input, "1234.5").emitted(updated(1234.5, "input-change"))
      s.type(input, "").emitted(updated(null, "input-clear"))
      s.props({ value: null, locale: "en-US" })
      s.blur(input).emitted(committed(null, "input-clear"))

      s.props({ value: 5, locale: "en-US" })
      s.type(input, "12a").expectHandled()
      quiet(s)
      s.type(input, "$12")
      quiet(s)
      s.type(input, "-").expectHandled()
      s.blur(input).expectHandled()
      quiet(s)
      assert.strictEqual(text(s), "5")

      s.type(input, "20").emitted(updated(20, "input-change"))
      s.keydown(input, "ArrowDown").emitted(...keyed(19, -1))
      assert.strictEqual(text(s), "5")

      s.props({ value: 5, min: 0, max: 10 })
      s.type(input, "50").emitted(updated(10, "input-change"))
      s.props({ value: 5, min: 0, max: 10, allowOutOfRange: true })
      s.type(input, "50").emitted(updated(50, "input-change"))
      s.props({ value: 50, min: 0, max: 10, allowOutOfRange: true })
      s.keydown(input, "ArrowUp").emitted(...keyed(10, 1))

      const rounded = yield* scene({ value: 1, locale: "en-US", format: { maximumFractionDigits: 2 } })
      rounded.type(input, "1.239").emitted(updated(1.24, "input-change"))
      assert.strictEqual(text(rounded), "1.239")
      rounded.props({ value: 1.24, locale: "en-US", format: { maximumFractionDigits: 2 } })
      rounded.blur(input).emitted(committed(1.24, "input-blur"))
      assert.strictEqual(text(rounded), "1.24")
      rounded.props({ value: 2.555, locale: "en-US", format: { maximumFractionDigits: 2 } })
      assert.strictEqual(text(rounded), "2.56")
      rounded.blur(input).emitted(updated(2.56, "input-blur"), committed(2.56, "input-blur"))
    }))

  it.effect("formats and parses locales, non-Latin numbering systems, and percent, currency, and unit styles", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 1234.5, locale: "de-DE" })
      assert.strictEqual(text(s), "1.234,5")
      s.type(input, "2.345,75").emitted(updated(2345.75, "input-change"))
      s.props({ value: 1234.5, locale: "fr-FR" })
      s.blur(input).emitted(updated(2345.75, "input-blur"))
      assert.match(text(s) as string, /^1\s234,5$/)
      s.type(input, "9 876,5").emitted(updated(9876.5, "input-change"))
      s.props({ value: 1234.5, locale: "de-CH" })
      s.type(input, "1'234.25").emitted(updated(1234.25, "input-change"))
      s.props({ value: 1234.5, locale: "en-IN" })
      s.type(input, "12,34,567").emitted(updated(1234567, "input-change"))

      const ar = yield* scene({ value: 1234.5, locale: "ar-EG" })
      assert.strictEqual(text(ar), "١٬٢٣٤٫٥")
      ar.type(input, "٢٬٣٤٥٫٧٥").emitted(updated(2345.75, "input-change"))
      ar.type(input, "۱۲۳").emitted(updated(123, "input-change"))
      ar.type(input, "１２３．５").emitted(updated(123.5, "input-change"))
      ar.type(input, "一二三").emitted(updated(123, "input-change"))
      ar.type(input, "−4").emitted(updated(-4, "input-change"))

      const pct = yield* scene({ value: 0.5, locale: "en-US", format: { style: "percent" } })
      assert.strictEqual(text(pct), "50%")
      pct.type(input, "25%").emitted(updated(0.25, "input-change"))
      pct.type(input, "5‰").emitted(updated(0.005, "input-change"))
      pct.props({ value: 50, locale: "en-US", format: { style: "unit", unit: "percent" } })
      pct.blur(input).emitted(updated(0.005, "input-blur"))
      assert.strictEqual(text(pct), "50%")
      pct.type(input, "25%").emitted(updated(25, "input-change"))

      const eur = yield* scene({ value: 1234.5, locale: "de-DE", format: { style: "currency", currency: "EUR" } })
      assert.match(text(eur) as string, /^1\.234,50\s€$/)
      eur.type(input, "99,90 €").emitted(updated(99.9, "input-change"))

      const speed = yield* scene({ value: 12, locale: "en-US", format: { style: "unit", unit: "kilometer-per-hour" } })
      assert.strictEqual(text(speed), "12 km/h")
      speed.type(input, "80 km/h").emitted(updated(80, "input-change"))

      const debt = yield* scene({
        value: -12,
        locale: "en-US",
        format: { style: "currency", currency: "USD", currencySign: "accounting" }
      })
      assert.strictEqual(text(debt), "($12.00)")
      debt.type(input, "($7.50)").emitted(updated(-7.5, "input-change"))
    }))

  it.effect("ignores input when disabled or read-only", () =>
    Effect.gen(function*() {
      for (const lock of [{ disabled: true }, { readOnly: true }]) {
        const s = yield* scene({ value: 5, ...lock })
        s.keydown(input, "ArrowUp").expectIgnored()
        s.fire(input, "input", { value: "9" }).expectHandled()
        s.fire(formInput, "change", { value: "9" })
        s.fire(input, "blur", {})
        quiet(s)
        assert.strictEqual(text(s), "5")
      }
    }))

  it.effect("handles hidden form input autofill and iOS inputmode", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, max: 10 })
      s.change(formInput, "7.5").emitted(updated(7.5, "none"))
      s.change(formInput, "70").emitted(updated(10, "none"))
      s.change(formInput, "").emitted(updated(null, "none"))
      s.change(formInput, "5")
      quiet(s)
      s.props({ value: 5, min: 0 })
      s.mounted(tracked(s, input), { _tag: "DetectedIOS" } as never)
      assert.strictEqual(s.get(input).attrs?.inputmode, "decimal")
      s.props({ value: 5, min: -1 })
      assert.strictEqual(s.get(input).attrs?.inputmode, "text")
    }))
})
