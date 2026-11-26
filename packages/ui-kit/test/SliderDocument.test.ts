// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Slider } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, tick } from "./utils/document.ts"

const Message = UiSchema.TaggedEnum({ Moved: { value: Schema.Number } })

const Page = Html.component({
  name: "Page",
  model: Schema.Struct({ value: Schema.Number }),
  message: Message
}).make({
  init: () => ({ value: 40 }),
  update: { Moved: ($, { value }) => $.evolve({ value }) },
  view: (h, model) =>
    Slider(h, {
      props: { value: model.value },
      onEmit: (event) =>
        event._tag === "Moved" && typeof event.value === "number"
          ? Message.Moved({ value: event.value })
          : undefined,
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
    control.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        clientX: 30,
        pointerId: 1,
        bubbles: true,
        cancelable: true
      })
    )
    document.dispatchEvent(
      new PointerEvent("pointerup", { pointerId: 1, bubbles: true })
    )
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
