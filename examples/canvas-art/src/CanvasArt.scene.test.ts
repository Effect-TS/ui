import { Canvas } from "@effect/ui/html"
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CanvasArt,
  GenerateBall
} from "./CanvasArt.ts"

const background = Canvas.Rect({
  x: 0,
  y: 0,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  fill: "#0a0a0f"
})

const paint = (shapes: ReadonlyArray<Canvas.Shape>) =>
  Canvas.Paint({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    pixelRatio: "auto",
    listen: ["pointerdown"],
    shapes: [background, ...shapes]
  })

const press = {
  button: 0,
  shift: false,
  ctrl: false,
  alt: false,
  meta: false,
  pointerType: "mouse" as const
}

describe("CanvasArt", () => {
  it.effect("spawns a ball on canvas press, advances it on frame, pauses, and clears", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(CanvasArt, {})
      scene.expectMount(paint([]))
        .expect(HtmlLocator.role("heading", { name: "Canvas Art" })).toExist()
        .expect(Locator.text("Click the canvas to spawn a ball.")).toExist()
        .expect(HtmlLocator.role("button", { name: "Pause" })).toExist()
        .expect(Locator.text("0 balls")).toExist()
        .mounted(Canvas.Paint, {
          ...press,
          event: "pointerdown",
          x: 100,
          y: 100
        })
        .resolve(GenerateBall, {
          x: 100,
          y: 100,
          vx: 50,
          vy: 0,
          radius: 10,
          color: "#ff2d55"
        })
        .expect(Locator.text("1 balls")).toExist()
        .expectMount(
          paint([
            Canvas.Circle({ x: 100, y: 100, radius: 10, fill: "#ff2d55" })
          ])
        )
        .frame(20)
        .expectMount(
          paint([
            Canvas.Circle({ x: 101, y: 100, radius: 10, fill: "#ff2d55" })
          ])
        )
        .click(HtmlLocator.role("button", { name: "Pause" }))
        .expect(HtmlLocator.role("button", { name: "Play" })).toExist()
        .click(HtmlLocator.role("button", { name: "Clear" }))
        .expectMount(paint([]))
        .expect(Locator.text("0 balls")).toExist()
    }))
})
