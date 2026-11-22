import { DirectionProvider } from "@effect/ui-kit"
import { Story } from "@effect/ui/testing"
import { assert, it } from "@effect/vitest"

it("DirectionProvider gives the direction it was told, left to right by default", () => {
  assert.strictEqual(Story.parts(DirectionProvider, { model: {}, props: {} }).direction, "ltr")
  assert.strictEqual(Story.parts(DirectionProvider, { model: {}, props: { direction: "rtl" } }).direction, "rtl")
})
