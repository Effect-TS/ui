import * as Animation from "@effect/ui-native/kit/Animation"
import * as Native from "@effect/ui-native/Native"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import { pipe } from "effect/Function"
import * as Schema from "effect/Schema"
import { assert, describe, it, vi } from "vitest"
import * as FakeFabric from "./utils/FakeFabric.ts"

vi.mock(
  "react-native/Libraries/TurboModule/TurboModuleRegistry",
  () => ({ get: () => null })
)

const Panel = Native.component({
  name: "Panel",
  model: Schema.Struct({ hidden: Schema.Boolean }),
  message: UiSchema.TaggedEnum({ Toggled: {} })
}).make({
  init: () => ({ hidden: true }),
  update: { Toggled: ($) => $.evolve({ hidden: (hidden) => !hidden }) },
  view: (h, model) => {
    const panel = h.view.style({ height: 10 })
    return h.view(
      model.hidden ? pipe(panel, Animation.style({ opacity: 0 })) : panel
    )
  }
})

const makeBox = (style: Animation.Style) => {
  let name = ""
  const Box = Native.component({
    name: "Box",
    model: Schema.Null,
    message: Schema.Never
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) =>
      h.view(
        pipe(
          h.view.style({ height: 10 }),
          Animation.named(name = h.id("box")),
          Animation.style(style)
        )
      )
  })
  return { Box, name: () => name }
}

// Each test's box has the same name, so the tests take turns.
describe("Animation without a native driver", { concurrent: false }, () => {
  it("shows the targets, and clears them when the element stops animating", async () => {
    const { find, root, settle } = await FakeFabric.mount((root) =>
      Renderer.mount(Panel, {}, root)
    )
    const panel = () => find((n) => n.props.height === 10)
    assert.strictEqual(panel().props.opacity, 0)
    root.send({ _tag: "Toggled" })
    await settle()
    assert.isUndefined(panel().props.opacity)
  })

  it.each([
    [{ opacity: 1 }, { opacity: 0.5 }],
    [{ transform: [{ translateX: 0 }] }, { transform: [{ translateX: 40 }] }]
  ])("sets only what the element animates: %j", async (style, shown) => {
    const { Box, name } = makeBox(style)
    const { close, find, settle } = await FakeFabric.mount((root) =>
      Renderer.mount(Box, {}, root)
    )
    const box = () => find((n) => n.props.height === 10)
    Animation.set(name(), {
      opacity: 0.5,
      transform: [{ translateX: 40 }, { scale: 2 }]
    })
    await settle()
    assert.deepStrictEqual(
      { opacity: box().props.opacity, transform: box().props.transform },
      { opacity: undefined, transform: undefined, ...shown }
    )
    await close()
  })
})
