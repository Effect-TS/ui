import type { Component, Mount } from "@effect/ui"
import { View } from "@effect/ui"
import { Slider, type SliderEvents, type SliderProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof Slider>
type H = View.Helper<never, SliderProps> & View.Tags<Html.Elements, never>

// Every part, with a thumb per value, each input named.
const standIn = {
  elements: Html,
  view: (slider: Parts, h: H) =>
    slider.root(h.div.class("slider")).children(
      slider.value(h.output).children(slider.values.join(" - ")),
      slider.control(h.div.class("control")).children(
        slider.track(h.div.class("track")).children(
          slider.indicator(h.div.class("indicator")),
          ...slider.values.map((_, index) =>
            slider.thumb({
              element: h.div.class("thumb").key(String(index)),
              input: h.input.attr("aria-label", "Thumb " + index),
              index: slider.values.length > 1 ? index : undefined
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
const parts = (props: SliderProps) =>
  Story.parts(Slider, { model: released, props })

type TrackPointer = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
// The control's mount is private, so a test reads it off the rendered element.
const tracked = (scene: Rendered): TrackPointer =>
  (scene.get(control) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)
    ?.mount as unknown as TrackPointer
const makeScene = (props: SliderProps) =>
  HtmlScene.make(Slider, props, standIn).pipe(
    Effect.map((scene) => scene.expectMount(tracked(scene)))
  )

// What the mount's Stream reports.
const pressed = (index: number, fraction: number, onThumb = false) =>
  ({ _tag: "PressedPointer", index, fraction, onThumb }) as never
const moved = (fraction: number) =>
  ({ _tag: "MovedPointer", fraction }) as never
const releasedPointer = { _tag: "ReleasedPointer" } as never

const both = (
  value: number | ReadonlyArray<number>
): readonly [SliderEvents, SliderEvents] => [
  { _tag: "Moved", value },
  { _tag: "Committed", value }
]

// Nothing emitted since the last acknowledged event.
const quiet = (
  scene: { readonly current: { readonly emitted: ReadonlyArray<unknown> } }
) => assert.deepStrictEqual(scene.current.emitted, [])

describe("Slider", () => {
  it.effect("a thumb's input is a range input at the value, and the thumb and indicator get their positions", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ value: 40, min: 0, max: 200, step: 5 })
      assert.deepInclude(scene.get(input()).attrs, {
        type: "range",
        min: "0",
        max: "200",
        step: "5",
        "aria-orientation": "horizontal",
        "aria-valuenow": "40"
      })
      assert.strictEqual(scene.get(input()).props?.value, "40")
      assert.isUndefined(scene.get(input()).attrs?.["aria-valuetext"])
      assert.match(
        scene.get(input()).attrs?.style ?? "",
        /^position:absolute;width:100%;height:100%;.*clip:rect\(0,0,0,0\)/
      )
      assert.deepInclude(scene.get(thumb()).attrs, {
        style: "--slider-thumb-position:20%",
        "data-orientation": "horizontal"
      })
      assert.strictEqual(
        scene.get(indicator).attrs?.style,
        "--slider-indicator-start:0%;--slider-indicator-size:20%"
      )
      assert.deepInclude(scene.get(Locator.attr("class", "slider")).attrs, {
        role: "group",
        "data-orientation": "horizontal"
      })
      assert.deepInclude(scene.get(Locator.tag("output")).attrs, {
        "aria-live": "off"
      })
      // The input is inside the thumb.
      assert.strictEqual(scene.get(thumb()).children?.[0], scene.get(input()))
      scene.props({ value: 40, orientation: "vertical" })
      assert.strictEqual(
        scene.get(input()).attrs?.["aria-orientation"],
        "vertical"
      )
      assert.match(
        scene.get(input()).attrs?.style ?? "",
        /writing-mode:vertical-lr$/
      )
      assert.strictEqual(
        scene.get(control).attrs?.["data-orientation"],
        "vertical"
      )
    }))

  it.effect("the keys move the focused thumb by a step or a large step, to the ends, and commit at once", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ value: 40, largeStep: 20 })
      scene.keydown(input(), "ArrowRight").emitted(...both(41))
        .expectDefaultPrevented()
      scene.keydown(input(), "ArrowUp").emitted(...both(41))
      scene.keydown(input(), "ArrowLeft").emitted(...both(39))
      scene.keydown(input(), "ArrowDown").emitted(...both(39))
      scene.keydown(input(), "ArrowRight", { shift: true }).emitted(...both(60))
      scene.keydown(input(), "PageUp").emitted(...both(60))
      scene.keydown(input(), "PageDown").emitted(...both(20))
      scene.keydown(input(), "Home").emitted(...both(0))
      scene.keydown(input(), "End").emitted(...both(100))
      // Other keys keep their default, so Tab moves focus.
      scene.keydown(input(), "Tab").expectIgnored().expectDefaultPrevented(
        false
      )
      // At the end, a key that would go past it reports nothing.
      scene.props({ value: 100 })
      scene.keydown(input(), "ArrowRight")
      quiet(scene)
    }))

  it.effect("the input's own change is reported and committed, kept within the range", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ value: 40 })
      scene.type(input(), "55").emitted(...both(55))
      scene.type(input(), "")
      quiet(scene)
      scene.type(input(), "500").emitted(...both(100))
    }))

  it.effect("a click on the thumb is quiet; dragging snaps to a step and commits only on release", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ value: 0.3, max: 1, step: 0.1 })
      scene.keydown(input(), "ArrowRight").emitted(...both(0.4))
      scene.mounted(tracked(scene), pressed(0, 0.3, true))
      quiet(scene)
      scene.mounted(tracked(scene), releasedPointer)
      quiet(scene)
      scene.mounted(tracked(scene), pressed(0, 0.3, true))
      scene.mounted(tracked(scene), moved(0.71)).emitted({
        _tag: "Moved",
        value: 0.7
      })
      scene.parts((slider) => assert.isTrue(slider.dragging))
      assert.strictEqual(scene.get(thumb()).attrs?.["data-dragging"], "")
      assert.strictEqual(scene.get(control).attrs?.["data-dragging"], "")
      scene.props({ value: 0.7, max: 1, step: 0.1 })
      scene.mounted(tracked(scene), moved(1.4)).emitted({
        _tag: "Moved",
        value: 1
      })
      scene.mounted(tracked(scene), releasedPointer).emitted({
        _tag: "Committed",
        value: 1
      })
      scene.parts((slider) => assert.isFalse(slider.dragging))
      assert.isUndefined(scene.get(thumb()).attrs?.["data-dragging"])
    }))

  it.effect("a disabled slider reports nothing and disables its inputs", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ value: 40, disabled: true })
      assert.strictEqual(scene.get(input()).attrs?.disabled, "")
      for (
        const locator of [
          thumb(),
          control,
          indicator,
          Locator.tag("output"),
          Locator.attr("class", "slider")
        ]
      ) {
        assert.strictEqual(scene.get(locator).attrs?.["data-disabled"], "")
      }
      scene.keydown(input(), "ArrowRight")
      quiet(scene)
      scene.type(input(), "60")
      quiet(scene)
      scene.mounted(tracked(scene), pressed(0, 0.8))
      quiet(scene)
      scene.parts((slider) => assert.isFalse(slider.dragging))
    }))

  it.effect("a key lands on the step grid the native input shows, which also measures the gap between thumbs", () =>
    Effect.gen(function*() {
      // A large step off the grid goes to the nearest step, as the input
      // would show it.
      const scene = yield* makeScene({
        value: 0,
        max: 12,
        step: 3,
        largeStep: 5
      })
      scene.keydown(input(), "PageUp").emitted(...both(6))
      // A max between two steps: the last step below it is the end.
      scene.props({ value: 0, max: 10, step: 3 })
      scene.keydown(input(), "End").emitted(...both(9))
      scene.mounted(tracked(scene), pressed(0, 1)).emitted({
        _tag: "Moved",
        value: 9
      })
      scene.mounted(tracked(scene), releasedPointer).emitted({
        _tag: "Committed",
        value: 9
      })
      // A value off the grid shows at the step the native input shows, which
      // also bounds its neighbour.
      scene.props({ value: [0, 5], max: 12, step: 3 })
      scene.parts((slider) => assert.deepStrictEqual(slider.values, [0, 6]))
      assert.strictEqual(scene.get(input(1)).attrs?.["aria-valuenow"], "6")
      scene.keydown(input(0), "End").emitted(...both([6, 6]))
      // Decimal steps keep exactly the gap.
      scene.props({ value: [0.1, 0.3], step: 0.1, minStepsBetweenValues: 1 })
      scene.keydown(input(0), "End").emitted(...both([0.2, 0.3]))
      scene.keydown(input(1), "Home").emitted(...both([0.1, 0.2]))
    }))

  it.effect("a range has a thumb per value, labelled by its end, and a key cannot close the gap", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({
        value: [70, 20],
        minStepsBetweenValues: 5
      })
      // The values are sorted.
      scene.parts((slider) => assert.deepStrictEqual(slider.values, [20, 70]))
      assert.strictEqual(
        scene.get(input(0)).attrs?.["aria-valuetext"],
        "20 start range"
      )
      assert.strictEqual(
        scene.get(input(1)).attrs?.["aria-valuetext"],
        "70 end range"
      )
      assert.strictEqual(scene.get(input(1)).props?.value, "70")
      assert.strictEqual(
        scene.get(indicator).attrs?.style,
        "--slider-indicator-start:20%;--slider-indicator-size:50%"
      )
      scene.keydown(input(0), "Home").emitted(...both([0, 70]))
      // A key that brings the thumbs closer than the gap reports nothing.
      scene.props({ value: [65, 70], minStepsBetweenValues: 5 })
      scene.keydown(input(0), "ArrowRight")
      quiet(scene)
      scene.focus(input(0)).parts((slider) =>
        assert.strictEqual(slider.activeThumbIndex, 0)
      )
      scene.blur(input(0)).parts((slider) =>
        assert.strictEqual(slider.activeThumbIndex, -1)
      )
    }))

  it.effect("a track press drags the selected thumb and a pushed neighbour stays put on reversal", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({
        value: [20, 60],
        minStepsBetweenValues: 10
      })
      // The control's mount picks the thumb; the press drags it there.
      scene.mounted(tracked(scene), pressed(0, 0.3)).emitted({
        _tag: "Moved",
        value: [30, 60]
      })
      scene.props({ value: [30, 60], minStepsBetweenValues: 10 })
      scene.mounted(tracked(scene), moved(0.8)).emitted({
        _tag: "Moved",
        value: [80, 90]
      })
      scene.props({ value: [80, 90], minStepsBetweenValues: 10 })
      // Dragged back, the pushed thumb stays where it was pushed.
      scene.mounted(tracked(scene), moved(0.4)).emitted({
        _tag: "Moved",
        value: [40, 90]
      })
      scene.props({ value: [40, 90], minStepsBetweenValues: 10 })
      scene.mounted(tracked(scene), releasedPointer).emitted({
        _tag: "Committed",
        value: [40, 90]
      })
    }))

  it.effect("with swap, a thumb dragged past the other trades places and the drag goes on with the other thumb", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({
        value: [20, 60],
        thumbCollisionBehavior: "swap"
      })
      scene.mounted(tracked(scene), pressed(0, 0.2, true))
      quiet(scene)
      scene.mounted(tracked(scene), moved(0.8)).emitted({
        _tag: "Moved",
        value: [60, 80]
      })
      scene.props({ value: [60, 80], thumbCollisionBehavior: "swap" })
      // The drag now moves the thumb at index 1.
      scene.mounted(tracked(scene), moved(0.9)).emitted({
        _tag: "Moved",
        value: [60, 90]
      })
    }))

  it.effect("with none, a dragged thumb stops at the other", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({
        value: [20, 60],
        thumbCollisionBehavior: "none"
      })
      scene.mounted(tracked(scene), pressed(0, 0.2, true))
      scene.mounted(tracked(scene), moved(0.8)).emitted({
        _tag: "Moved",
        value: [60, 60]
      })
    }))

  it("each part keeps the consumer's attributes, while the slider's own win, present or absent", () => {
    const stale = {
      "data-dragging": "",
      "data-orientation": "vertical",
      "data-disabled": ""
    }
    const slider = parts({ value: 40 })
    const element = h.input
      .class("range")
      .attrs({
        name: "volume",
        "aria-label": "Volume",
        "aria-valuetext": "Loud",
        type: "text",
        min: "5",
        max: "50",
        step: "5",
        "aria-orientation": "vertical",
        "aria-valuenow": "3",
        value: "3",
        "aria-disabled": "true",
        style: "color:red"
      })
      .value("3")
      .disabled(true)
    const built = View.build(
      slider.thumb({
        element: h.div.class("thumb").attrs({
          ...stale,
          "data-index": "9",
          style: "color:blue"
        }),
        input: element
      }),
      []
    )
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
      max: "100",
      step: "1",
      "aria-orientation": "horizontal",
      "aria-valuenow": "40"
    })
    assert.strictEqual(inner.props.value, "40")
    assert.isUndefined(attrs["aria-disabled"])
    assert.isUndefined(attrs.disabled)
    assert.match(attrs.style ?? "", /^color:red;position:absolute/)
    const expectAttrs = (
      part: View.ElementBuilder<never, never, any, any>,
      attrs: Record<string, string>
    ) =>
      assert.deepStrictEqual(View.build(part, []).attrs, {
        "data-orientation": "horizontal",
        ...attrs
      })
    expectAttrs(
      slider.root(h.div.class("slider").attrs({ ...stale, role: "region" })),
      {
        class: "slider",
        role: "group"
      }
    )
    expectAttrs(
      slider.value(
        h.output.class("value").attrs({ ...stale, "aria-live": "polite" })
      ),
      {
        class: "value",
        "aria-live": "off"
      }
    )
    expectAttrs(slider.control(h.div.class("control").attrs(stale)), {
      class: "control"
    })
    expectAttrs(slider.track(h.div.class("track").attrs(stale)), {
      class: "track"
    })
    expectAttrs(
      slider.indicator(
        h.div.class("indicator").attrs({ ...stale, style: "color:blue" })
      ),
      {
        class: "indicator",
        style:
          "color:blue;--slider-indicator-start:0%;--slider-indicator-size:40%"
      }
    )
    assert.deepStrictEqual(built.attrs, {
      class: "thumb",
      "data-orientation": "horizontal",
      "data-index": "0",
      style: "color:blue;--slider-thumb-position:40%"
    })
  })

  it("a thumb needs an index with an array value, and one that has a value", () => {
    const thumbOf = (props: SliderProps, index?: number) => () =>
      parts(props).thumb({ element: h.div, input: h.input, index })
    assert.throws(thumbOf({ value: [10, 20] }), /needs its index/)
    assert.throws(
      thumbOf({ value: [10, 20] }, 2),
      /no value for the thumb at index 2/
    )
  })

  it("the input is a native input, the value an output and the control a div", () => {
    const slider = parts({ value: 10 })
    assert.throws(
      () => slider.thumb({ element: h.div, input: h.button as any }),
      /a part for <input> was given <button>/
    )
    assert.throws(
      () => slider.value(h.div as any),
      /a part for <output> was given <div>/
    )
    assert.throws(
      () => slider.control(h.span as any),
      /a part for <div> was given <span>/
    )
  })
})
