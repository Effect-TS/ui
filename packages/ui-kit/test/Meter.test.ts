import type { Component } from "@effect/ui"
import { View } from "@effect/ui"
import { Meter, type MeterProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

// Every part, as the docs draw them.
const standIn = {
  elements: Html,
  view: (
    s: Component.Headless.Parts<typeof Meter>,
    h: View.Helper<never, MeterProps> & View.Tags<Html.Elements, never>
  ) =>
    s.root(h.div).children(
      s.label(h.span.class("label")).children("Storage"),
      s.value(h.span.class("value")),
      s.track(h.div.class("track")).children(s.indicator(h.div.class("fill")))
    )
}

const root = Locator.attr("role", "meter")
const label = Locator.attr("class", "label")
const value = Locator.attr("class", "value")
const indicator = Locator.attr("class", "fill")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const parts = (props: MeterProps) => Story.parts(Meter, { model: {}, props })
const built = (element: View.ElementBuilder<never, never, any, any>) => View.build(element, [])
const textIn = (element: View.Element<never, never>) =>
  element.children.map((child) => child._tag === "Text" ? child.text : "").join("")

describe("Meter", () => {
  it.effect("the root reports the value and points at the label, and the value and indicator follow the props", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Meter, { value: 40 }, standIn)
      const attrs = s.get(root).attrs
      assert.strictEqual(attrs?.["aria-valuemin"], "0")
      assert.strictEqual(attrs?.["aria-valuemax"], "100")
      assert.strictEqual(attrs?.["aria-valuenow"], "40")
      assert.strictEqual(attrs?.["aria-valuetext"], "40%")
      assert.strictEqual(s.get(label).attrs?.role, "presentation")
      assert.strictEqual(attrs?.["aria-labelledby"], s.get(label).attrs?.id)
      assert.strictEqual(s.get(value).attrs?.["aria-hidden"], "true")
      assert.strictEqual(Locator.textOf(s.get(value)), "40%")
      assert.strictEqual(s.get(indicator).attrs?.style, "inset-inline-start:0;height:inherit;width:40%")

      s.props({ value: 150, min: 50, max: 250, valueText: "150 units" })
      const next = s.get(root).attrs
      assert.strictEqual(next?.["aria-valuemin"], "50")
      assert.strictEqual(next?.["aria-valuemax"], "250")
      assert.strictEqual(next?.["aria-valuenow"], "150")
      assert.strictEqual(next?.["aria-valuetext"], "150 units")
      assert.strictEqual(Locator.textOf(s.get(value)), "150 units")
      assert.strictEqual(s.get(indicator).attrs?.style, "inset-inline-start:0;height:inherit;width:50%")
    }))

  it("a value outside the range is clamped, NaN counts as min, and an empty range is 0%", () => {
    const at = (props: MeterProps) => {
      const s = parts(props)
      return [built(s.root(h.div)).attrs["aria-valuenow"], s.percentage, s.valueText]
    }
    assert.deepStrictEqual(at({ value: 120 }), ["100", 100, "100%"])
    assert.deepStrictEqual(at({ value: -5 }), ["0", 0, "0%"])
    assert.deepStrictEqual(at({ value: Number.NaN, min: 10, max: 20 }), ["10", 0, "0%"])
    assert.deepStrictEqual(at({ value: 5, min: 5, max: 5 }), ["5", 0, "0%"])
    assert.deepStrictEqual(at({ value: 1, max: 3 }), ["1", 100 / 3, "33%"])
  })

  it("each part takes only its own tag", () => {
    const s = parts({ value: 40 })
    assert.throws(() => s.root(h.span as any), /a part for <div> was given <span>/)
    assert.throws(() => s.label(h.div as any), /a part for <span> was given <div>/)
    assert.throws(() => s.value(h.div as any), /a part for <span> was given <div>/)
    assert.throws(() => s.track(h.span as any), /a part for <div> was given <span>/)
    assert.throws(() => s.indicator(h.span as any), /a part for <div> was given <span>/)
  })

  it("the root keeps the consumer's attributes, but the meter's own win, and the hidden span comes after every child", () => {
    const s = parts({ value: 40 })
    const element = built(
      s.root(
        h.div
          .class("meter")
          .attr("aria-label", "Disk")
          .attr("aria-labelledby", "heading")
          .attr("role", "progressbar")
          .attr("aria-valuemin", "1")
          .attr("aria-valuemax", "2")
          .attr("aria-valuenow", "3")
          .attr("aria-valuetext", "full")
      ).children("chained")
    )
    const labelId = built(s.label(h.span)).attrs.id
    assert.deepStrictEqual(element.attrs, {
      class: "meter",
      "aria-label": "Disk",
      "aria-labelledby": `heading ${labelId}`,
      role: "meter",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": "40",
      "aria-valuetext": "40%"
    })
    // The span that makes NVDA read the label goes after the children
    // chained after the part, hidden but not from screen readers.
    const last = element.children.at(-1)!
    assert.deepStrictEqual(element.children[0], { _tag: "Text", text: "chained" })
    assert(last._tag === "Element")
    assert.strictEqual(last.attrs.role, "presentation")
    assert.match(last.attrs.style!, /clip:rect\(0,0,0,0\)/)
    assert.strictEqual(textIn(last), "x")
  })

  it("the label, value and indicator keep the consumer's other attributes, but their own win", () => {
    const s = parts({ value: 40, valueText: "4 of 10" })
    const labelEl = built(s.label(h.span.class("label").attr("id", "mine").attr("role", "note")))
    assert.strictEqual(labelEl.attrs.class, "label")
    assert.strictEqual(labelEl.attrs.role, "presentation")
    assert.notStrictEqual(labelEl.attrs.id, "mine")

    // The value shows the text, unless the consumer gave it children.
    const valueEl = built(s.value(h.span.class("value").attr("aria-hidden", "false")))
    assert.deepStrictEqual(valueEl.attrs, { class: "value", "aria-hidden": "true" })
    assert.strictEqual(textIn(valueEl), "4 of 10")
    assert.strictEqual(textIn(built(s.value(h.span).children("four"))), "four")

    // The width wins over the consumer's, set before the part or chained
    // after it, and the consumer's other declarations stay.
    const before = built(s.indicator(h.div.attr("style", "width:1px;background:red;")))
    assert.strictEqual(before.attrs.style, "width:1px;background:red;inset-inline-start:0;height:inherit;width:40%")
    const after = built(s.indicator(h.div).attr("style", "width:1px"))
    assert.strictEqual(after.attrs.style, "width:1px;inset-inline-start:0;height:inherit;width:40%")

    // The track is there for the anatomy and writes nothing.
    assert.deepStrictEqual(built(s.track(h.div.class("track").attr("data-x", ""))).attrs, {
      class: "track",
      "data-x": ""
    })
  })
})
