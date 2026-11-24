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
    meter: Component.Headless.Parts<typeof Meter>,
    h: View.Helper<never, MeterProps> & View.Tags<Html.Elements, never>
  ) =>
    meter.root(
      h.div.attrs({
        role: "progressbar",
        "aria-labelledby": "heading",
        "aria-valuemin": "9",
        "aria-valuemax": "99",
        "aria-valuenow": "99",
        "aria-valuetext": "wrong"
      })
    ).children(
      meter.label(
        h.span.class("label").attrs({ id: "custom-label", role: "heading" })
      ).children("Storage"),
      meter.value(h.span.class("value").attr("aria-hidden", "false")),
      meter.track(h.div.class("track")).children(
        meter.indicator(h.div.class("fill")).attr(
          "style",
          "background:red;width:1px"
        )
      )
    )
}

const root = Locator.attr("role", "meter")
const label = Locator.attr("class", "label")
const value = Locator.attr("class", "value")
const indicator = Locator.attr("class", "fill")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const parts = (props: MeterProps) => Story.parts(Meter, { model: {}, props })
const built = (element: View.ElementBuilder<never, never, any, any>) =>
  View.build(element, [])
describe("Meter", () => {
  it.effect("the root reports the value and points at the label, and the value and indicator follow the props", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Meter, { value: 40 }, standIn)
      const attrs = scene.get(root).attrs
      assert.strictEqual(attrs?.["aria-valuemin"], "0")
      assert.strictEqual(attrs?.["aria-valuemax"], "100")
      assert.strictEqual(attrs?.["aria-valuenow"], "40")
      assert.strictEqual(attrs?.["aria-valuetext"], "40%")
      assert.strictEqual(scene.get(label).attrs?.role, "presentation")
      const labelId = scene.get(label).attrs?.id
      assert.isString(labelId)
      assert.notStrictEqual(labelId, "custom-label")
      assert.strictEqual(attrs?.["aria-labelledby"], `heading ${labelId}`)
      // NVDA needs visually hidden content after the consumer's children to read the label.
      const helper = scene.get(root).children?.at(-1)
      assert(helper)
      assert.strictEqual(helper.attrs?.role, "presentation")
      assert.match(helper.attrs?.style ?? "", /clip:rect\(0,0,0,0\)/)
      assert.isUndefined(helper.attrs?.["aria-hidden"])
      assert.strictEqual(Locator.textOf(helper), "x")
      assert.strictEqual(scene.get(value).attrs?.["aria-hidden"], "true")
      assert.strictEqual(Locator.textOf(scene.get(value)), "40%")

      const custom = built(parts({ value: 40 }).value(h.span).children("four"))
      assert.deepStrictEqual(custom.children, [{ _tag: "Text", text: "four" }])

      scene.props({ value: 150, min: 50, max: 250, valueText: "150 units" })
      const next = scene.get(root).attrs
      assert.strictEqual(next?.["aria-valuemin"], "50")
      assert.strictEqual(next?.["aria-valuemax"], "250")
      assert.strictEqual(next?.["aria-valuenow"], "150")
      assert.strictEqual(next?.["aria-valuetext"], "150 units")
      assert.strictEqual(Locator.textOf(scene.get(value)), "150 units")
      assert.strictEqual(
        scene.get(indicator).attrs?.style,
        "background:red;width:1px;inset-inline-start:0;height:inherit;width:50%"
      )
    }))

  it("a value outside the range is clamped, NaN counts as min, and an empty range is 0%", () => {
    const at = (props: MeterProps) => {
      const meter = parts(props)
      return [
        built(meter.root(h.div)).attrs["aria-valuenow"],
        meter.percentage,
        meter.valueText
      ]
    }
    assert.deepStrictEqual(at({ value: -5 }), ["0", 0, "0%"])
    assert.deepStrictEqual(at({ value: Number.NaN, min: 10, max: 20 }), [
      "10",
      0,
      "0%"
    ])
    assert.deepStrictEqual(at({ value: 5, min: 5, max: 5 }), ["5", 0, "0%"])
    assert.deepStrictEqual(at({ value: 10, min: 5, max: 5 }), ["5", 0, "0%"])
  })
})
