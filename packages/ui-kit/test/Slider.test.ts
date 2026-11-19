import type { Component, Mount } from "@effect/ui"
import { View } from "@effect/ui"
import { Slider, type SliderEvents, type SliderProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof Slider>
type H = View.Helper<never, SliderProps> & View.Tags<Html.Elements, never>

// Every part, with a thumb per value, each input named.
const standIn = {
  elements: Html,
  view: (s: Parts, h: H) =>
    s.root(h.div.class("slider")).children(
      s.value(h.output).children(s.values.join(" - ")),
      s.control(h.div.class("control")).children(
        s.track(h.div.class("track")).children(
          s.indicator(h.div.class("indicator")),
          ...s.values.map((_, index) =>
            s.thumb({
              element: h.div.class("thumb").key(String(index)),
              input: h.input.attr("aria-label", "Thumb " + index),
              index: s.values.length > 1 ? index : undefined
            })
          )
        )
      )
    )
}

const input = (index = 0) => Locator.attr("aria-label", "Thumb " + index)
const thumb = (index = 0) => Locator.attr("data-index", String(index))
const control = Locator.attr("class", "control")
const indicator = Locator.attr("class", "indicator")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const released = { active: -1, pressed: -1, pressedValues: [], moved: null }
const parts = (props: SliderProps) => Story.parts(Slider, { model: released, props })

type TrackPointer = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
// The control's mount is private, so a test reads it off the rendered element.
const tracked = (s: Rendered): TrackPointer =>
  (s.get(control) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as TrackPointer
// What the mount's Stream reports.
const pressed = (index: number, fraction: number, onThumb = false) =>
  ({ _tag: "Pressed", index, fraction, onThumb }) as never
const moved = (fraction: number) => ({ _tag: "Moved", fraction }) as never
const releasedPointer = { _tag: "Released" } as never

const both = (value: number | ReadonlyArray<number>): readonly [SliderEvents, SliderEvents] => [
  { _tag: "Moved", value },
  { _tag: "Committed", value }
]

// Nothing emitted since the last acknowledged event.
const quiet = (s: { readonly current: { readonly emitted: ReadonlyArray<unknown> } }) =>
  assert.deepStrictEqual(s.current.emitted, [])

const key = (key: string, shift = false) => ({ key, shift, ctrl: false, alt: false, meta: false, repeat: false })

describe("Slider", () => {
  it.effect("a thumb's input is a range input at the value, and the thumb and indicator get their positions", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Slider, { value: 40, min: 0, max: 200, step: 5 }, standIn)
      s.expectMount(tracked(s))
      assert.deepInclude(s.get(input()).attrs, {
        type: "range",
        min: "0",
        max: "200",
        step: "5",
        "aria-orientation": "horizontal",
        "aria-valuenow": "40"
      })
      assert.strictEqual(s.get(input()).props?.value, "40")
      assert.isUndefined(s.get(input()).attrs?.["aria-valuetext"])
      assert.match(
        s.get(input()).attrs?.style ?? "",
        /^position:absolute;width:100%;height:100%;.*clip:rect\(0,0,0,0\)/
      )
      assert.deepInclude(s.get(thumb()).attrs, {
        style: "--slider-thumb-position:20%",
        "data-orientation": "horizontal"
      })
      assert.strictEqual(s.get(indicator).attrs?.style, "--slider-indicator-start:0%;--slider-indicator-size:20%")
      assert.deepInclude(s.get(Locator.attr("class", "slider")).attrs, {
        role: "group",
        "data-orientation": "horizontal"
      })
      assert.deepInclude(s.get(Locator.tag("output")).attrs, { "aria-live": "off" })
      // The input is inside the thumb.
      assert.strictEqual(s.get(thumb()).children?.[0], s.get(input()))
    }))

  it.effect("the keys move the focused thumb by a step or a large step, to the ends, and commit at once", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Slider, { value: 40, largeStep: 20 }, standIn)
      s.expectMount(tracked(s))
      s.fire(input(), "keydown", key("ArrowRight")).emitted(...both(41)).expectDefaultPrevented()
      s.fire(input(), "keydown", key("ArrowUp")).emitted(...both(41))
      s.fire(input(), "keydown", key("ArrowLeft")).emitted(...both(39))
      s.fire(input(), "keydown", key("ArrowDown")).emitted(...both(39))
      s.fire(input(), "keydown", key("ArrowRight", true)).emitted(...both(60))
      s.fire(input(), "keydown", key("PageUp")).emitted(...both(60))
      s.fire(input(), "keydown", key("PageDown")).emitted(...both(20))
      s.fire(input(), "keydown", key("Home")).emitted(...both(0))
      s.fire(input(), "keydown", key("End")).emitted(...both(100))
      // Other keys keep their default, so Tab moves focus.
      s.fire(input(), "keydown", key("Tab")).expectIgnored().expectDefaultPrevented(false)
      s.fire(input(), "keydown", key("a")).expectIgnored().expectDefaultPrevented(false)
      // At the end, a key that would go past it reports nothing.
      s.props({ value: 100 })
      s.fire(input(), "keydown", key("End"))
      quiet(s)
      s.fire(input(), "keydown", key("ArrowRight"))
      quiet(s)
    }))

  it.effect("the input's own change is reported and committed, kept within the range", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Slider, { value: 40 }, standIn)
      s.expectMount(tracked(s))
      s.fire(input(), "input", { value: "55" }).emitted(...both(55))
      s.fire(input(), "input", { value: "" })
      quiet(s)
      s.fire(input(), "input", { value: "500" }).emitted(...both(100))
    }))

  it.effect("a press on the track moves the nearest thumb there, a drag follows the pointer, and the release commits", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Slider, { value: 40 }, standIn)
      s.expectMount(tracked(s))
      s.mounted(tracked(s), pressed(0, 0.754)).emitted({ _tag: "Moved", value: 75 })
      s.parts((p) => assert.isTrue(p.dragging))
      assert.strictEqual(s.get(thumb()).attrs?.["data-dragging"], "")
      assert.strictEqual(s.get(control).attrs?.["data-dragging"], "")
      s.props({ value: 75 })
      s.mounted(tracked(s), moved(0.9)).emitted({ _tag: "Moved", value: 90 })
      s.props({ value: 90 })
      // Past the end, the value stops at max.
      s.mounted(tracked(s), moved(1.4)).emitted({ _tag: "Moved", value: 100 })
      s.props({ value: 100 })
      s.mounted(tracked(s), releasedPointer).emitted({ _tag: "Committed", value: 100 })
      s.parts((p) => assert.isFalse(p.dragging))
      assert.isUndefined(s.get(thumb()).attrs?.["data-dragging"])
    }))

  it.effect("a thumb pressed where it is moves only once the pointer does, and a press with no move commits nothing", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Slider, { value: 40 }, standIn)
      s.expectMount(tracked(s))
      s.mounted(tracked(s), pressed(0, 0.4, true))
      quiet(s)
      s.mounted(tracked(s), releasedPointer)
      quiet(s)
      s.mounted(tracked(s), pressed(0, 0.4, true))
      quiet(s)
      s.mounted(tracked(s), moved(0.45)).emitted({ _tag: "Moved", value: 45 })
    }))

  it.effect("a disabled slider reports nothing and disables its inputs", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Slider, { value: 40, disabled: true }, standIn)
      s.expectMount(tracked(s))
      assert.strictEqual(s.get(input()).attrs?.disabled, "")
      for (const locator of [thumb(), control, indicator, Locator.tag("output"), Locator.attr("class", "slider")]) {
        assert.strictEqual(s.get(locator).attrs?.["data-disabled"], "")
      }
      s.fire(input(), "keydown", key("ArrowRight"))
      quiet(s)
      s.fire(input(), "input", { value: "60" })
      quiet(s)
      s.mounted(tracked(s), pressed(0, 0.8))
      quiet(s)
      s.mounted(tracked(s), moved(0.9))
      quiet(s)
      s.parts((p) => assert.isFalse(p.dragging))
    }))

  it.effect("a key lands on the step grid the native input shows, which also measures the gap between thumbs", () =>
    Effect.gen(function*() {
      // A large step off the grid goes to the nearest step, as the input
      // would show it.
      const s = yield* Scene.make(Slider, { value: 0, max: 12, step: 3, largeStep: 5 }, standIn)
      s.expectMount(tracked(s))
      s.fire(input(), "keydown", key("PageUp")).emitted(...both(6))
      // A max between two steps: the last step below it is the end.
      s.props({ value: 0, max: 10, step: 3 })
      s.fire(input(), "keydown", key("End")).emitted(...both(9))
      s.mounted(tracked(s), pressed(0, 1)).emitted({ _tag: "Moved", value: 9 })
      s.mounted(tracked(s), releasedPointer).emitted({ _tag: "Committed", value: 9 })
      // A value off the grid shows at the step the native input shows, which
      // also bounds its neighbour.
      s.props({ value: [0, 5], max: 12, step: 3 })
      s.parts((p) => assert.deepStrictEqual(p.values, [0, 6]))
      assert.strictEqual(s.get(input(1)).attrs?.["aria-valuenow"], "6")
      s.fire(input(0), "keydown", key("End")).emitted(...both([6, 6]))
      // Decimal steps keep exactly the gap.
      s.props({ value: [0.1, 0.3], step: 0.1, minStepsBetweenValues: 1 })
      s.fire(input(0), "keydown", key("ArrowRight")).emitted(...both([0.2, 0.3]))
      s.fire(input(0), "keydown", key("End")).emitted(...both([0.2, 0.3]))
      s.fire(input(1), "keydown", key("Home")).emitted(...both([0.1, 0.2]))
    }))

  it.effect("a range has a thumb per value, which says which end it is, and Home and End stop at the other thumb", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Slider, { value: [70, 20], minStepsBetweenValues: 5 }, standIn)
      s.expectMount(tracked(s))
      // The values are sorted.
      s.parts((p) => assert.deepStrictEqual(p.values, [20, 70]))
      assert.strictEqual(s.get(input(0)).attrs?.["aria-valuetext"], "20 start range")
      assert.strictEqual(s.get(input(1)).attrs?.["aria-valuetext"], "70 end range")
      assert.strictEqual(s.get(input(1)).props?.value, "70")
      assert.strictEqual(s.get(indicator).attrs?.style, "--slider-indicator-start:20%;--slider-indicator-size:50%")
      s.fire(input(1), "keydown", key("Home")).emitted(...both([20, 25]))
      s.fire(input(0), "keydown", key("End")).emitted(...both([65, 70]))
      s.fire(input(0), "keydown", key("Home")).emitted(...both([0, 70]))
      // A key that brings the thumbs closer than the gap reports nothing.
      s.props({ value: [65, 70], minStepsBetweenValues: 5 })
      s.fire(input(0), "keydown", key("ArrowRight"))
      quiet(s)
      s.fire(input(0), "focus").parts((p) => assert.strictEqual(p.activeThumbIndex, 0))
      s.fire(input(0), "blur").parts((p) => assert.strictEqual(p.activeThumbIndex, -1))
    }))

  it.effect("a press on the track drags the nearest thumb, which pushes the other along and leaves it there", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Slider, { value: [20, 60], minStepsBetweenValues: 10 }, standIn)
      s.expectMount(tracked(s))
      // The control's mount picks the thumb; the press drags it there.
      s.mounted(tracked(s), pressed(0, 0.3)).emitted({ _tag: "Moved", value: [30, 60] })
      s.props({ value: [30, 60], minStepsBetweenValues: 10 })
      s.mounted(tracked(s), moved(0.8)).emitted({ _tag: "Moved", value: [80, 90] })
      s.props({ value: [80, 90], minStepsBetweenValues: 10 })
      // Dragged back, the pushed thumb stays where it was pushed.
      s.mounted(tracked(s), moved(0.4)).emitted({ _tag: "Moved", value: [40, 90] })
      s.props({ value: [40, 90], minStepsBetweenValues: 10 })
      s.mounted(tracked(s), releasedPointer).emitted({ _tag: "Committed", value: [40, 90] })
    }))

  it.effect("with swap, a thumb dragged past the other trades places and the drag goes on with the other thumb", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Slider, { value: [20, 60], thumbCollisionBehavior: "swap" }, standIn)
      s.expectMount(tracked(s))
      s.mounted(tracked(s), pressed(0, 0.2, true))
      quiet(s)
      s.mounted(tracked(s), moved(0.8)).emitted({ _tag: "Moved", value: [60, 80] })
      s.props({ value: [60, 80], thumbCollisionBehavior: "swap" })
      s.parts((p) => assert.isTrue(p.dragging))
      // The drag now moves the thumb at index 1.
      s.mounted(tracked(s), moved(0.9)).emitted({ _tag: "Moved", value: [60, 90] })
    }))

  it.effect("with none, a dragged thumb stops at the other", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Slider, { value: [20, 60], thumbCollisionBehavior: "none" }, standIn)
      s.expectMount(tracked(s))
      s.mounted(tracked(s), pressed(0, 0.2, true))
      quiet(s)
      s.mounted(tracked(s), moved(0.8)).emitted({ _tag: "Moved", value: [60, 60] })
    }))

  it.effect("a fractional step lands on its multiples without floating-point error", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Slider, { value: 0.3, min: 0, max: 1, step: 0.1 }, standIn)
      s.expectMount(tracked(s))
      s.fire(input(), "keydown", key("ArrowRight")).emitted(...both(0.4))
      s.mounted(tracked(s), pressed(0, 0.71)).emitted({ _tag: "Moved", value: 0.7 })
    }))

  it.effect("a vertical slider says so on every part and its inputs", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Slider, { value: 10, orientation: "vertical" }, standIn)
      s.expectMount(tracked(s))
      assert.strictEqual(s.get(input()).attrs?.["aria-orientation"], "vertical")
      assert.match(s.get(input()).attrs?.style ?? "", /writing-mode:vertical-lr$/)
      assert.strictEqual(s.get(control).attrs?.["data-orientation"], "vertical")
    }))

  it("the thumb keeps the consumer's attributes on the input, but the slider's own win, present or absent", () => {
    const element = h.input
      .class("range")
      .attr("name", "volume")
      .attr("aria-label", "Volume")
      .attr("aria-valuetext", "Loud")
      .attr("type", "text")
      .attr("min", "5")
      .attr("value", "3")
      .attr("aria-disabled", "true")
      .attr("style", "color:red")
      .disabled(true)
    const built = View.build(parts({ value: 40 }).thumb({ element: h.div.class("thumb"), input: element }), [])
    const inner = built.children?.[0] as View.Element<unknown>
    assert.strictEqual(inner.tag, "input")
    const attrs = inner.attrs ?? {}
    assert.deepInclude(attrs, {
      class: "range",
      name: "volume",
      "aria-label": "Volume",
      "aria-valuetext": "Loud",
      type: "range",
      min: "0",
      max: "100"
    })
    assert.isUndefined(attrs["aria-disabled"])
    assert.isUndefined(attrs.disabled)
    assert.match(attrs.style ?? "", /^color:red;position:absolute/)
    assert.deepInclude(built.attrs, { class: "thumb", "data-index": "0" })
  })

  it("a thumb needs an index with an array value, and one that has a value", () => {
    const thumbOf = (props: SliderProps, index?: number) => () =>
      parts(props).thumb({ element: h.div, input: h.input, index })
    assert.throws(thumbOf({ value: [10, 20] }), /needs its index/)
    assert.throws(thumbOf({ value: [10, 20] }, 2), /no value for the thumb at index 2/)
    assert.throws(thumbOf({ value: 10 }, 1), /no value for the thumb at index 1/)
    assert.doesNotThrow(thumbOf({ value: [10, 20] }, 1))
  })

  it("the input is a native input, the value an output and the control a div", () => {
    const p = parts({ value: 10 })
    assert.throws(() => p.thumb({ element: h.div, input: h.button as any }), /a part for <input> was given <button>/)
    assert.throws(() => p.value(h.div as any), /a part for <output> was given <div>/)
    assert.throws(() => p.control(h.span as any), /a part for <div> was given <span>/)
  })
})
