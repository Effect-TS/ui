import { Native } from "@effect/ui-native"
import { Css, Image, Linking, Pressable } from "@effect/ui-native/kit"
import * as Command from "@effect/ui/Command"
import { Locator, Scene } from "@effect/ui/testing"
import * as UiSchema from "@effect/ui/UiSchema"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
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

const Message = UiSchema.TaggedEnum({ Pressed: {} })

const Docs = Native.component({
  name: "Docs",
  model: Schema.Null,
  message: Message
}).make({
  init: () => null,
  update: {
    Pressed: ($) =>
      $.run(
        Linking.Open.make({ url: "https://effect.website" }).pipe(
          Command.asNoop
        )
      )
  },
  view: (h) =>
    Pressable(h, {
      onPress: Message.Pressed(),
      props: { android_ripple: { color: "red" } }
    }).children(Image(h, { source: logo }), h.text.children("Docs"))
})

// Loads the kit's barrel with React Native's own modules, unmocked.
describe("the kit in Node", () => {
  it("parses styles with React Native's processors", () => {
    // iOS's processColor, as NativeVitest loads React Native's iOS files.
    assert.strictEqual<unknown>(Css.color("red"), 0xffff0000)
    assert.deepStrictEqual(Css.transform("translateX(10px) rotate(45deg)"), [
      { translateX: 10 },
      { rotate: "45deg" }
    ])
  })

  it.effect("renders a pressable image in a Scene", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Docs, {})
      // The image takes its size from the asset React Native registered.
      assert.deepInclude(scene.get(Locator.tag("image")).props, {
        width: 24,
        height: 16
      })
      const open = Linking.Open.make({ url: "https://effect.website" })
      scene.fire(Locator.tag("view"), "press", { x: 0, y: 0 })
        .expectExact(open)
        .resolve(open, Result.succeed(undefined))
    }))
})
