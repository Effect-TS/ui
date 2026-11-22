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

const idle = { text: null, pending: false, last: null, scrubbing: false, cursor: false, focus: 0, ios: false }
const parts = (props: NumberFieldProps) => Story.parts(NumberField, { model: idle, props })

type Tracked = Mount.Issued<unknown, never, never, unknown> & { readonly args: Record<string, unknown> }
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
// The mounts are private, so a test reads each off the rendered element.
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

const sent = (tag: string, fields: object = {}) => ({ _tag: tag, ...fields }) as never
const plain = { shift: false, alt: false }
const pressed = (direction: 1 | -1, modifiers: object = {}) =>
  sent("PressedStepper", { direction, focus: true, ...plain, ...modifiers })
const held = (direction: 1 | -1) => sent("HeldStepper", { direction, ...plain })
const released = (direction: 1 | -1) => sent("ReleasedStepper", { direction })
const clicked = (direction: 1 | -1) => sent("ClickedStepper", { direction, ...plain })
const wheel = (direction: 1 | -1, modifiers: object = {}) => sent("TurnedWheel", { direction, ...plain, ...modifiers })
const scrubbed = (amount: number, modifiers: object = {}) => sent("MovedScrub", { amount, ...plain, ...modifiers })

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
  it.effect("the input is a text field showing the formatted value, named for the buttons to point at", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 1234.5, locale: "en-US" })
      const id = s.get(input).attrs?.id
      assert.isString(id)
      assert.deepInclude(s.get(input).attrs, {
        type: "text",
        inputmode: "numeric",
        autocomplete: "off",
        autocorrect: "off",
        spellcheck: "false",
        "aria-roledescription": "Number field"
      })
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
        assert.isUndefined(s.get(button).attrs?.["aria-disabled"])
        assert.isUndefined(s.get(button).attrs?.disabled)
      }
      for (const part of [root, group, input, decrement, increment, scrub]) {
        for (const name of ["data-disabled", "data-readonly", "data-required", "data-scrubbing"]) {
          assert.isUndefined(s.get(part).attrs?.[name])
        }
      }
      assert.strictEqual(s.query(cursor), undefined)
    }))

  it.effect("the root ends with a hidden number input holding the plain value, the range and the step", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 1234.5, locale: "de-DE", name: "amount", form: "order", min: 0, max: 5000 })
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
      assert.match(s.get(formInput).attrs?.style ?? "", /^position:absolute;.*clip:rect\(0,0,0,0\)/)
      assert.strictEqual(s.get(formInput).props?.value, "1234.5")
      assert.isUndefined(s.get(formInput).attrs?.required)
      assert.strictEqual(s.get(input).attrs?.form, "order")
      assert.isUndefined(s.get(input).attrs?.name)
      s.props({ value: null, step: "any", required: true })
      assert.deepInclude(s.get(formInput).attrs, { step: "any", value: "", required: "" })
      assert.isUndefined(s.get(formInput).attrs?.min)
      assert.strictEqual(s.get(input).attrs?.required, "")
      s.props({ value: 2, step: 0.5, disabled: true })
      assert.strictEqual(s.get(formInput).attrs?.step, "0.5")
      assert.strictEqual(s.get(formInput).attrs?.disabled, "")
    }))

  it.effect("every part carries the state, and a button is unavailable at its bound, when disabled and read-only", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, min: 0, max: 5, required: true })
      const all = [root, group, input, decrement, increment, scrub]
      for (const part of all) assert.strictEqual(s.get(part).attrs?.["data-required"], "")
      assert.deepInclude(s.get(increment).attrs, { "aria-disabled": "true", "data-disabled": "" })
      assert.isUndefined(s.get(decrement).attrs?.["aria-disabled"])
      assert.isUndefined(s.get(decrement).attrs?.["data-disabled"])
      assert.isUndefined(s.get(input).attrs?.["data-disabled"])
      s.props({ value: 0, min: 0, max: 5 })
      assert.deepInclude(s.get(decrement).attrs, { "aria-disabled": "true", "data-disabled": "" })
      assert.isUndefined(s.get(increment).attrs?.["aria-disabled"])
      s.props({ value: 2, min: 0, max: 5, readOnly: true })
      for (const part of all) {
        assert.strictEqual(s.get(part).attrs?.["data-readonly"], "")
        assert.isUndefined(s.get(part).attrs?.["data-disabled"])
      }
      assert.strictEqual(s.get(input).attrs?.readonly, "")
      for (const button of [decrement, increment]) assert.strictEqual(s.get(button).attrs?.["aria-disabled"], "true")
      s.props({ value: 2, disabled: true })
      for (const part of all) assert.strictEqual(s.get(part).attrs?.["data-disabled"], "")
      assert.strictEqual(s.get(input).attrs?.disabled, "")
      for (const button of [decrement, increment]) {
        assert.strictEqual(s.get(button).attrs?.["aria-disabled"], "true")
        assert.isUndefined(s.get(button).attrs?.disabled)
      }
    }))

  it.effect("a button's own disabled makes that button unavailable and no other part", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 2 }, {
        elements: Html,
        view: (numberField, h) =>
          numberField.root(h.div.class("root")).children(
            numberField.scrubArea({ element: h.span.class("scrub") }),
            numberField.decrement({ element: h.button.class("decrement"), disabled: true }),
            numberField.input(h.input.class("input")),
            numberField.increment({ element: h.button.class("increment") })
          )
      })
      assert.deepInclude(s.get(decrement).attrs, { "aria-disabled": "true", "data-disabled": "" })
      assert.strictEqual(tracked(s, decrement).args.disabled, true)
      for (const part of [root, input, increment]) assert.isUndefined(s.get(part).attrs?.["data-disabled"])
      assert.strictEqual(tracked(s, increment).args.disabled, false)
    }))

  it.effect("the arrows step, Shift and Alt change the step, and each key commits at once", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, locale: "en-US" })
      s.keydown(input, "ArrowUp").emitted(...keyed(6, 1)).expectDefaultPrevented()
      s.keydown(input, "ArrowDown").emitted(...keyed(4, -1)).expectDefaultPrevented()
      s.keydown(input, "ArrowUp", { shift: true }).emitted(...keyed(15, 1))
      s.keydown(input, "ArrowDown", { shift: true }).emitted(...keyed(-5, -1))
      s.keydown(input, "ArrowUp", { alt: true }).emitted(...keyed(5.1, 1))
      s.keydown(input, "ArrowDown", { alt: true }).emitted(...keyed(4.9, -1))
      s.props({ value: 5, step: 0.25, smallStep: 0.01, largeStep: 100 })
      s.keydown(input, "ArrowUp").emitted(...keyed(5.25, 1))
      s.keydown(input, "ArrowUp", { shift: true }).emitted(...keyed(105, 1))
      s.keydown(input, "ArrowDown", { alt: true }).emitted(...keyed(4.99, -1))
      s.props({ value: 5, step: "any" })
      s.keydown(input, "ArrowUp").emitted(...keyed(6, 1))
    }))

  it.effect("Home and End go to the bounds that are set, and other keys are left to the input", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, min: -10, max: 10 })
      s.keydown(input, "Home").emitted(...keyed(-10)).expectDefaultPrevented()
      s.keydown(input, "End").emitted(...keyed(10)).expectDefaultPrevented()
      s.keydown(input, "End", { alt: true }).expectIgnored().expectDefaultPrevented(false)
      s.keydown(input, "ArrowUp", { ctrl: true }).expectIgnored().expectDefaultPrevented(false)
      s.keydown(input, "ArrowUp", { meta: true }).expectIgnored()
      s.fire(input, "keydown", { key: "ArrowUp", shift: false, ctrl: false, alt: false, meta: false, composing: true })
        .expectIgnored()
      s.keydown(input, "PageUp").expectIgnored().expectDefaultPrevented(false)
      s.keydown(input, "1").expectIgnored().expectDefaultPrevented(false)
      s.props({ value: 5, max: 10 })
      s.keydown(input, "Home").expectIgnored().expectDefaultPrevented(false)
      s.keydown(input, "End").emitted(...keyed(10))
    }))

  it.effect("a step stays within the range, and one that changes nothing commits nothing", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 9, min: 0, max: 10 })
      s.keydown(input, "ArrowUp", { shift: true }).emitted(...keyed(10, 1))
      s.props({ value: 10, min: 0, max: 10 })
      s.keydown(input, "ArrowUp").expectHandled()
      quiet(s)
      s.keydown(input, "End")
      quiet(s)
      s.props({ value: 0, min: 0, max: 10 })
      s.keydown(input, "ArrowDown")
      quiet(s)
    }))

  it.effect("a step from an empty field starts at zero, or at the bound nearest it", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: null })
      assert.strictEqual(text(s), "")
      s.keydown(input, "ArrowUp").emitted(...keyed(0))
      s.keydown(input, "ArrowDown", { shift: true }).emitted(...keyed(0))
      s.props({ value: null, min: 5 })
      s.keydown(input, "ArrowDown").emitted(...keyed(5))
      s.props({ value: null, max: -5 })
      s.mounted(tracked(s, increment), pressed(1)).emitted(updated(-5, "increment-press"))
    }))

  it.effect("a step leaves no floating point error, and with snapOnStep lands on the step's grid", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 0.1, step: 0.2 })
      s.keydown(input, "ArrowUp").emitted(...keyed(0.3, 1))
      s.props({ value: 0.7, step: 0.1 })
      s.keydown(input, "ArrowUp").emitted(...keyed(0.8, 1))
      s.props({ value: 3, step: 5, snapOnStep: true })
      s.keydown(input, "ArrowUp").emitted(...keyed(5, 1))
      s.keydown(input, "ArrowDown").emitted(...keyed(0, -1))
      s.props({ value: 3, step: 5, min: 2, snapOnStep: true })
      s.keydown(input, "ArrowUp").emitted(...keyed(7, 1))
      s.props({ value: 1.26, smallStep: 0.5, snapOnStep: true })
      s.keydown(input, "ArrowUp", { alt: true }).emitted(...keyed(2, 1))
      s.props({ value: 5, step: 5, max: 8, snapOnStep: true })
      s.keydown(input, "ArrowUp").emitted(...keyed(8, 1))
    }))

  it.effect("typing keeps the text as typed and reports the number it reads as", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, locale: "en-US" })
      s.type(input, "1").emitted(updated(1, "input-change"))
      assert.strictEqual(text(s), "1")
      s.type(input, "1,2").emitted(updated(12, "input-change"))
      assert.strictEqual(text(s), "1,2")
      s.type(input, "1,234.").emitted(updated(1234, "input-change"))
      assert.strictEqual(text(s), "1,234.")
      s.type(input, "1,234.50").emitted(updated(1234.5, "input-change"))
      assert.strictEqual(text(s), "1,234.50")
      s.props({ value: 1234.5, locale: "en-US" })
      assert.strictEqual(text(s), "1,234.50")
      s.type(input, "-").expectHandled()
      quiet(s)
      assert.strictEqual(text(s), "-")
      s.type(input, "-7").emitted(updated(-7, "input-change"))
    }))

  it.effect("emptying the text asks for null, and text with a character the locale can't show is refused", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, locale: "en-US" })
      s.type(input, "").emitted(updated(null, "input-clear"))
      assert.strictEqual(text(s), "")
      s.type(input, "  ").emitted(updated(null, "input-clear"))
      s.type(input, "12").emitted(updated(12, "input-change"))
      s.type(input, "12a").expectHandled()
      quiet(s)
      assert.strictEqual(text(s), "12")
      s.type(input, "1e2")
      quiet(s)
      s.type(input, "$12")
      quiet(s)
      assert.strictEqual(text(s), "12")
      s.props({ value: 5, locale: "en-US", format: { style: "currency", currency: "USD" } })
      s.type(input, "$12").emitted(updated(12, "input-change"))
    }))

  it.effect("a typed value is kept within the range, unless allowOutOfRange lets it through", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, min: 0, max: 10 })
      s.type(input, "50").emitted(updated(10, "input-change"))
      assert.strictEqual(text(s), "50")
      s.type(input, "-3").emitted(updated(0, "input-change"))
      s.props({ value: 5, min: 0, max: 10, allowOutOfRange: true })
      s.type(input, "50").emitted(updated(50, "input-change"))
      s.type(input, "-3").emitted(updated(-3, "input-change"))
      const stepped = yield* scene({ value: 50, min: 0, max: 10, allowOutOfRange: true })
      stepped.keydown(input, "ArrowUp").emitted(...keyed(10, 1))
    }))

  it.effect("typing the stored value again still reports it, as the text had read as another", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, locale: "en-US" })
      s.type(input, "5").emitted(updated(5, "input-change"))
      s.type(input, "5.0").emitted(updated(5, "input-change"))
    }))

  it.effect("losing focus formats the text and commits, once, and only after a change", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, locale: "en-US" })
      s.blur(input)
      quiet(s)
      s.type(input, "1234.50").emitted(updated(1234.5, "input-change"))
      s.props({ value: 1234.5, locale: "en-US" })
      s.blur(input).emitted(committed(1234.5, "input-blur"))
      assert.strictEqual(text(s), "1,234.5")
      s.blur(input)
      quiet(s)
    }))

  it.effect("a change the parent didn't store is asked for again on blur, and then the stored value shows", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, locale: "en-US" })
      s.type(input, "12").emitted(updated(12, "input-change"))
      assert.strictEqual(text(s), "12")
      s.blur(input).emitted(updated(12, "input-blur"), committed(12, "input-blur"))
      assert.strictEqual(text(s), "5")
    }))

  it.effect("losing focus with empty text commits null, and text that isn't a number is dropped", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, locale: "en-US" })
      s.type(input, "").emitted(updated(null, "input-clear"))
      s.props({ value: null, locale: "en-US" })
      s.blur(input).emitted(committed(null, "input-clear"))
      s.props({ value: 5, locale: "en-US" })
      s.type(input, "-").expectHandled()
      s.blur(input).expectHandled()
      quiet(s)
      assert.strictEqual(text(s), "5")
    }))

  it.effect("the value is rounded to the format as it is typed, and the text on blur", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 1, locale: "en-US", format: { maximumFractionDigits: 2 } })
      s.type(input, "1.239").emitted(updated(1.24, "input-change"))
      assert.strictEqual(text(s), "1.239")
      s.props({ value: 1.24, locale: "en-US", format: { maximumFractionDigits: 2 } })
      s.blur(input).emitted(committed(1.24, "input-blur"))
      assert.strictEqual(text(s), "1.24")
      s.props({ value: 2.555, locale: "en-US", format: { maximumFractionDigits: 2 } })
      assert.strictEqual(text(s), "2.56")
      s.blur(input).emitted(updated(2.56, "input-blur"), committed(2.56, "input-blur"))
    }))

  it.effect("the text is written and read by the locale", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 1234.5, locale: "de-DE" })
      assert.strictEqual(text(s), "1.234,5")
      s.type(input, "2.345,75").emitted(updated(2345.75, "input-change"))
      s.type(input, "0,5").emitted(updated(0.5, "input-change"))
      s.props({ value: 1234.5, locale: "fr-FR" })
      s.blur(input).emitted(updated(0.5, "input-blur"), committed(0.5, "input-blur"))
      assert.match(text(s) as string, /^1\s234,5$/)
      s.type(input, "9 876,5").emitted(updated(9876.5, "input-change"))
      s.type(input, "9 876,25").emitted(updated(9876.25, "input-change"))
      s.props({ value: 1234.5, locale: "de-CH" })
      s.type(input, "1'234.25").emitted(updated(1234.25, "input-change"))
      s.props({ value: 1234.5, locale: "en-IN" })
      s.type(input, "12,34,567").emitted(updated(1234567, "input-change"))
    }))

  it.effect("digits of other numbering systems are read, in the locale's own and in any other", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, locale: "en-US" })
      s.type(input, "١٢٣").emitted(updated(123, "input-change"))
      s.type(input, "۱۲۳").emitted(updated(123, "input-change"))
      s.type(input, "１２３．５").emitted(updated(123.5, "input-change"))
      s.type(input, "一二三").emitted(updated(123, "input-change"))
      s.type(input, "−4").emitted(updated(-4, "input-change"))
      s.props({ value: 1234.5, locale: "ar-EG" })
      s.blur(input).emitted(updated(-4, "input-blur"), committed(-4, "input-blur"))
      assert.strictEqual(text(s), "١٬٢٣٤٫٥")
      s.type(input, "٢٬٣٤٥٫٧٥").emitted(updated(2345.75, "input-change"))
      s.type(input, "12.5").emitted(updated(12.5, "input-change"))
    }))

  it.effect("a percent format shows and reads a hundredth, and a currency or a unit can be typed", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 0.5, locale: "en-US", format: { style: "percent" } })
      assert.strictEqual(text(s), "50%")
      s.type(input, "25").emitted(updated(0.25, "input-change"))
      s.type(input, "25%").emitted(updated(0.25, "input-change"))
      s.type(input, "12.5%").emitted(updated(0.125, "input-change"))
      s.keydown(input, "ArrowUp").emitted(...keyed(1.125, 1))
      s.props({ value: 50, locale: "en-US", format: { style: "unit", unit: "percent" } })
      assert.strictEqual(text(s), "50%")
      s.type(input, "25%").emitted(updated(25, "input-change"))
      s.props({ value: 5, locale: "en-US" })
      s.type(input, "25%").expectHandled()
      quiet(s)
      s.props({ value: 0.5, locale: "en-US", format: { style: "percent", maximumFractionDigits: 1 } })
      s.type(input, "5‰").emitted(updated(0.005, "input-change"))
      s.props({ value: 1234.5, locale: "de-DE", format: { style: "currency", currency: "EUR" } })
      s.blur(input).emitted(updated(0.005, "input-blur"), committed(0.005, "input-blur"))
      assert.match(text(s) as string, /^1\.234,50\s€$/)
      s.type(input, "99,90 €").emitted(updated(99.9, "input-change"))
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

  it.effect("pasted text is kept and reported with its own reason", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, locale: "en-US" })
      s.mounted(tracked(s, input), sent("PastedText", { value: "1,250" })).emitted(updated(1250, "input-paste"))
      assert.strictEqual(text(s), "1,250")
      s.mounted(tracked(s, input), sent("PastedText", { value: "abc" }))
      quiet(s)
      assert.strictEqual(text(s), "1,250")
    }))

  it.effect("a press steps, holding repeats, and the release commits the last value", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, max: 7 })
      assert.strictEqual(tracked(s, input).args.focus, 0)
      s.mounted(tracked(s, increment), pressed(1)).emitted(updated(6, "increment-press", 1))
      assert.strictEqual(tracked(s, input).args.focus, 1)
      s.props({ value: 6, max: 7 })
      s.mounted(tracked(s, increment), held(1)).emitted(updated(7, "increment-press", 1))
      s.props({ value: 7, max: 7 })
      assert.strictEqual(tracked(s, increment).args.disabled, true)
      s.mounted(tracked(s, increment), held(1))
      quiet(s)
      s.mounted(tracked(s, increment), released(1)).emitted(committed(7, "increment-press"))
      s.mounted(tracked(s, decrement), pressed(-1, { shift: true, focus: false }))
        .emitted(updated(-3, "decrement-press", -1))
      assert.strictEqual(tracked(s, input).args.focus, 1)
      s.mounted(tracked(s, decrement), released(-1)).emitted(committed(-3, "decrement-press"))
      s.mounted(tracked(s, decrement), released(-1)).emitted(committed(7, "decrement-press"))
    }))

  it.effect("a click without a press, as a tap or a screen reader sends, steps and commits", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, max: 6 })
      s.mounted(tracked(s, increment), clicked(1))
        .emitted(updated(6, "increment-press", 1), committed(6, "increment-press"))
      s.props({ value: 6, max: 6 })
      s.mounted(tracked(s, increment), clicked(1))
      quiet(s)
      s.mounted(tracked(s, decrement), clicked(-1))
        .emitted(updated(5, "decrement-press", -1), committed(5, "decrement-press"))
    }))

  it.effect("a step starts from the text being typed, and the text goes", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, locale: "en-US" })
      s.type(input, "12").emitted(updated(12, "input-change"))
      s.mounted(tracked(s, increment), pressed(1)).emitted(updated(13, "increment-press", 1))
      assert.strictEqual(text(s), "5")
      s.mounted(tracked(s, increment), released(1)).emitted(committed(13, "increment-press"))
      s.type(input, "20").emitted(updated(20, "input-change"))
      s.keydown(input, "ArrowDown").emitted(...keyed(19, -1))
      assert.strictEqual(text(s), "5")
      s.type(input, "-").expectHandled()
      s.keydown(input, "ArrowUp").emitted(...keyed(6, 1))
    }))

  it.effect("the wheel steps and commits, only when allowWheelScrub is set", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5 })
      assert.strictEqual(tracked(s, input).args.wheel, false)
      s.mounted(tracked(s, input), wheel(1))
      quiet(s)
      s.props({ value: 5, allowWheelScrub: true })
      assert.strictEqual(tracked(s, input).args.wheel, true)
      s.mounted(tracked(s, input), wheel(1)).emitted(updated(6, "wheel", 1), committed(6, "wheel"))
      s.mounted(tracked(s, input), wheel(-1, { shift: true })).emitted(updated(-5, "wheel", -1), committed(-5, "wheel"))
      s.mounted(tracked(s, input), wheel(1, { alt: true })).emitted(updated(5.1, "wheel", 1), committed(5.1, "wheel"))
      s.props({ value: 5, max: 5, allowWheelScrub: true })
      s.mounted(tracked(s, input), wheel(1))
      quiet(s)
    }))

  it.effect("a drag across the scrub area steps by the pixels moved, and its release commits", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5 })
      const all = [root, group, input, decrement, increment, scrub]
      s.mounted(tracked(s, scrub), sent("StartedScrub", { focus: true }))
      for (const part of all) assert.strictEqual(s.get(part).attrs?.["data-scrubbing"], "")
      assert.strictEqual(tracked(s, input).args.focus, 1)
      assert.strictEqual(tracked(s, scrub).args.scrubbing, true)
      s.mounted(tracked(s, scrub), scrubbed(3)).emitted(updated(8, "scrub", 1))
      s.props({ value: 8 })
      s.mounted(tracked(s, scrub), scrubbed(-2, { shift: true })).emitted(updated(-12, "scrub", -1))
      s.props({ value: -12 })
      s.mounted(tracked(s, scrub), scrubbed(5, { alt: true })).emitted(updated(-11.5, "scrub", 1))
      s.mounted(tracked(s, scrub), sent("EndedScrub", { commit: true })).emitted(committed(-11.5, "scrub"))
      for (const part of all) assert.isUndefined(s.get(part).attrs?.["data-scrubbing"])
      s.mounted(tracked(s, scrub), scrubbed(3))
      quiet(s)
      s.mounted(tracked(s, scrub), sent("StartedScrub", { focus: false }))
      assert.strictEqual(tracked(s, input).args.focus, 1)
      s.mounted(tracked(s, scrub), sent("EndedScrub", { commit: true })).emitted(committed(-12, "scrub"))
    }))

  it.effect("the cursor is drawn only while a drag holds the pointer lock, as a popover", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, required: true })
      s.mounted(tracked(s, scrub), sent("LockedPointer"))
      assert.strictEqual(s.query(cursor), undefined)
      s.mounted(tracked(s, scrub), sent("StartedScrub", { focus: true }))
      assert.strictEqual(s.query(cursor), undefined)
      s.mounted(tracked(s, scrub), sent("LockedPointer"))
      assert.deepInclude(s.get(cursor).attrs, {
        id: String(tracked(s, scrub).args.cursorId),
        role: "presentation",
        popover: "manual",
        "data-scrubbing": "",
        "data-required": "",
        style: "position:fixed;inset:0 auto auto 0;margin:0;pointer-events:none"
      })
      assert.strictEqual(s.get(cursor).props?.popoverOpen, true)
      assert.strictEqual(tracked(s, scrub).args.cursor, true)
      s.mounted(tracked(s, scrub), sent("EndedScrub", { commit: false }))
      quiet(s)
      assert.strictEqual(s.query(cursor), undefined)
    }))

  it.effect("the scrub area's options reach its mount", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5 }, {
        elements: Html,
        view: (numberField, h) =>
          numberField.root(h.div.class("root")).children(
            numberField.scrubArea({
              element: h.label.class("scrub"),
              direction: "vertical",
              pixelSensitivity: 8,
              teleportDistance: 120
            }),
            numberField.decrement({ element: h.button.class("decrement") }),
            numberField.input(h.input.class("input")),
            numberField.increment({ element: h.button.class("increment") })
          )
      })
      assert.deepInclude(tracked(s, scrub).args, { vertical: true, pixelSensitivity: 8, teleportDistance: 120 })
      const plainScene = yield* scene({ value: 5 })
      assert.deepInclude(tracked(plainScene, scrub).args, { vertical: false, pixelSensitivity: 2 })
      assert.isUndefined(tracked(plainScene, scrub).args.teleportDistance)
    }))

  it.effect("a disabled or read-only field reports nothing, and ends a drag without committing", () =>
    Effect.gen(function*() {
      for (const lock of [{ disabled: true }, { readOnly: true }]) {
        const s = yield* scene({ value: 5, allowWheelScrub: true, ...lock })
        assert.strictEqual(tracked(s, input).args.locked, true)
        assert.strictEqual(tracked(s, scrub).args.locked, true)
        assert.strictEqual(tracked(s, increment).args.disabled, true)
        s.keydown(input, "ArrowUp").expectIgnored()
        s.fire(input, "input", { value: "9" }).expectHandled()
        s.mounted(tracked(s, input), sent("PastedText", { value: "9" }))
        s.mounted(tracked(s, input), wheel(1))
        s.mounted(tracked(s, increment), pressed(1))
        s.mounted(tracked(s, increment), held(1))
        s.mounted(tracked(s, increment), released(1))
        s.mounted(tracked(s, increment), clicked(1))
        s.mounted(tracked(s, scrub), sent("StartedScrub", { focus: true }))
        s.mounted(tracked(s, scrub), scrubbed(3))
        s.fire(formInput, "change", { value: "9" })
        s.fire(input, "blur", {})
        quiet(s)
        assert.strictEqual(text(s), "5")
        assert.isUndefined(s.get(root).attrs?.["data-scrubbing"])
        assert.strictEqual(tracked(s, input).args.focus, 0)
      }
      const s = yield* scene({ value: 5 })
      s.mounted(tracked(s, scrub), sent("StartedScrub", { focus: false }))
      s.mounted(tracked(s, scrub), scrubbed(3)).emitted(updated(8, "scrub", 1))
      s.props({ value: 8, disabled: true })
      s.mounted(tracked(s, scrub), sent("EndedScrub", { commit: false }))
      quiet(s)
      assert.isUndefined(s.get(root).attrs?.["data-scrubbing"])
    }))

  it.effect("the form input hands focus to the text input and reports what the browser fills in", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, max: 10 })
      s.focus(formInput)
      assert.strictEqual(tracked(s, input).args.focus, 1)
      s.change(formInput, "7.5").emitted(updated(7.5, "none"))
      s.change(formInput, "70").emitted(updated(10, "none"))
      s.change(formInput, "").emitted(updated(null, "none"))
      s.change(formInput, "5")
      quiet(s)
    }))

  it.effect("on iOS the keypad is the one with the keys the range needs", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, min: 0 })
      s.mounted(tracked(s, input), sent("DetectedIOS"))
      assert.strictEqual(s.get(input).attrs?.inputmode, "decimal")
      s.props({ value: 5 })
      assert.strictEqual(s.get(input).attrs?.inputmode, "text")
      s.props({ value: 5, min: -1 })
      assert.strictEqual(s.get(input).attrs?.inputmode, "text")
    }))

  it.effect("the mount of the input gets the characters the locale and the format allow", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, locale: "de-DE", min: 0, format: { style: "currency", currency: "EUR" } })
      const args = tracked(s, input).args as { readonly allowed: string; readonly single: ReadonlyArray<string> }
      for (const character of [",", ".", "€", "+"]) assert.include(args.allowed, character)
      assert.notInclude(args.allowed, "-")
      assert.deepStrictEqual(args.single, [",", "€"])
      s.props({ value: 5, locale: "de-DE" })
      assert.include(tracked(s, input).args.allowed as string, "-")
      s.props({ value: 5, locale: "de-DE", min: 0, allowOutOfRange: true })
      assert.include(tracked(s, input).args.allowed as string, "-")
    }))

  it.effect("the field's attributes win over the consumer's, except the ones that name or tune a part", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: 5, max: 5, disabled: true }, {
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
      assert.deepInclude(s.get(root).attrs, { "data-disabled": "" })
      assert.isUndefined(s.get(root).attrs?.["data-scrubbing"])
      assert.deepInclude(s.get(scrub).attrs, {
        role: "presentation",
        style: "cursor:ew-resize;touch-action:none;user-select:none;-webkit-user-select:none"
      })
      assert.strictEqual(s.get(group).attrs?.role, "group")
      assert.deepInclude(s.get(decrement).attrs, {
        "aria-label": "Less",
        tabindex: "-1",
        "aria-controls": "amount",
        type: "button",
        style: "color:red;user-select:none;-webkit-user-select:none"
      })
      assert.isUndefined(s.get(decrement).attrs?.disabled)
      assert.strictEqual(s.get(increment).attrs?.["aria-disabled"], "true")
      assert.deepInclude(s.get(input).attrs, {
        id: "amount",
        type: "text",
        inputmode: "numeric",
        "aria-roledescription": "Amount",
        autocomplete: "transaction-amount",
        autocorrect: "off"
      })
      assert.isUndefined(s.get(input).attrs?.readonly)
      assert.strictEqual(text(s), "5")
      assert.strictEqual(s.get(input).attrs?.disabled, "")
    }))

  it("the parts report the state, and a part given the wrong element throws", () => {
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
    assert.throws(() => numberField.input(h.textarea as any), /a part for <input> was given <textarea>/)
    assert.throws(() => numberField.increment({ element: h.div as any }), /a part for <button> was given <div>/)
    assert.throws(() => numberField.decrement({ element: h.a as any }), /a part for <button> was given <a>/)
  })
})
