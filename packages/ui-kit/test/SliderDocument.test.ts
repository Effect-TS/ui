// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Slider } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, tick } from "./utils/document.ts"

const Message = UiSchema.TaggedEnum({
  Moved: { value: Schema.Number },
  Committed: {}
})

const Page = Html.component({
  name: "Page",
  model: Schema.Struct({ value: Schema.Number, commits: Schema.Number }),
  message: Message
}).make({
  init: () => ({ value: 40, commits: 0 }),
  update: {
    Moved: ($, { value }) => $.evolve({ value }),
    Committed: ($) => $.evolve({ commits: $.model.commits + 1 })
  },
  view: (h, model) =>
    Slider(h, {
      props: { value: model.value },
      onEmit: (event) =>
        typeof event.value !== "number"
          ? undefined
          : event._tag === "Moved"
          ? Message.Moved({ value: event.value })
          : Message.Committed(),
      view: (slider) =>
        slider.root(h.div).children(
          slider.control(h.div.class("control")).children(
            slider.track(h.div).children(
              slider.thumb({ element: h.div.class("thumb"), input: h.input })
            )
          )
        )
    })
})

const pointer = (target: EventTarget, type: string, clientX: number) =>
  target.dispatchEvent(
    new PointerEvent(type, {
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX,
      pointerId: 1,
      bubbles: true,
      cancelable: true
    })
  )

it.effect("a track press reads a direction change made in the same task, before focus enters the slider", () =>
  Effect.gen(function*() {
    const app = yield* container
    yield* BrowserHost.mountEffect(Page, {}, app)
    yield* tick
    const control = app.querySelector<HTMLElement>(".control")!
    control.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 100,
        top: 0,
        bottom: 10,
        width: 100,
        height: 10
      }) as DOMRect
    app.style.direction = "rtl"
    pointer(control, "pointerdown", 30)
    pointer(document, "pointerup", 30)
    yield* tick
    // Thirty from the left is seventy from the right.
    assert.strictEqual(app.querySelector("input")!.value, "70")
  }).pipe(Effect.scoped))

it.effect("inside a shadow root, a direction change there or above its host moves the thumb", () =>
  Effect.gen(function*() {
    const app = yield* container
    const shadow = app.appendChild(document.createElement("div"))
      .attachShadow({ mode: "open" })
    const wrapper = shadow.appendChild(document.createElement("div"))
    yield* BrowserHost.mountEffect(Page, {}, wrapper)
    yield* tick
    const thumb = () => shadow.querySelector(".thumb")!.getAttribute("style")
    assert.strictEqual(thumb(), "--slider-thumb-position:40%")
    wrapper.style.direction = "rtl"
    yield* tick
    assert.strictEqual(thumb(), "--slider-thumb-position:60%")
    wrapper.style.removeProperty("direction")
    yield* tick
    assert.strictEqual(thumb(), "--slider-thumb-position:40%")
    app.style.direction = "rtl"
    yield* tick
    assert.strictEqual(thumb(), "--slider-thumb-position:60%")
  }).pipe(Effect.scoped))

it.effect("a lost pointer capture or window blur ends a drag with one commit, and later moves and releases change nothing", () =>
  Effect.gen(function*() {
    const app = yield* container
    const root = yield* BrowserHost.mountEffect(Page, {}, app)
    yield* tick
    const control = app.querySelector<HTMLElement>(".control")!
    control.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 100,
        top: 0,
        bottom: 10,
        width: 100,
        height: 10
      }) as DOMRect
    const slider = app.firstElementChild!
    const interruptions = [
      () => {
        control.releasePointerCapture(1)
        control.dispatchEvent(
          new PointerEvent("lostpointercapture", { pointerId: 1 })
        )
      },
      () => window.dispatchEvent(new Event("blur"))
    ]
    for (const [index, interrupt] of interruptions.entries()) {
      pointer(control, "pointerdown", 30)
      pointer(document, "pointermove", 50)
      yield* tick
      assert.isTrue(slider.hasAttribute("data-dragging"))
      interrupt()
      yield* tick
      assert.isFalse(slider.hasAttribute("data-dragging"))
      assert.strictEqual(root.model()!.commits, index + 1)
      pointer(document, "pointermove", 80)
      pointer(document, "pointerup", 80)
      yield* tick
      assert.strictEqual(root.model()!.value, 50)
      assert.strictEqual(root.model()!.commits, index + 1)
    }
  }).pipe(Effect.scoped))
