import { Pressable } from "@effect/ui-native/kit/Pressable"
import * as Native from "@effect/ui-native/Native"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { assert, describe, it, vi } from "vitest"
import * as FakeFabric from "../utils/FakeFabric.ts"

const sounds = vi.hoisted(() => ({ played: 0 }))
vi.mock(
  "react-native/Libraries/StyleSheet/processColor",
  () => ({ default: (color: unknown) => `processed ${String(color)}` })
)
vi.mock(
  "react-native/Libraries/Components/Sound/NativeSoundManager",
  () => ({ default: { playTouchSound: () => sounds.played++ } })
)

const Message = UiSchema.TaggedEnum({ Got: { event: Schema.String } })
const got = (event: string) => Message.Got({ event })

const Rows = Native.component({
  name: "Rows",
  model: Schema.Struct({ log: Schema.Array(Schema.String) }),
  message: Message
}).make({
  init: () => ({ log: [] }),
  update: {
    Got: ($, { event }) => $.evolve({ log: (log) => [...log, event] })
  },
  view: (h) =>
    Pressable(h, {
      onPress: got("outer"),
      props: { android_disableSound: true }
    }).children(
      Pressable(h, {
        onPress: got("press"),
        onPressIn: got("in"),
        onPressOut: got("out"),
        onLongPress: got("long"),
        onHoverIn: got("hover in"),
        onHoverOut: got("hover out"),
        props: {
          delayLongPress: 30,
          pressedStyle: { opacity: 0.5 },
          android_ripple: { color: "red" }
        }
      }).style({ padding: 2 }).children(h.text("Row")),
      Pressable(h, {
        onPress: got("disabled"),
        props: { disabled: true }
      }).children(h.text("Off"))
    )
})

const at = (x: number, down: boolean) => {
  const touch = { pageX: x, pageY: 10 }
  return { touches: down ? [touch] : [], changedTouches: [touch] }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// A runtime recognizes one touch at a time, so the tests take turns.
describe("Pressable", { concurrent: false }, () => {
  it("presses in, shows the pressed style for at least 130 ms, and long presses instead of pressing", async () => {
    const { fabric, find, root, settle } = await FakeFabric.mount((container) =>
      Renderer.mount(Rows, {}, container)
    )
    const text = find(FakeFabric.byText("Row"))
    const row = () => find((n) => n.props.padding === 2)
    fabric.place(row(), [0, 0, 100, 40])
    const log = () => root.model()!.log

    fabric.emit(text, "topTouchStart", at(10, true))
    await settle()
    assert.strictEqual(row().props.opacity, 0.5)
    fabric.emit(text, "topTouchEnd", at(10, false))
    await settle()
    assert.deepStrictEqual(log(), ["in", "press"])
    assert.strictEqual(row().props.opacity, 0.5)
    await sleep(150)
    assert.deepStrictEqual(log(), ["in", "press", "out"])
    assert.isUndefined(row().props.opacity)
    assert.strictEqual(sounds.played, 1)
    assert.deepStrictEqual(row().props.nativeBackgroundAndroid, {
      type: "RippleAndroid",
      color: "processed red",
      borderless: false,
      rippleRadius: undefined,
      alpha: null
    })
    assert.deepStrictEqual(fabric.commands, [
      [row().tag, "hotspotUpdate", [10, 10]],
      [row().tag, "setPressed", [true]],
      [row().tag, "setPressed", [false]]
    ])

    fabric.emit(text, "topTouchStart", at(10, true))
    await sleep(50)
    fabric.emit(text, "topTouchEnd", at(10, false))
    // Ending outside the row doesn't press it.
    fabric.emit(text, "topTouchStart", at(10, true))
    fabric.emit(text, "topTouchEnd", at(150, false))
    await sleep(150)
    assert.deepStrictEqual(log().slice(3), ["in", "long", "out", "in", "out"])
  })

  it("passes a touch on a disabled Pressable to the one around it", async () => {
    const { fabric, find, root, settle } = await FakeFabric.mount((container) =>
      Renderer.mount(Rows, {}, container)
    )
    const text = find(FakeFabric.byText("Off"))
    fabric.emit(text, "topTouchStart", at(10, true))
    fabric.emit(text, "topTouchEnd", at(10, false))
    await settle()
    assert.deepStrictEqual(root.model()!.log, ["outer"])
    const off = find((n) => n.props.accessibilityState !== undefined)
    assert.deepStrictEqual(off.props.accessibilityState, { disabled: true })
    assert.include(FakeFabric.print([off]), "Off")
  })

  it("hovers while a pointer is over the element, not one inside it", async () => {
    const { fabric, find, root, settle } = await FakeFabric.mount((container) =>
      Renderer.mount(Rows, {}, container)
    )
    const row = find((n) => n.props.padding === 2)
    assert.strictEqual(row.props.onPointerEnter, true)
    fabric.emit(row, "topPointerEnter", {})
    fabric.emit(find(FakeFabric.byText("Row")), "topPointerEnter", {})
    fabric.emit(row, "topPointerLeave", {})
    await settle()
    assert.deepStrictEqual(root.model()!.log, ["hover in", "hover out"])
  })
})
