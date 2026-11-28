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
vi.mock(
  "react-native/Libraries/EventEmitter/RCTDeviceEventEmitter",
  () => ({ default: {} })
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

describe("Animation without a native driver", () => {
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
})
