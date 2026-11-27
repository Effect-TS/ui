import * as Native from "@effect/ui-native/Native"
import * as NativeHost from "@effect/ui-native/NativeHost"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { assert, describe, it } from "vitest"
import * as FakeFabric from "./utils/FakeFabric.ts"

const Message = UiSchema.TaggedEnum({
  Pressed: {},
  Typed: { value: Schema.String },
  Scrolled: { y: Schema.Number },
  Toggled: {}
})

const Counter = Native.component({
  name: "Counter",
  model: Schema.Struct({
    count: Schema.Number,
    name: Schema.String,
    on: Schema.Boolean,
    y: Schema.Number
  }),
  message: Message
}).make({
  init: () => ({ count: 0, name: "", on: false, y: 0 }),
  update: {
    Pressed: ($) => $.evolve({ count: (count) => count + 1, name: () => "" }),
    // Keeps the name upper case, so an edit in lower case is replaced.
    Typed: ($, { value }) => $.evolve({ name: value.toUpperCase() }),
    Scrolled: ($, { y }) => $.evolve({ y }),
    Toggled: ($) => $.evolve({ on: (on) => !on })
  },
  view: (h, model) =>
    h.view.style({ flex: 1 }).children(
      h.view.style({ padding: 8 }).on("press", Message.Pressed()).children(
        h.text.children("Count ", String(model.count))
      ),
      // Rejects a name over four letters.
      h.input.value(model.name).placeholder("Name").on(
        "input",
        ({ value }) => value.length > 4 ? undefined : Message.Typed({ value })
      ),
      h.text.children(
        "Hello, ",
        h.text.style({ fontWeight: "bold" }).children(model.name)
      ),
      h.view.style(model.on ? { backgroundColor: "red" } : {}).children(),
      h.scroll.horizontal(model.on).on("scroll", ({ y }) =>
        Message.Scrolled({ y }))
        .children(h.text.children("Row")),
      h.text.children(`y ${model.y}`)
    )
})

const setup = async () => {
  const colors: Array<unknown> = []
  const mounted = await FakeFabric.mount(
    (root) => Renderer.mount(Counter, {}, root),
    (color) => {
      colors.push(color)
      return `processed ${String(color)}`
    }
  )
  return { ...mounted, colors }
}

const touch = (
  fabric: ReturnType<typeof FakeFabric.make>,
  node: FakeFabric.ShadowNode,
  end: "topTouchEnd" | "topTouchCancel" = "topTouchEnd",
  at = { pageX: 10, pageY: 10 }
) => {
  fabric.emit(node, "topTouchStart", {})
  fabric.emit(node, end, { changedTouches: [at] })
}

describe("NativeHost", () => {
  it("presses the nearest view with a press handler, unless cancelled or outside it", async () => {
    const { fabric, find, printed, settle } = await setup()
    const label = find(FakeFabric.byText("Count 0"))
    const button = find((n) => n.props.padding === 8)
    assert.strictEqual(button.props.collapsable, false)
    fabric.place(button, [0, 0, 100, 40])
    touch(fabric, label, "topTouchCancel")
    touch(fabric, label, "topTouchEnd", { pageX: 50, pageY: 61 })
    await settle()
    assert.include(printed(), "<RCTText>Count 0</>")
    touch(fabric, label, "topTouchEnd", { pageX: 50, pageY: 59 })
    await settle()
    assert.include(printed(), "<RCTText>Count 1</>")
  })

  it("sends an input's value back when it differs from the edit or the edit is rejected", async () => {
    const { fabric, find, printed, settle } = await setup()
    const input = () => find(FakeFabric.byName("AndroidTextInput"))
    fabric.emit(input(), "topChange", { text: "tim", eventCount: 1 })
    await settle()
    assert.strictEqual(input().props.text, "TIM")
    assert.strictEqual(input().props.mostRecentEventCount, 1)
    assert.include(printed(), "<RCTText>Hello, <RCTVirtualText>TIM</></>")

    const before = input()
    fabric.emit(before, "topChange", { text: "TIMO", eventCount: 2 })
    await settle()
    assert.include(printed(), "<RCTVirtualText>TIMO</>")
    // Native shows "TIMO" already, so the field isn't cloned.
    assert.strictEqual(input(), before)

    // Nothing renders for a rejected edit, so the host puts "TIMO" back.
    fabric.emit(before, "topChange", { text: "TIMOS", eventCount: 3 })
    await settle()
    touch(fabric, find(FakeFabric.byText("Count 0")))
    await settle()
    assert.deepStrictEqual(fabric.commands, [
      [input().tag, "setTextAndSelection", [1, "TIM", -1, -1]],
      [input().tag, "setTextAndSelection", [3, "TIMO", -1, -1]],
      [input().tag, "setTextAndSelection", [3, "", -1, -1]]
    ])
  })

  it("clones only the changed path", async () => {
    const { fabric, find, settle, root } = await setup()
    fabric.reset()
    root.send(Message.Pressed())
    await settle()
    assert.include(FakeFabric.print(fabric.committed()), "Count 1")
    assert.strictEqual(fabric.calls.createNode, undefined)
    // The raw text, then its text, button and the outer view.
    assert.strictEqual(fabric.calls.cloneNodeWithNewProps, 1)
    assert.strictEqual(fabric.calls.cloneNodeWithNewChildren, 3)
    assert.strictEqual(fabric.calls.completeRoot, 1)
    assert.isDefined(find(FakeFabric.byText("Count 1")))
  })

  it("processes colours and removes a style property", async () => {
    const { colors, find, root, settle } = await setup()
    root.send(Message.Toggled())
    await settle()
    assert.deepStrictEqual(colors, ["red"])
    const red = () =>
      FakeFabric.find(
        find(FakeFabric.byName("RCTView")).children,
        (n) => n.props.backgroundColor !== undefined
      )
    assert.strictEqual(red()?.props.backgroundColor, "processed red")
    root.send(Message.Toggled())
    await settle()
    assert.strictEqual(red(), undefined)
  })

  it("holds a scroll view's children in its content view and maps scroll events", async () => {
    const { fabric, find, printed, root, settle } = await setup()
    assert.include(
      printed(),
      "<RCTScrollView><RCTScrollContentView><RCTText>Row</></></>"
    )
    const scroll = find(FakeFabric.byName("RCTScrollView"))
    fabric.emit(scroll, "topScroll", {
      contentOffset: { x: 0, y: 120 },
      contentSize: { width: 100, height: 900 },
      layoutMeasurement: { width: 100, height: 300 }
    })
    await settle()
    assert.include(printed(), "y 120")

    root.send(Message.Toggled())
    await settle()
    const horizontal = find(FakeFabric.byName("AndroidHorizontalScrollView"))
    assert.include(
      printed(),
      "<AndroidHorizontalScrollView><AndroidHorizontalScrollContentView><RCTText>Row</></></>"
    )
    // Native can't change a view's type, so the views are new ones.
    assert.notStrictEqual(horizontal.tag, scroll.tag)
    assert.notStrictEqual(horizontal.children[0]!.tag, scroll.children[0]!.tag)
    assert.strictEqual(horizontal.props.flexDirection, "row")
    assert.strictEqual(horizontal.props.overflow, "scroll")
    assert.strictEqual(horizontal.children[0]!.props.flexDirection, "row")

    root.send(Message.Toggled())
    await settle()
    assert.isUndefined(
      find(FakeFabric.byName("RCTScrollContentView")).props.flexDirection
    )
  })

  // FakeFabric fails a commit that gives a tag a new parent, as Fabric does.
  it("rebuilds a node that changes parent, and keeps one moved among siblings", () => {
    const fabric = FakeFabric.make()
    const { host, root } = NativeHost.make({
      ui: fabric.ui,
      rootTag: 1,
      os: "android",
      processColor: (c) => c
    })
    const outer = host.createElement("text")
    const box = host.createElement("view")
    const inner = host.createElement("text")
    host.insertBefore(inner, host.createText("moving"), undefined)
    host.insertBefore(root, outer, undefined)
    host.insertBefore(root, box, undefined)
    host.insertBefore(outer, inner, undefined)
    host.commit!()
    assert.strictEqual(
      FakeFabric.print(fabric.committed()),
      "<RCTText><RCTVirtualText>moving</></><RCTView></>"
    )

    host.insertBefore(box, inner, undefined)
    host.commit!()
    assert.strictEqual(
      FakeFabric.print(fabric.committed()),
      "<RCTText></><RCTView><RCTText>moving</></>"
    )

    const sibling = host.createElement("view")
    host.insertBefore(box, sibling, undefined)
    host.commit!()
    const moved = FakeFabric.find(
      fabric.committed(),
      FakeFabric.byText("moving")
    )!
    host.insertBefore(box, inner, undefined)
    host.commit!()
    assert.strictEqual(
      FakeFabric.find(fabric.committed(), FakeFabric.byText("moving"))!.tag,
      moved.tag
    )

    host.insertBefore(outer, inner, undefined)
    host.commit!()
    assert.strictEqual(
      FakeFabric.print(fabric.committed()),
      "<RCTText><RCTVirtualText>moving</></><RCTView><RCTView></></>"
    )
  })

  it("runs the Host operations on committed nodes", async () => {
    const { fabric, made, find } = await setup()
    const input = find(FakeFabric.byName("AndroidTextInput"))
    const node = input.handle as NativeHost.NativeNode
    made.operations.focus(node)
    made.operations.scrollTo(node, 0, 40)
    fabric.place(input, [1, 2, 3, 4])
    assert.deepStrictEqual(made.operations.measure(node), {
      x: 1,
      y: 2,
      width: 3,
      height: 4
    })
    assert.deepStrictEqual(fabric.commands, [
      [input.tag, "focus", []],
      [input.tag, "scrollTo", [0, 40, true]]
    ])
  })

  it("renders a view another module defines, and sends its events only to it", () => {
    Native.defineView(() => new Native.Element("toggle"), {
      viewName: (_, host) => host.os === "ios" ? "RCTSwitch" : "AndroidSwitch",
      defaults: { enabled: true },
      props: { checked: (n, value, host) => host.set(n, "value", value) }
    })
    const fabric = FakeFabric.make()
    const { host, root } = NativeHost.make({
      ui: fabric.ui,
      rootTag: 1,
      os: "ios",
      processColor: (c) => c
    })
    const fired: Array<unknown> = []
    const dispatch = (name: string, handler: unknown, payload: unknown) =>
      fired.push([name, handler, payload]) > 0
    const box = host.createElement("view")
    const toggle = host.createElement("toggle")
    host.setProp(toggle, "checked", true)
    host.setEvents(box, { valueChange: "box" }, dispatch, {})
    host.setEvents(toggle, { valueChange: "toggle" }, dispatch, {})
    host.insertBefore(root, box, undefined)
    host.insertBefore(box, toggle, undefined)
    host.commit!()
    const shadow = () =>
      FakeFabric.find(fabric.committed(), FakeFabric.byName("RCTSwitch"))!
    assert.deepStrictEqual(shadow().props, {
      enabled: true,
      value: true,
      onValueChange: true
    })

    fabric.emit(shadow(), "topValueChange", { value: false })
    assert.deepStrictEqual(fired, [["valueChange", "toggle", { value: false }]])

    host.setEvents(toggle, {}, dispatch, {})
    host.commit!()
    assert.deepStrictEqual(shadow().props, { enabled: true, value: true })
  })

  it("renders each surface of a UIManager with its own options", () => {
    const fabric = FakeFabric.make()
    const surface = (rootTag: number, os: string, color: number) => {
      const { host, root } = NativeHost.make({
        ui: fabric.ui,
        rootTag,
        os,
        processColor: () => color
      })
      const scroll = host.createElement("scroll")
      host.setProp(scroll, "horizontal", true)
      host.setAttr(scroll, "backgroundColor", "red")
      host.insertBefore(root, scroll, undefined)
      host.insertBefore(root, host.createElement("input"), undefined)
      host.commit!()
      return [
        FakeFabric.print(fabric.committed()),
        fabric.committed()[0]!.props.backgroundColor
      ]
    }
    assert.deepStrictEqual(surface(1, "android", 111), [
      "<AndroidHorizontalScrollView><AndroidHorizontalScrollContentView></></><AndroidTextInput></>",
      111
    ])
    assert.deepStrictEqual(surface(11, "ios", 222), [
      "<RCTScrollView><RCTScrollContentView></></><RCTSinglelineTextInputView></>",
      222
    ])
  })

  it("doesn't put a rejected edit back into a field that is no longer shown", async () => {
    const fabric = FakeFabric.make()
    const { host, root } = NativeHost.make({
      ui: fabric.ui,
      rootTag: 1,
      os: "ios",
      processColor: (c) => c
    })
    const box = host.createElement("view")
    const input = host.createElement("input")
    host.setProp(input, "value", "old")
    host.insertBefore(root, box, undefined)
    host.insertBefore(box, input, undefined)
    host.commit!()
    const field = FakeFabric.find(
      fabric.committed(),
      FakeFabric.byName("RCTSinglelineTextInputView")
    )!
    fabric.emit(field, "topChange", { text: "new", eventCount: 1 })
    // The edit's update removes the field's parent.
    host.remove(box)
    host.commit!()
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepStrictEqual(fabric.commands, [])
  })
})
