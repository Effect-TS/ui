import { assert, describe, it } from "@effect/vitest"
import { modules, playingAt } from "./Kit.ts"

describe("kit wall", () => {
  it("plays no more than three tiles at a time", () => {
    for (let step = -1; step < modules.length * 2; step++) {
      const playing = playingAt(step)
      assert.isAtMost(playing.length, 3)
      assert.strictEqual(new Set(playing).size, playing.length)
    }
  })

  it("starts every tile once in each round", () => {
    const started = Array.from(
      { length: modules.length },
      (_, step) => playingAt(step)[0]
    )
    assert.deepStrictEqual([...started].sort(), [...modules].sort())
  })
})
