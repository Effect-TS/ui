import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  CanvasArt,
  CanvasArtMessage,
  type CanvasArtModel,
  GenerateBall
} from "./CanvasArt.ts"

const empty: CanvasArtModel = { balls: [], nextId: 0, running: true }

const frames = "@effect/ui/html/animationFrame"

describe("CanvasArt", () => {
  it.effect("a click generates a ball where it landed", () =>
    Effect.gen(function*() {
      const story = yield* Story.make(CanvasArt, {})
      story.given(empty)
        .send(CanvasArtMessage.ClickedCanvas({ x: 150, y: 200 }))
        .expectExact(GenerateBall.make({ x: 150, y: 200 }))
        .resolve(GenerateBall, {
          x: 150,
          y: 200,
          vx: 10,
          vy: -10,
          radius: 12,
          color: "#ff2d55"
        })
        .send(CanvasArtMessage.ClickedCanvas({ x: 1, y: 2 }))
        .resolve(GenerateBall, {
          x: 1,
          y: 2,
          vx: 0,
          vy: 0,
          radius: 8,
          color: "#fff"
        })
      assert.deepStrictEqual(story.model.balls.map(({ id, x }) => [id, x]), [[
        0,
        150
      ], [1, 1]])
      assert.strictEqual(story.model.nextId, 2)
    }))

  it.effect("a frame moves each ball, bounces it off an edge, and clamps long deltas", () =>
    Effect.gen(function*() {
      const story = yield* Story.make(CanvasArt, {})
      story.given({
        ...empty,
        balls: [
          { id: 0, x: 100, y: 100, vx: 50, vy: 50, radius: 10, color: "#fff" },
          { id: 1, x: 589, y: 200, vx: 100, vy: 0, radius: 10, color: "#fff" }
        ]
      }).subscription(frames, CanvasArtMessage.TickedFrame({ delta: 20 }))
      assert.deepStrictEqual(
        story.model.balls.map(({ vx, x, y }) => [x, y, vx]),
        [[
          101,
          101,
          50
        ], [590, 200, -100]]
      )
      story.subscription(frames, CanvasArtMessage.TickedFrame({ delta: 5000 }))
      assert.deepStrictEqual(story.model.balls.map(({ x }) => x), [103.5, 585])
    }))

  it.effect("frames come only while it runs", () =>
    Effect.gen(function*() {
      const story = yield* Story.make(CanvasArt, {})
      story.given(empty)
      assert.deepStrictEqual(story.subscriptions, [frames])
      story.send(CanvasArtMessage.ClickedTogglePlay())
      assert.deepStrictEqual(story.subscriptions, [])
    }))
})
