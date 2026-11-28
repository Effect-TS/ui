import { Pan } from "@effect/ui-native/kit/Pan"
import { Pressable } from "@effect/ui-native/kit/Pressable"
import * as Native from "@effect/ui-native/Native"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { assert, describe, it, vi } from "vitest"
import * as FakeFabric from "../utils/FakeFabric.ts"

vi.mock(
  "react-native/Libraries/StyleSheet/processColor",
  () => ({ default: (color: unknown) => color })
)
vi.mock(
  "react-native/Libraries/Components/Sound/NativeSoundManager",
  () => ({ default: null })
)

const Message = UiSchema.TaggedEnum({ Got: { event: Schema.String } })
const got = (event: string) => Message.Got({ event })

const make = (cancelable: boolean) =>
  Native.component({
    name: "Swipe",
    model: Schema.Struct({ log: Schema.Array(Schema.String) }),
    message: Message
  }).make({
    init: () => ({ log: [] }),
    update: {
      Got: ($, { event }) => $.evolve({ log: (log) => [...log, event] })
    },
    view: (h) =>
      Pan(h, {
        onStart: (g) => g.dy > 0 ? undefined : got(`start ${g.dx}`),
        onMove: (g) => got(`move ${g.dx}`),
        onEnd: (g) => got(`end ${g.vx}`),
        onCancel: got("cancel"),
        props: { axis: "x", cancelable }
      }).style({ padding: 1 }).children(
        h.scroll.children(
          Pressable(h, {
            onPress: got("press"),
            onPressIn: got("in"),
            onPressOut: got("out")
          }).style({ padding: 2 }).children(h.text("Row"))
        )
      )
  })

const at = (x: number, t: number, down = true, y = 10) => {
  const touch = { pageX: x, pageY: y, timestamp: t }
  return { touches: down ? [touch] : [], changedTouches: [touch] }
}

const setup = async (cancelable: boolean) => {
  const mounted = await FakeFabric.mount((container) =>
    Renderer.mount(make(cancelable), {}, container)
  )
  const text = mounted.find(FakeFabric.byText("Row"))
  const pan = mounted.find((n) => n.props.padding === 1)
  const scroll = mounted.find(FakeFabric.byName("RCTScrollView"))
  mounted.fabric.place(mounted.find((n) => n.props.padding === 2), [
    0,
    0,
    100,
    40
  ])
  return { ...mounted, text, pan, scroll, log: () => mounted.root.model()!.log }
}

// A runtime recognizes one touch at a time, so the tests take turns.
describe("Pan", { concurrent: false }, () => {
  it("takes the touch from a Pressable once it moves along its axis, and follows it", async () => {
    const { fabric, log, pan, settle, text } = await setup(true)
    fabric.emit(text, "topTouchStart", at(10, 0))
    // Too short, then refused by onStart, then across the axis and out of
    // the row, which holds back its press out.
    fabric.emit(text, "topTouchMove", at(15, 10))
    fabric.emit(text, "topTouchMove", at(40, 20, true, 12))
    fabric.emit(text, "topTouchMove", at(10, 30, true, 100))
    fabric.emit(text, "topTouchMove", at(60, 40))
    fabric.emit(text, "topTouchMove", at(70, 50))
    fabric.emit(text, "topTouchEnd", at(70, 60, false))
    await settle()
    assert.deepStrictEqual(log(), [
      "in",
      "out",
      "start 50",
      "move 50",
      "move 60",
      "end 1"
    ])
    assert.deepStrictEqual(fabric.responders, [
      [pan.tag, true, true],
      [pan.tag, false, true]
    ])
  })

  it("doesn't count a finger going down or lifting as a move", async () => {
    const { fabric, log, settle, text } = await setup(true)
    const one = { pageX: 10, pageY: 10, timestamp: 0 }
    const two = { pageX: 110, pageY: 10, timestamp: 0 }
    fabric.emit(text, "topTouchStart", {
      touches: [one],
      changedTouches: [one]
    })
    fabric.emit(text, "topTouchStart", {
      touches: [one, two],
      changedTouches: [two]
    })
    fabric.emit(text, "topTouchEnd", { touches: [two], changedTouches: [one] })
    fabric.emit(text, "topTouchMove", at(130, 10))
    fabric.emit(text, "topTouchEnd", at(130, 20, false))
    await settle()
    assert.deepStrictEqual(log(), ["in", "out", "start 20", "move 20", "end 2"])
  })

  it("ends a touch whose element leaves, without ending another surface's", async () => {
    const a = await setup(true)
    const b = await setup(true)
    a.fabric.emit(a.text, "topTouchStart", at(10, 0))
    a.fabric.emit(a.text, "topTouchMove", at(30, 10))
    // B's touch starts before the cancel of A's, which waits for a microtask.
    a.made.host.remove(a.made.root.first!)
    b.fabric.emit(b.text, "topTouchStart", at(10, 0))
    // A late native cancel on A's removed view isn't B's.
    a.fabric.emit(a.text, "topTouchCancel", {})
    b.fabric.emit(b.text, "topTouchEnd", at(10, 10, false))
    await b.settle()
    assert.deepStrictEqual(a.fabric.responders, [
      [a.pan.tag, true, true],
      [a.pan.tag, false, true]
    ])
    assert.deepStrictEqual(b.log(), ["in", "press"])
  })

  it("gives the touch to a scroll view only while cancelable", async () => {
    for (const cancelable of [true, false]) {
      const { fabric, log, scroll, settle, text } = await setup(cancelable)
      fabric.emit(text, "topTouchStart", at(10, 0))
      fabric.emit(text, "topTouchMove", at(30, 10))
      fabric.emit(scroll, "topScrollBeginDrag", {})
      fabric.emit(text, "topTouchMove", at(40, 20))
      fabric.emit(text, "topTouchEnd", at(40, 30, false))
      await settle()
      assert.deepStrictEqual(
        log().slice(2),
        cancelable
          ? ["start 20", "move 20", "cancel"]
          : ["start 20", "move 20", "move 30", "end 1"]
      )
    }
  })
})
