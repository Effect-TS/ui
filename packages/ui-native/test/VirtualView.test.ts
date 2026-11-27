import { VirtualView } from "@effect/ui-native/kit/VirtualView"
import * as Native from "@effect/ui-native/Native"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { assert, describe, it } from "vitest"
import * as FakeFabric from "./utils/FakeFabric.ts"

const Rect = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number
})

const Message = UiSchema.TaggedEnum({
  ModeChanged: {
    mode: Schema.Literals(["visible", "prerender", "hidden"]),
    targetRect: Rect
  }
})

const makeList = (startHidden: boolean, onRenderChild: () => void) =>
  Native.component({
    name: "VirtualList",
    model: Schema.Struct({
      hidden: Schema.UndefinedOr(
        Schema.Struct({
          width: Schema.UndefinedOr(Schema.Number),
          height: Schema.UndefinedOr(Schema.Number)
        })
      ),
      lastMode: Schema.String
    }),
    message: Message
  }).make({
    init: () => ({
      hidden: startHidden ? { width: 320, height: undefined } : undefined,
      lastMode: "none"
    }),
    update: {
      ModeChanged: ($, { mode, targetRect }) =>
        $.evolve({
          hidden: () => (mode === "hidden" ? targetRect : undefined),
          lastMode: () => mode
        })
    },
    view: (h, model) =>
      h.scroll.style({ flex: 1 }).children(
        VirtualView(h, {
          hidden: model.hidden,
          children: () => {
            onRenderChild()
            return h.text.children(`Mode: ${model.lastMode}`)
          }
        })
          .key("item-1")
          .style({ minHeight: 20, padding: 8 })
          .on(
            "modeChange",
            ({ mode, targetRect }) => Message.ModeChanged({ mode, targetRect })
          )
      )
  })

describe("VirtualView", () => {
  it("hides children with placeholder dimensions on topModeChange and restores them on reveal", async () => {
    let childRenders = 0
    const List = makeList(false, () => childRenders++)
    const { close, fabric, find, printed, settle } = await FakeFabric.mount(
      (root) => Renderer.mount(List, {}, root)
    )
    const vv = () => find(FakeFabric.byName("VirtualView"))
    assert.strictEqual(childRenders, 1)
    assert.deepStrictEqual(vv().props, {
      initialHidden: false,
      renderState: 1,
      minHeight: 20,
      padding: 8,
      onModeChange: true
    })
    assert.include(printed(), "<VirtualView><RCTText>Mode: none</></>")

    const targetRect = { x: 0, y: 400, width: 320, height: 96 }
    const thresholdRect = { x: 0, y: 0, width: 320, height: 800 }
    fabric.emit(vv(), "topModeChange", { mode: 2, targetRect, thresholdRect })
    await settle()
    assert.strictEqual(childRenders, 1)
    assert.deepStrictEqual(vv().props, {
      initialHidden: true,
      renderState: 2,
      minWidth: 320,
      minHeight: 96,
      padding: 8,
      onModeChange: true
    })
    assert.include(printed(), "<VirtualView></>")

    // Unknown mode values are ignored.
    fabric.emit(vv(), "topModeChange", { mode: 99, targetRect, thresholdRect })
    await new Promise((r) => setTimeout(r, 10))
    assert.strictEqual(vv().props.renderState, 2)

    // Prerender reveals children and restores caller minWidth/minHeight.
    fabric.emit(vv(), "topModeChange", { mode: 1, targetRect, thresholdRect })
    await settle()
    assert.strictEqual(childRenders, 2)
    assert.deepStrictEqual(vv().props, {
      initialHidden: false,
      renderState: 1,
      minHeight: 20,
      padding: 8,
      onModeChange: true
    })
    assert.include(printed(), "<VirtualView><RCTText>Mode: prerender</></>")

    fabric.emit(vv(), "topModeChange", { mode: 0, targetRect, thresholdRect })
    await settle()
    assert.include(printed(), "<VirtualView><RCTText>Mode: visible</></>")
    await close()
  })

  it("starts hidden when mounted with hidden, keeping omitted caller minimums until reveal", async () => {
    let childRenders = 0
    const List = makeList(true, () => childRenders++)
    const { close, fabric, find, printed, settle } = await FakeFabric.mount(
      (root) => Renderer.mount(List, {}, root)
    )
    const vv = () => find(FakeFabric.byName("VirtualView"))
    assert.strictEqual(childRenders, 0)
    assert.deepStrictEqual(vv().props, {
      initialHidden: true,
      renderState: 2,
      minWidth: 320,
      minHeight: 20,
      padding: 8,
      onModeChange: true
    })
    assert.include(printed(), "<VirtualView></>")

    fabric.emit(vv(), "topModeChange", {
      mode: 0,
      targetRect: { x: 0, y: 0, width: 320, height: 20 },
      thresholdRect: { x: 0, y: 0, width: 320, height: 800 }
    })
    await settle()
    assert.strictEqual(childRenders, 1)
    assert.strictEqual(vv().props.renderState, 1)
    assert.include(printed(), "<VirtualView><RCTText>Mode: visible</></>")
    await close()
  })
})
