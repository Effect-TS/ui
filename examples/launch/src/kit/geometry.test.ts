import { assert, describe, it } from "@effect/vitest"
import { floating, keyboardCover, stage } from "./geometry.ts"

describe("kit geometry", () => {
  it("places the box below the anchor at rest, and flips it above when playing", () => {
    const rest = floating(false)
    assert.strictEqual(rest.side, "bottom")
    assert.isAbove(rest.box.y, rest.anchor.y + rest.anchor.height)

    const playing = floating(true)
    assert.strictEqual(playing.side, "top")
    assert.isBelow(
      playing.box.y + playing.box.height,
      playing.anchor.y
    )
  })

  it("keeps the box inside the stage", () => {
    for (const on of [false, true]) {
      const { box } = floating(on)
      assert.isAtLeast(box.x, 0)
      assert.isAtLeast(box.y, 0)
      assert.isAtMost(box.x + box.width, stage.width)
      assert.isAtMost(box.y + box.height, stage.height)
    }
  })

  it("shows no keyboard at rest, and part of the screen covered when playing", () => {
    assert.strictEqual(keyboardCover(false), 0)
    const cover = keyboardCover(true)
    assert.isAbove(cover, 0.2)
    assert.isBelow(cover, 0.6)
  })
})
