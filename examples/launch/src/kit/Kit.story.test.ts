import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { FinishHoverPlay, Kit, KitMessage, playingAt } from "./Kit.ts"

describe("Kit", () => {
  it.effect("plays a hovered tile once, for as long as a timed one", () =>
    Effect.gen(function*() {
      const story = yield* Story.make(Kit, {})
      story.send(KitMessage.EnteredTile({ name: "Switch" }))
        .expectExact(FinishHoverPlay)
      assert.deepStrictEqual(story.model.hovered, ["Switch"])
      story.resolve(
        FinishHoverPlay,
        KitMessage.FinishedHoverPlay({ name: "Switch" })
      )
      assert.deepStrictEqual(story.model.hovered, [])
    }))

  it.effect("ignores the pointer on a tile that is already playing", () =>
    Effect.gen(function*() {
      const story = yield* Story.make(Kit, {})
      // At step 0 the timer plays the first tile.
      const [first] = playingAt(0)
      story.given({ step: 0, hovered: [] })
        .send(KitMessage.EnteredTile({ name: first! }))
      assert.deepStrictEqual(story.model.hovered, [])
    }))
})
