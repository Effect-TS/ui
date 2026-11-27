import {
  KeyboardAvoidingView,
  type KeyboardAvoidingViewProps
} from "@effect/ui-native/kit/KeyboardAvoidingView"
import * as Native from "@effect/ui-native/Native"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"
import * as FakeFabric from "../utils/FakeFabric.ts"

const Set = UiSchema.TaggedEnum({ Set: { props: Schema.Unknown } })

// The view fills a parent from `top` to `bottom` points down the surface,
// unless its committed style sets a height or moves it. With `content` it's
// sized by its content and padding instead, and the parent puts it at its
// top, or at its bottom with `anchor: "bottom"`. `padding` is the
// consumer's bottom padding, and a percentage is of the surface's width.
const setup = async (initial: KeyboardAvoidingViewProps, layout: {
  readonly top?: number
  readonly bottom?: number
  readonly content?: number
  readonly anchor?: "top" | "bottom"
  readonly padding?: number | `${number}%`
} = {}) => {
  const { anchor = "top", content, padding = 8 } = layout
  let { bottom = 844, top = 44 } = layout
  const fake = FakeDevice.make("ios", {
    KeyboardObserver: FakeDevice.module().module
  })
  const Screen = Native.component({
    name: "Screen",
    model: Schema.Struct({ props: Schema.Unknown }),
    message: Set
  }).make({
    init: () => ({ props: initial }),
    update: { Set: ($, { props }) => $.set({ props }) },
    view: (h, model) =>
      KeyboardAvoidingView(h, {
        props: model.props as KeyboardAvoidingViewProps,
        view: (avoiding) =>
          avoiding.root(
            h.view.style({
              flex: content === undefined ? 1 : undefined,
              paddingBottom: padding
            })
          ).children(
            h.text.children(`inset ${avoiding.inset}`)
          )
      })
  })
  const mounted = await FakeFabric.mount((root) =>
    Effect.provideService(
      Renderer.mount(Screen, {}, root),
      Native.Device,
      fake.device
    )
  )
  const view = () => mounted.find(FakeFabric.byName("RCTView"))
  mounted.fabric.ui.getBoundingClientRect = (node: any) => {
    const style = node.props
    const pad = typeof style.paddingBottom === "string"
      ? parseFloat(style.paddingBottom) / 100 * 390
      : style.paddingBottom ?? 0
    const height = style.flex === 0
      ? style.height
      : content === undefined
      ? bottom - top
      : content + pad
    const y = anchor === "top" ? top : bottom - height
    return [0, y - (style.bottom ?? 0), 390, height]
  }
  const settle = async () => {
    for (let i = 0; i < 4; i++) await mounted.settle()
  }
  const keyboard = async (screenY: number | undefined) => {
    fake.emit(
      screenY === undefined ? "keyboardWillHide" : "keyboardWillShow",
      {
        endCoordinates: {
          screenX: 0,
          screenY: screenY ?? 844,
          width: 390,
          height: 300
        }
      }
    )
    await settle()
  }
  const laidOut = async () => {
    mounted.fabric.emit(view(), "topLayout", { layout: {} })
    await settle()
  }
  const setProps = async (props: KeyboardAvoidingViewProps) => {
    mounted.root.send(Set.Set({ props }))
    await settle()
  }
  const move = (by: number) => {
    top += by
    bottom += by
  }
  return { ...mounted, view, keyboard, layout: laidOut, setProps, move }
}

describe("KeyboardAvoidingView", () => {
  it("pads the view, follows offset and enabled props, and resets on hide", async () => {
    const screen = await setup({})
    await screen.keyboard(544)
    assert.strictEqual(screen.view().props.paddingBottom, 308)
    assert.include(screen.printed(), "inset 300")
    await screen.layout()
    assert.strictEqual(screen.view().props.paddingBottom, 308)
    await screen.setProps({ offset: 20 })
    assert.strictEqual(screen.view().props.paddingBottom, 328)
    await screen.setProps({ enabled: false })
    assert.strictEqual(screen.view().props.paddingBottom, 8)
    assert.include(screen.printed(), "inset 0")
    await screen.setProps({ offset: 0, enabled: true })
    assert.strictEqual(screen.view().props.paddingBottom, 308)
    await screen.keyboard(undefined)
    assert.strictEqual(screen.view().props.paddingBottom, 8)
    assert.include(screen.printed(), "inset 0")
    await screen.close()
  })

  it("shortens the view with height behavior across layouts, resizes, and hide", async () => {
    const screen = await setup({ behavior: "height" })
    await screen.layout()
    await screen.keyboard(544)
    assert.strictEqual(screen.view().props.height, 500)
    assert.strictEqual(screen.view().props.flex, 0)
    await screen.layout()
    await screen.layout()
    assert.strictEqual(screen.view().props.height, 500)
    await screen.keyboard(600)
    assert.strictEqual(screen.view().props.height, 556)
    await screen.keyboard(undefined)
    assert.strictEqual(screen.view().props.flex, 1)
    await screen.close()
  })

  it("moves the view up with position behavior across layouts", async () => {
    const screen = await setup({ behavior: "position" })
    await screen.keyboard(544)
    assert.strictEqual(screen.view().props.bottom, 300)
    await screen.layout()
    await screen.layout()
    assert.strictEqual(screen.view().props.bottom, 300)
    await screen.close()
  })

  // In each, the adjustment moves the view's bottom edge differently, and
  // the inset settles at once.
  it.each(
    [
      [
        "grows down with its padding",
        {},
        { content: 400 },
        448,
        "paddingBottom",
        12
      ],
      [
        "grows up with its padding",
        {},
        {
          content: 400,
          anchor: "bottom",
          bottom: 452
        },
        448,
        "paddingBottom",
        12
      ],
      // 10% is 39 points.
      [
        "shrinks as its padding replaces a percentage",
        {},
        {
          content: 400,
          padding: "10%"
        },
        479,
        "paddingBottom",
        4
      ],
      [
        "shortens from its top",
        { behavior: "height" },
        {
          content: 400,
          anchor: "bottom",
          bottom: 452
        },
        448,
        "height",
        404
      ]
    ] as const
  )(
    "keeps one inset however often a view that %s lays out",
    async (_, props, layout, keyboard, prop, value) => {
      const screen = await setup(props, layout)
      await screen.layout()
      await screen.keyboard(keyboard)
      for (let i = 0; i < 6; i++) {
        await screen.layout()
        assert.strictEqual(screen.view().props[prop], value)
        assert.include(screen.printed(), "inset 4")
      }
      await screen.keyboard(undefined)
      await screen.layout()
      assert.include(screen.printed(), "inset 0")
      await screen.keyboard(keyboard)
      await screen.layout()
      assert.strictEqual(screen.view().props[prop], value)
      await screen.close()
    }
  )

  it("adds up movements of less than a point", async () => {
    const screen = await setup({})
    await screen.keyboard(544)
    for (let i = 0; i < 8; i++) {
      screen.move(0.5)
      await screen.layout()
    }
    assert.strictEqual(screen.view().props.paddingBottom, 312)
    assert.include(screen.printed(), "inset 304")
    await screen.close()
  })
})
