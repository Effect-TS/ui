import { Native } from "@effect/ui-native"
import { Css, Image } from "@effect/ui-native/kit"
import { Locator, Scene } from "@effect/ui/testing"
import * as UiSchema from "@effect/ui/UiSchema"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { registerAsset } from "react-native/asset-registry"

const logo = registerAsset({
  httpServerLocation: "/assets",
  width: 24,
  height: 16,
  scales: [1],
  hash: "logo",
  name: "logo",
  type: "png"
})

const Logo = Native.component({
  name: "Logo",
  model: Schema.Null,
  message: UiSchema.TaggedEnum({})
}).make({
  init: () => null,
  update: {},
  view: (h) => Image(h, { source: logo })
})

// Loads the barrels with React Native's own modules, unmocked.
describe("the kit in Node", () => {
  it.effect("processes colours and renders a registered image in a Scene", () =>
    Effect.gen(function*() {
      // iOS's processColor, as NativeVitest loads React Native's iOS files.
      assert.strictEqual<unknown>(Css.color("red"), 0xffff0000)
      const scene = yield* Scene.make(Logo, {})
      assert.deepInclude(scene.get(Locator.tag("image")).props, {
        width: 24,
        height: 16
      })
    }))
})
