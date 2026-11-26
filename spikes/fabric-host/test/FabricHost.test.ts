import * as Renderer from "@effect/ui/Renderer"
import * as Effect from "effect/Effect"
import * as Scope from "effect/Scope"
import { assert, describe, it } from "vitest"
import { Bench } from "../src/Bench.ts"
import { Counter } from "../src/Counter.ts"
import * as FabricHost from "../src/FabricHost.ts"
import * as FakeFabric from "./FakeFabric.ts"

const setup = async (component: typeof Counter | typeof Bench) => {
  const fabric = FakeFabric.make()
  let commits = 0
  const made = FabricHost.make({
    ui: fabric.ui,
    rootTag: 1,
    platform: { OS: "android" },
    processColor: (c) => c,
    onCommit: () => commits++
  })
  const scope = Scope.makeUnsafe()
  const root = await Effect.runPromise(
    Renderer.mount(component as typeof Counter, {}, made.root).pipe(
      Effect.provide(Renderer.layer(made.host)),
      Scope.provide(scope)
    )
  )
  const settle = async () => {
    const before = commits
    // `commits` changes while the loop awaits.
    // oxlint-disable-next-line no-unmodified-loop-condition
    for (let i = 0; i < 50 && commits === before; i++) {
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  await settle()
  return { fabric, root: root as Renderer.Root<any, any>, settle }
}

const text = (s: string) => (n: FakeFabric.ShadowNode) =>
  n.viewName === "RCTRawText" && n.props.text === s

describe("FabricHost", () => {
  it("mounts the counter and handles presses and input", async () => {
    const { fabric, settle } = await setup(Counter)
    assert.include(FakeFabric.print(fabric.committed()), "<RCTText>0</>")
    // Touch the label inside the "+" button: the press goes to the view.
    const plus = FakeFabric.find(fabric.committed(), text("+"))!
    fabric.emit(plus, "topTouchStart", {})
    fabric.emit(plus, "topTouchEnd", {
      changedTouches: [{ pageX: 1, pageY: 2 }]
    })
    await settle()
    assert.include(FakeFabric.print(fabric.committed()), "<RCTText>1</>")
    const input = FakeFabric.find(
      fabric.committed(),
      (n) => n.viewName === "AndroidTextInput"
    )!
    fabric.emit(input, "topChange", { text: "Tim" })
    await settle()
    assert.include(
      FakeFabric.print(fabric.committed()),
      "<RCTText>Hello, <RCTVirtualText>Tim</></>"
    )
  })

  it("keeps the committed rows in step with the model", async () => {
    const { fabric, root, settle } = await setup(Bench)
    const rows = () => {
      const scroll = FakeFabric.find(
        fabric.committed(),
        (n) => n.viewName === "RCTScrollContentView"
      )!
      return scroll.children.map((row) =>
        Number(row.children[0].children[0].props.text)
      )
    }
    const step = async (message: object) => {
      fabric.reset()
      root.send(message)
      await settle()
      return { ...fabric.calls }
    }
    const create = await step({ _tag: "Run" })
    assert.deepStrictEqual(
      rows(),
      Array.from({ length: 1000 }, (_, i) => i + 1)
    )
    const swap = await step({ _tag: "SwapRows" })
    assert.strictEqual(rows()[1], 999)
    assert.strictEqual(rows()[998], 2)
    const remove = await step({ _tag: "Remove", id: 5 })
    assert.strictEqual(rows().length, 999)
    assert.notInclude(rows(), 5)
    const update = await step({ _tag: "Update" })
    const select = await step({ _tag: "Select", id: 7 })
    const clear = await step({ _tag: "Clear" })
    assert.deepStrictEqual(rows(), [])
    console.log(
      "JSI calls per operation",
      JSON.stringify({ create, swap, remove, update, select, clear }, null, 1)
    )
  })
})
