import { VirtualView } from "@effect/ui-native/kit/VirtualView"
import * as Native from "@effect/ui-native/Native"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
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
    targetRect: Rect,
    thresholdRect: Rect
  },
  Pressed: {}
})

const makeList = (options: {
  readonly initialHidden?: boolean
  readonly removeClippedSubviews?: boolean
  readonly onRenderChild: () => void
}) =>
  Native.component({
    name: "VirtualList",
    model: Schema.Struct({
      hidden: Schema.UndefinedOr(
        Schema.Struct({
          width: Schema.UndefinedOr(Schema.Number),
          height: Schema.UndefinedOr(Schema.Number)
        })
      ),
      lastMode: Schema.String,
      presses: Schema.Number
    }),
    message: Message
  }).make({
    init: () => ({
      hidden: options.initialHidden
        ? { width: undefined, height: 64 }
        : undefined,
      lastMode: "none",
      presses: 0
    }),
    update: {
      ModeChanged: ($, { mode, targetRect }) =>
        $.evolve({
          hidden: () => (mode === "hidden" ? targetRect : undefined),
          lastMode: () => mode
        }),
      Pressed: ($) => $.evolve({ presses: (n) => n + 1 })
    },
    view: (h, model) =>
      h.scroll.style({ flex: 1 }).children(
        VirtualView(h, {
          hidden: model.hidden,
          initialHidden: options.initialHidden,
          removeClippedSubviews: options.removeClippedSubviews,
          onModeChange: ({ mode, targetRect, thresholdRect }) =>
            Message.ModeChanged({ mode, targetRect, thresholdRect }),
          children: () => {
            options.onRenderChild()
            return h.text.children(`Mode: ${model.lastMode} (${model.presses})`)
          }
        })
          .key("item-1")
          .style({ minHeight: 20, padding: 8 })
          .on("press", Message.Pressed())
      )
  })

describe("VirtualView", () => {
  it("hides children with placeholder dimensions on topModeChange and restores them on reveal", async () => {
    let childRenders = 0
    const List = makeList({ onRenderChild: () => childRenders++ })
    const { close, fabric, find, printed, settle } = await FakeFabric.mount(
      (root) => Renderer.mount(List, {}, root)
    )
    const vv = () => find(FakeFabric.byName("VirtualView"))
    assert.strictEqual(childRenders, 1)
    assert.strictEqual(vv().props.initialHidden, false)
    assert.strictEqual(vv().props.renderState, 1)
    assert.strictEqual(vv().props.onModeChange, true)
    assert.strictEqual(vv().props.minHeight, 20)
    assert.strictEqual(vv().props.padding, 8)
    assert.include(printed(), "<VirtualView><RCTText>Mode: none (0)</></>")

    const targetRect = { x: 0, y: 400, width: 320, height: 96 }
    const thresholdRect = { x: 0, y: 0, width: 320, height: 800 }
    fabric.emit(vv(), "topModeChange", { mode: 2, targetRect, thresholdRect })
    await settle()
    assert.strictEqual(childRenders, 1)
    assert.strictEqual(vv().props.renderState, 2)
    assert.strictEqual(vv().props.minWidth, 320)
    assert.strictEqual(vv().props.minHeight, 96)
    assert.strictEqual(vv().props.padding, 8)
    assert.include(printed(), "<VirtualView></>")

    // Unknown mode values are ignored.
    fabric.emit(vv(), "topModeChange", { mode: 99, targetRect, thresholdRect })
    await new Promise((r) => setTimeout(r, 10))
    assert.strictEqual(vv().props.renderState, 2)

    // Prerender reveals children and restores caller minWidth/minHeight.
    fabric.emit(vv(), "topModeChange", { mode: 1, targetRect, thresholdRect })
    await settle()
    assert.strictEqual(childRenders, 2)
    assert.strictEqual(vv().props.renderState, 1)
    assert.isUndefined(vv().props.minWidth)
    assert.strictEqual(vv().props.minHeight, 20)
    assert.include(printed(), "<VirtualView><RCTText>Mode: prerender (0)</></>")

    // Visible also delivers the mapped event.
    fabric.emit(vv(), "topModeChange", { mode: 0, targetRect, thresholdRect })
    await settle()
    assert.include(printed(), "<VirtualView><RCTText>Mode: visible (0)</></>")

    // Chained view events remain wired.
    fabric.emit(vv(), "topTouchStart", {})
    fabric.emit(vv(), "topTouchEnd", {
      changedTouches: [{ pageX: 10, pageY: 10 }]
    })
    await settle()
    assert.include(printed(), "<VirtualView><RCTText>Mode: visible (1)</></>")
    await close()
  })

  it("supports initialHidden, removeClippedSubviews, and rejects raw text children", async () => {
    let childRenders = 0
    const List = makeList({
      initialHidden: true,
      removeClippedSubviews: true,
      onRenderChild: () => childRenders++
    })
    const { close, fabric, find, printed, settle } = await FakeFabric.mount(
      (root) => Renderer.mount(List, {}, root)
    )
    const vv = () => find(FakeFabric.byName("VirtualView"))
    assert.strictEqual(childRenders, 0)
    assert.strictEqual(vv().props.initialHidden, true)
    assert.strictEqual(vv().props.renderState, 2)
    assert.strictEqual(vv().props.removeClippedSubviews, true)
    assert.isUndefined(vv().props.minWidth)
    assert.strictEqual(vv().props.minHeight, 64)
    assert.include(printed(), "<VirtualView></>")

    fabric.emit(vv(), "topModeChange", {
      mode: 0,
      targetRect: { x: 0, y: 0, width: 320, height: 64 },
      thresholdRect: { x: 0, y: 0, width: 320, height: 800 }
    })
    await settle()
    assert.strictEqual(childRenders, 1)
    assert.strictEqual(vv().props.renderState, 1)
    assert.include(printed(), "<VirtualView><RCTText>Mode: visible (0)</></>")
    await close()

    const h = View.makeHelper<never, {}, Native.Elements>({}, Native)
    assert.throws(
      () =>
        View.build(
          VirtualView(h, { children: () => "raw text" as any }),
          []
        ),
      /<virtualView> can't hold text/
    )
  })
})
