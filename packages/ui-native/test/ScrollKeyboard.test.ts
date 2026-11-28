import { Pan } from "@effect/ui-native/kit/Pan"
import * as Native from "@effect/ui-native/Native"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "./utils/FakeDevice.ts"
import * as FakeFabric from "./utils/FakeFabric.ts"

const Mode = Schema.Literals(["default", "never", "handled", "always"])

const Message = UiSchema.TaggedEnum({
  Pressed: {},
  Outer: {},
  Panned: {},
  Removed: {},
  Switched: { mode: Mode }
})

const Form = Native.component({
  name: "Form",
  model: Schema.Struct({
    mode: Mode,
    presses: Schema.Number,
    outer: Schema.Number,
    pans: Schema.Number,
    row: Schema.Boolean
  }),
  message: Message
}).make({
  init: () => ({
    mode: "default" as const,
    presses: 0,
    outer: 0,
    pans: 0,
    row: true
  }),
  update: {
    Pressed: ($) => $.evolve({ presses: (n) => n + 1 }),
    Outer: ($) => $.evolve({ outer: (n) => n + 1 }),
    Panned: ($) => $.evolve({ pans: (n) => n + 1 }),
    Removed: ($) => $.evolve({ row: () => false }),
    Switched: ($, { mode }) => $.evolve({ mode: () => mode })
  },
  view: (h, model) =>
    h.view.on("press", Message.Outer()).children(
      (model.mode === "default"
        ? h.scroll
        : h.scroll.keyboardShouldPersistTaps(model.mode)).children(
          h.input.placeholder("Name"),
          model.row &&
            h.view.style({ padding: 8 }).on("press", Message.Pressed())
              .children(
                h.text("Row")
              ),
          h.text("Plain"),
          Pan(h, { onStart: Message.Panned(), props: { axis: "y" } }).children(
            h.text("Pan")
          )
        )
    )
})

const shown = { endCoordinates: { screenY: 544, height: 300 } }

const setup = async (os: string, version = 34) => {
  const fake = FakeDevice.make(os, {
    KeyboardObserver: FakeDevice.module().module,
    PlatformConstants: FakeDevice.module({
      getConstants: () => ({ Version: version })
    }).module
  })
  const mounted = await FakeFabric.mount(
    (root) => Renderer.mount(Form, {}, root),
    fake.device
  )
  const { fabric, find, root, settle } = mounted
  const input = find(
    FakeFabric.byName(
      os === "ios" ? "RCTSinglelineTextInputView" : "AndroidTextInput"
    )
  )
  const row = find(FakeFabric.byText("Row"))
  const plain = find(FakeFabric.byText("Plain"))
  const pan = find(FakeFabric.byText("Pan"))
  const blurs = () =>
    fabric.commands.filter(([tag, name]) =>
      tag === input.tag && name === "blur"
    ).length
  const tap = async (node: typeof row) => {
    FakeFabric.touch(fabric, node)
    await settle()
  }
  const focus = () => fabric.emit(input, "topFocus", {})
  // Native reports the blur a `blur` command makes.
  const blurred = () => fabric.emit(input, "topBlur", {})
  const mode = async (mode: typeof Mode.Type) => {
    root.send(Message.Switched({ mode }))
    await settle()
  }
  const presses = () => root.model()!.presses
  return {
    ...mounted,
    ...fake,
    input,
    row,
    plain,
    pan,
    blurs,
    tap,
    focus,
    blurred,
    mode,
    presses
  }
}

// The keyboard and the focused input are the app's, so tests take turns.
describe("scroll keyboardShouldPersistTaps", { concurrent: false }, () => {
  for (const os of ["ios", "android"]) {
    it(`dismisses the keyboard on a tap before pressing, by default, on ${os}`, async () => {
      const t = await setup(os)
      // An input is focused, but no keyboard shows, as with a hardware one.
      t.focus()
      await t.tap(t.row)
      assert.deepStrictEqual([t.presses(), t.blurs()], [1, 0])

      t.emit("keyboardDidShow", shown)
      // A tap on the input keeps the keyboard.
      await t.tap(t.input)
      assert.deepStrictEqual([t.presses(), t.blurs()], [1, 0])
      // The first tap elsewhere only dismisses it.
      await t.tap(t.row)
      assert.deepStrictEqual([t.presses(), t.blurs()], [1, 1])
      t.blurred()
      await t.tap(t.row)
      assert.deepStrictEqual([t.presses(), t.blurs()], [2, 1])

      // A touch that scrolls the view keeps the keyboard.
      t.focus()
      t.fabric.emit(t.row, "topTouchStart", {})
      const scroller = t.find(FakeFabric.byName("RCTScrollView"))
      t.fabric.emit(scroller, "topScroll", { contentOffset: { y: 10 } })
      t.fabric.emit(t.row, "topTouchEnd", {})
      await t.settle()
      assert.deepStrictEqual([t.presses(), t.blurs()], [2, 1])

      // `"never"` set explicitly does the same.
      await t.mode("never")
      await t.tap(t.plain)
      assert.deepStrictEqual([t.presses(), t.blurs()], [2, 2])

      t.emit("keyboardDidHide", {})
      await t.tap(t.row)
      assert.deepStrictEqual([t.presses(), t.blurs()], [3, 2])
      await t.close()
    })

    it(`lets handled taps through with "handled", and every tap with "always", on ${os}`, async () => {
      const t = await setup(os)
      t.focus()
      t.emit(os === "ios" ? "keyboardWillShow" : "keyboardDidShow", shown)
      await t.mode("handled")
      await t.tap(t.row)
      assert.deepStrictEqual([t.presses(), t.blurs()], [1, 0])
      await t.tap(t.plain)
      assert.deepStrictEqual([t.presses(), t.blurs()], [1, 1])

      await t.mode("always")
      await t.tap(t.plain)
      await t.tap(t.row)
      assert.deepStrictEqual([t.presses(), t.blurs()], [2, 1])
      t.emit(os === "ios" ? "keyboardWillHide" : "keyboardDidHide", {})
      await t.close()
    })

    it(`dismisses on a tap a Pan doesn't take, and not on a drag it takes, with "handled", on ${os}`, async () => {
      const t = await setup(os)
      t.focus()
      t.emit("keyboardDidShow", shown)
      await t.mode("handled")
      const counts = () => {
        const { outer, pans } = t.root.model()!
        return [pans, outer, t.blurs()]
      }
      // The scroll view takes the tap from the view around it.
      await t.tap(t.pan)
      assert.deepStrictEqual(counts(), [0, 0, 1])
      t.blurred()
      t.focus()
      const at = (y: number, down = true) => {
        const touch = { pageX: 10, pageY: y, timestamp: y }
        return { touches: down ? [touch] : [], changedTouches: [touch] }
      }
      t.fabric.emit(t.pan, "topTouchStart", at(10))
      t.fabric.emit(t.pan, "topTouchMove", at(40))
      t.fabric.emit(t.pan, "topTouchEnd", at(40, false))
      await t.settle()
      assert.deepStrictEqual(counts(), [1, 0, 1])
      t.emit("keyboardDidHide", {})
      await t.close()
    })

    it(`forgets the dismiss of a tap whose element is removed, on ${os}`, async () => {
      const t = await setup(os)
      t.focus()
      t.emit("keyboardDidShow", shown)
      t.fabric.emit(t.row, "topTouchStart", {})
      t.root.send(Message.Removed())
      await t.settle()
      await t.mode("always")
      await t.tap(t.plain)
      assert.strictEqual(t.blurs(), 0)
      t.emit("keyboardDidHide", {})
      await t.close()
    })

    it(`lets a tap through a keyboard that doesn't cover the app, and still dismisses it, on ${os}`, async () => {
      const t = await setup(os)
      t.focus()
      t.emit("keyboardDidShow", { endCoordinates: { screenY: 844, height: 0 } })
      // Dismisses even when the touch scrolls.
      t.fabric.emit(t.row, "topTouchStart", {})
      const scroller = t.find(FakeFabric.byName("RCTScrollView"))
      t.fabric.emit(scroller, "topScroll", { contentOffset: { y: 10 } })
      t.fabric.emit(t.row, "topTouchEnd", { changedTouches: [{}] })
      await t.settle()
      assert.deepStrictEqual([t.presses(), t.blurs()], [1, 1])
      t.emit("keyboardDidHide", {})
      await t.close()
    })
  }

  it("treats the keyboard as shown on Android before API 30, whose keyboard events can be missing", async () => {
    const t = await setup("android", 29)
    t.focus()
    await t.tap(t.row)
    assert.deepStrictEqual([t.presses(), t.blurs()], [0, 1])
    t.blurred()
    await t.tap(t.row)
    assert.deepStrictEqual([t.presses(), t.blurs()], [1, 1])
    await t.close()
  })
})
