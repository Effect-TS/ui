import { Canvas } from "@effect/ui/html"
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { CANVAS_HEIGHT, CANVAS_WIDTH, CanvasArt, type CanvasArtModel, GenerateBall, sceneOf } from "./CanvasArt.ts"

const empty: CanvasArtModel = { balls: [], nextId: 0, running: true }

const ball = { id: 0, x: 100, y: 100, vx: 50, vy: 0, radius: 10, color: "#ff2d55" }

const paint = (model: CanvasArtModel) =>
  Canvas.Paint({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    pixelRatio: "auto",
    listen: ["pointerdown"],
    shapes: sceneOf(model)
  })

const press = { button: 0, shift: false, ctrl: false, alt: false, meta: false, pointerType: "mouse" as const }

describe("CanvasArt", () => {
  it.effect("shows the heading, the prompt and the controls", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(CanvasArt, {})
      s.given(empty)
        .expectMount(paint(empty))
        .expect(HtmlLocator.role("heading", { name: "Canvas Art" })).toExist()
        .expect(Locator.text("Click the canvas to spawn a ball.")).toExist()
        .expect(HtmlLocator.role("button", { name: "Pause" })).toExist()
        .expect(Locator.text("0 balls")).toExist()
    }))

  it.effect("a press on the canvas spawns a ball there, and the scene draws it", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(CanvasArt, {})
      s.given(empty)
        .expectMount(paint(empty))
        .mounted(Canvas.Paint, { ...press, event: "pointerdown", x: 100, y: 100 })
        .resolve(GenerateBall, { x: 100, y: 100, vx: 50, vy: 0, radius: 10, color: "#ff2d55" })
        .expect(Locator.text("1 balls")).toExist()
        .expectMount(paint({ ...empty, balls: [ball], nextId: 1 }))
    }))

  it.effect("a frame moves the balls, and Pause stops the frames", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(CanvasArt, {})
      s.given({ ...empty, balls: [ball], nextId: 1 })
        .expectMount(paint({ ...empty, balls: [ball], nextId: 1 }))
        .frame(20)
        .expectMount(paint({ ...empty, balls: [{ ...ball, x: 101 }], nextId: 1 }))
        .click(HtmlLocator.role("button", { name: "Pause" }))
        .expect(HtmlLocator.role("button", { name: "Play" })).toExist()
      s.click(HtmlLocator.role("button", { name: "Clear" }))
        .expectMount(paint(empty))
        .expect(Locator.text("0 balls")).toExist()
    }))
})
