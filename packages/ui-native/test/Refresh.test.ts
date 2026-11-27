import * as Refresh from "@effect/ui-native/internal/refresh"
import * as Native from "@effect/ui-native/Native"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { assert, describe, it } from "vitest"
import * as FakeFabric from "./utils/FakeFabric.ts"

const Message = UiSchema.TaggedEnum({ Pressed: {} })

const counter = (
  label: string,
  model: Schema.Top = Schema.Struct({ count: Schema.Number })
) =>
  Native.component({
    name: "Counter",
    model: model as Schema.Struct<{ count: Schema.Number }>,
    message: Message
  }).make({
    init: () => ({ count: 0 }),
    update: { Pressed: ($) => $.evolve({ count: (count) => count + 1 }) },
    view: (h, model) => h.text.children(`${label} ${model.count}`)
  })

const setup = async () => {
  const reloads: Array<string> = []
  let refreshed = 0
  const runtime = Refresh.make({
    reload: (reason) => reloads.push(reason),
    refreshed: () => refreshed++
  })
  const first = counter("v1")
  // Metro registers a module's exports after it runs.
  runtime.register(first, "7 %exports% Counter")
  const mounted = await FakeFabric.mount((root) =>
    Renderer.mount(first, {}, root)
  )
  mounted.root.send(Message.Pressed())
  await mounted.settle()
  return {
    ...mounted,
    first,
    runtime,
    reloads,
    refreshed: () => refreshed
  }
}

describe("Fast Refresh", () => {
  it("swaps an edited component in place and keeps its state", async () => {
    const { printed, refreshed, reloads, runtime, settle, close } =
      await setup()
    assert.strictEqual(printed(), "<RCTText>v1 1</>")
    // Nothing changed yet.
    runtime.performReactRefresh()
    assert.strictEqual(refreshed(), 0)
    const next = counter("v2")
    runtime.register(next, "7 %exports% Counter")
    // An id from React's Babel plugin names the same value, and is ignored.
    runtime.register(next, "7 Counter")
    runtime.performReactRefresh()
    await settle()
    assert.strictEqual(printed(), "<RCTText>v2 1</>")
    assert.strictEqual(refreshed(), 1)
    assert.deepStrictEqual(reloads, [])
    // A second edit swaps into the same mounted component.
    runtime.register(counter("v3"), "7 %exports% Counter")
    runtime.performReactRefresh()
    await settle()
    assert.strictEqual(printed(), "<RCTText>v3 1</>")
    await close()
  })

  it("answers Metro's questions about components, with one family across edits", async () => {
    const { first, runtime, close } = await setup()
    assert.isTrue(runtime.isLikelyComponentType(first))
    assert.isFalse(runtime.isLikelyComponentType(() => null))
    assert.isFalse(runtime.isLikelyComponentType({}))
    assert.isUndefined(runtime.getFamilyByType(counter("unregistered")))
    const next = counter("v2")
    runtime.register(next, "7 %exports% Counter")
    assert.isDefined(runtime.getFamilyByType(next))
    assert.strictEqual(
      runtime.getFamilyByType(next),
      runtime.getFamilyByType(first)
    )
    await close()
  })

  it("reloads when the state no longer fits the component", async () => {
    const { printed, refreshed, reloads, runtime, settle, close } =
      await setup()
    runtime.register(
      counter("v2", Schema.Struct({ count: Schema.String })),
      "7 %exports% Counter"
    )
    runtime.performReactRefresh()
    await settle()
    assert.strictEqual(printed(), "<RCTText>v1 1</>")
    assert.strictEqual(refreshed(), 0)
    assert.strictEqual(reloads.length, 1)
    await close()
  })

  // Alone: every runtime sees a view defined again.
  it(
    "reloads when a native view is defined again",
    { concurrent: false },
    async () => {
      const { refreshed, reloads, runtime, close } = await setup()
      const define = (viewName: string) =>
        Native.defineView(() => new Native.Element("refreshed"), { viewName })
      define("Before")
      runtime.performReactRefresh()
      assert.deepStrictEqual(reloads, [])
      define("After")
      runtime.performReactRefresh()
      assert.strictEqual(refreshed(), 0)
      assert.strictEqual(reloads.length, 1)
      await close()
    }
  )
})
