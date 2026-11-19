import type { Component } from "@effect/ui"
import { View } from "@effect/ui"
import { Progress, type ProgressProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

// Every part, with the consumer's own name for the bar next to the label.
const standIn = {
  elements: Html,
  view: (
    s: Component.Headless.Parts<typeof Progress>,
    h: View.Helper<never, ProgressProps> & View.Tags<Html.Elements, never>
  ) =>
    s.root(h.div.attr("aria-labelledby", "heading")).children(
      s.label(h.span.class("label")).children("Uploading"),
      s.value(h.span.class("value")),
      s.track(h.div.class("track")).children(s.indicator(h.div.class("fill")))
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

describe("Progress", () => {
  it.effect("the label names the bar, and every part reports the value as it moves to complete and to unknown", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Progress, { value: 40 }, standIn)
      const id = s.get(label).attrs?.id
      assert.isString(id)
      assert.deepInclude(s.get(root).attrs, {
        role: "progressbar",
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        "aria-valuenow": "40",
        "aria-valuetext": "40%",
        // Next to the consumer's own, which stays.
        "aria-labelledby": `heading ${id}`
      })
      assert.strictEqual(s.get(label).attrs?.role, "presentation")
      assert.strictEqual(s.get(value).attrs?.["aria-hidden"], "true")
      assert.strictEqual(Locator.textOf(s.get(value)), "40%")
      for (const part of [root, label, value, track, indicator]) {
        assert.deepStrictEqual(statesOf(s.get(part).attrs), ["data-progressing"])
      }

      // Above the range: clamped to it, and complete.
      s.props({ value: 150 })
      assert.strictEqual(s.get(root).attrs?.["aria-valuenow"], "100")
      assert.strictEqual(s.get(root).attrs?.["aria-valuetext"], "100%")
      for (const part of [root, label, value, track, indicator]) {
        assert.deepStrictEqual(statesOf(s.get(part).attrs), ["data-complete"])
      }

      s.props({ value: null })
      const attrs = s.get(root).attrs
      assert.isUndefined(attrs?.["aria-valuenow"])
      assert.strictEqual(attrs?.["aria-valuetext"], "indeterminate progress")
      assert.strictEqual(Locator.textOf(s.get(value)), "")
      assert.isUndefined(s.get(indicator).attrs?.style)
      for (const part of [root, label, value, track, indicator]) {
        assert.deepStrictEqual(statesOf(s.get(part).attrs), ["data-indeterminate"])
      }
    }))

  it("each part takes only its own tag", () => {
    const s = parts({ value: 40 })
    assert.throws(() => s.root(h.span as any), /a part for <div> was given <span>/)
    assert.throws(() => s.label(h.div as any), /a part for <span> was given <div>/)
    assert.throws(() => s.value(h.div as any), /a part for <span> was given <div>/)
    assert.throws(() => s.track(h.span as any), /a part for <div> was given <span>/)
    assert.throws(() => s.indicator(h.span as any), /a part for <div> was given <span>/)
  })

  it("the parts keep the consumer's attributes, but the bar's own win, present or absent", () => {
    const stale = <B extends { readonly attr: (name: string, value: string | undefined) => B }>(builder: B): B =>
      builder.attr("data-progressing", "").attr("data-complete", "").attr("data-indeterminate", "")
    const unknown = parts({ value: null, min: 10, max: 20 })
    const root = build(unknown.root(
      stale(h.div.class("bar"))
        .attr("aria-label", "Upload")
        .attr("role", "meter")
        .attr("aria-valuemin", "1")
        .attr("aria-valuemax", "2")
        .attr("aria-valuenow", "1")
        .attr("aria-valuetext", "half")
    ))
    assert.deepInclude(root.attrs, {
      class: "bar",
      "aria-label": "Upload",
      role: "progressbar",
      "aria-valuemin": "10",
      "aria-valuemax": "20",
      "aria-valuetext": "indeterminate progress",
      "data-indeterminate": ""
    })
    assert.isUndefined(root.attrs["aria-valuenow"])
    assert.isUndefined(root.attrs["data-progressing"])
    assert.isUndefined(root.attrs["data-complete"])

    const known = parts({ value: 40 })
    assert.deepStrictEqual(
      build(known.label(stale(h.span.class("name")).attr("id", "mine").attr("role", "note"))).attrs,
      {
        class: "name",
        id: build(known.label(h.span)).attrs.id,
        role: "presentation",
        "data-progressing": ""
      }
    )
    assert.deepStrictEqual(build(known.value(stale(h.span.class("pct")).attr("aria-hidden", "false"))).attrs, {
      class: "pct",
      "aria-hidden": "true",
      "data-progressing": ""
    })
    assert.deepStrictEqual(build(known.track(stale(h.div.class("track")))).attrs, {
      class: "track",
      "data-progressing": ""
    })
  })

  it("the root's hidden span comes after every child, including the ones chained after the part", () => {
    const children = build(parts({ value: 40 }).root(h.div.children(h.b)).children(h.i)).children
    assert.deepStrictEqual(children.map((child) => child._tag === "Element" ? child.tag : child._tag), [
      "b",
      "i",
      "span"
    ])
    const last = children[2]
    if (last?._tag !== "Element") return assert.fail("the root has no hidden span")
    assert.strictEqual(last.tag, "span")
    assert.strictEqual(last.attrs.role, "presentation")
    assert.match(last.attrs.style ?? "", /position:absolute;width:1px;height:1px/)
  })

  it("value shows the value text unless the consumer gives it children", () => {
    const textOf = (element: View.Element<never>) =>
      element.children.map((child) => child._tag === "Text" ? child.text : "").join("")
    const text = (props: ProgressProps, own?: string) =>
      textOf(build(parts(props).value(own === undefined ? h.span : h.span.children(own))))
    assert.strictEqual(text({ value: 1, max: 3 }), "33%")
    assert.strictEqual(parts({ value: 1, max: 3 }).valueText, "33%")
    // The consumer's text is the root's too.
    const given = parts({ value: 2, max: 5, valueText: "2 of 5 files" })
    assert.strictEqual(build(given.root(h.div)).attrs["aria-valuetext"], "2 of 5 files")
    assert.strictEqual(text({ value: 2, max: 5, valueText: "2 of 5 files" }), "2 of 5 files")
    assert.strictEqual(text({ value: null, valueText: "Preparing" }), "Preparing")
    assert.strictEqual(text({ value: 40 }, "Almost there"), "Almost there")
    assert.strictEqual(textOf(build(parts({ value: 40 }).value(h.span).children("Later"))), "Later")
  })

  it("the indicator's width wins over the consumer's inline style, whose other declarations stay", () => {
    const s = parts({ value: 15, min: 10, max: 20 })
    assert.strictEqual(s.status, "progressing")
    assert.strictEqual(s.percentage, 50)
    const own = "inset-inline-start:0;height:inherit;width:50%"
    assert.strictEqual(build(s.indicator(h.div)).attrs.style, own)
    // Set before the part and chained after it.
    assert.strictEqual(
      build(s.indicator(h.div.style({ width: "10%", background: "red" }))).attrs.style,
      `width:10%;background:red;${own}`
    )
    assert.strictEqual(build(s.indicator(h.div).style({ width: "10%" })).attrs.style, `width:10%;${own}`)
    // While indeterminate, the consumer's style is all there is.
    const unknown = parts({ value: Number.NaN })
    assert.strictEqual(unknown.status, "indeterminate")
    assert.isNull(unknown.percentage)
    assert.strictEqual(build(unknown.indicator(h.div.style({ width: "30%" }))).attrs.style, "width:30%")
  })
})
