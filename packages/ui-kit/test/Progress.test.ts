import { Effect } from "effect"

import type { Component } from "@effect/ui"
import { View } from "@effect/ui"
import { Progress, type ProgressProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"

// Every part, with the consumer's own name for the bar next to the label.
const standIn = {
  elements: Html,
  view: (
    progress: Component.Headless.Parts<typeof Progress>,
    h: View.Helper<never, ProgressProps> & View.Tags<Html.Elements, never>
  ) =>
    progress.root(h.div.attr("aria-labelledby", "heading").attr("aria-valuenow", "99").attr("data-complete", ""))
      .children(
        progress.label(h.span.class("label")).children("Uploading"),
        progress.value(h.span.class("value").attr("aria-hidden", "false")),
        progress.track(h.div.class("track")).children(progress.indicator(h.div.class("fill")))
      )
}

const root = Locator.attr("role", "progressbar")
const label = Locator.attr("class", "label")
const value = Locator.attr("class", "value")
const track = Locator.attr("class", "track")
const indicator = Locator.attr("class", "fill")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const parts = (props: ProgressProps) => Story.parts(Progress, { model: {}, props })
const build = (builder: View.ElementBuilder<never, never, any, any>) => View.build(builder, [])
const statesOf = (attrs: Readonly<Record<string, string | undefined>> | undefined) =>
  ["data-progressing", "data-complete", "data-indeterminate"].filter((name) => attrs?.[name] === "")
const everyPart = [root, label, value, track, indicator]

describe("Progress", () => {
  it.effect("the label names the bar, and every part reports the value as it moves to complete and to unknown", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Progress, { value: 1, max: 3 }, standIn)
      const id = s.get(label).attrs?.id
      assert.isString(id)
      assert.deepInclude(s.get(root).attrs, {
        "aria-valuemin": "0",
        "aria-valuemax": "3",
        "aria-valuenow": "1",
        "aria-valuetext": "33%",
        // Next to the consumer's own, which stays.
        "aria-labelledby": `heading ${id}`
      })
      assert.strictEqual(s.get(label).attrs?.role, "presentation")
      assert.strictEqual(s.get(value).attrs?.["aria-hidden"], "true")
      assert.strictEqual(Locator.textOf(s.get(value)), "33%")
      for (const part of everyPart) assert.deepStrictEqual(statesOf(s.get(part).attrs), ["data-progressing"])

      s.props({ value: 1, valueText: "One file uploaded" })
      assert.strictEqual(s.get(root).attrs?.["aria-valuetext"], "One file uploaded")
      assert.strictEqual(Locator.textOf(s.get(value)), "One file uploaded")

      // Above the range: clamped to it, and complete.
      s.props({ value: 150, max: undefined, valueText: "All files uploaded" })
      assert.strictEqual(s.get(root).attrs?.["aria-valuenow"], "100")
      assert.strictEqual(s.get(root).attrs?.["aria-valuetext"], "All files uploaded")
      assert.strictEqual(Locator.textOf(s.get(value)), "All files uploaded")
      for (const part of everyPart) assert.deepStrictEqual(statesOf(s.get(part).attrs), ["data-complete"])

      s.props({ value: null, valueText: undefined })
      const attrs = s.get(root).attrs
      assert.isUndefined(s.get(indicator).attrs?.style)
      assert.isUndefined(attrs?.["aria-valuenow"])
      assert.strictEqual(attrs?.["aria-valuetext"], "indeterminate progress")
      assert.strictEqual(Locator.textOf(s.get(value)), "")
      for (const part of everyPart) assert.deepStrictEqual(statesOf(s.get(part).attrs), ["data-indeterminate"])

      s.props({ value: null, valueText: "Preparing" })
      assert.strictEqual(s.get(root).attrs?.["aria-valuetext"], "Preparing")
      assert.strictEqual(Locator.textOf(s.get(value)), "Preparing")
    }))

  it("custom value children remain visible before the root's hidden label helper", () => {
    const progress = parts({ value: 1, max: 3 })
    assert.strictEqual(progress.valueText, "33%")
    const custom = progress.value(h.span).children("Almost there")
    const before = progress.value(h.span.children("Starting"))
    const bar = build(progress.root(h.div.attr("aria-label", "Upload").children(before)).children(custom))
    assert.strictEqual(bar.attrs["aria-label"], "Upload")
    const children = bar.children
    assert.deepStrictEqual(children.map((child) => child._tag === "Element" ? child.tag : child._tag), [
      "span",
      "span",
      "span"
    ])
    const texts = children.slice(0, 2).map((node) =>
      node._tag === "Element" && node.children.map((child) => child._tag === "Text" && child.text)
    )
    assert.deepStrictEqual(texts, [["Starting"], ["Almost there"]])
    const last = children[2]
    if (last?._tag !== "Element") return assert.fail("the root has no hidden span")
    assert.strictEqual(last.attrs.role, "presentation")
    assert.match(last.attrs.style ?? "", /position:absolute;width:1px;height:1px/)
  })

  it("the indicator's width wins over the consumer's inline style, whose other declarations stay", () => {
    const progress = parts({ value: 15, min: 10, max: 20 })
    assert.strictEqual(build(progress.root(h.div)).attrs["aria-valuemin"], "10")
    assert.strictEqual(progress.status, "progressing")
    assert.strictEqual(progress.percentage, 50)
    const own = "inset-inline-start:0;height:inherit;width:50%"
    assert.strictEqual(
      build(progress.indicator(h.div).style({ background: "red", width: "10%" })).attrs.style,
      `background:red;width:10%;${own}`
    )
    assert.strictEqual(build(progress.indicator(h.div.style({ color: "red" }))).attrs.style, `color:red;${own}`)
    // While indeterminate, the consumer's style is all there is.
    const unknown = parts({ value: Number.NaN })
    assert.strictEqual(unknown.status, "indeterminate")
    assert.isNull(unknown.percentage)
    assert.strictEqual(build(unknown.indicator(h.div.style({ width: "30%" }))).attrs.style, "width:30%")
  })
})
