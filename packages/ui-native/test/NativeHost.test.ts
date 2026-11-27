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
    const { close, fabric, find, printed, settle } = await setup()
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
    const tag = input().tag
    // A rejected edit whose field's parent is removed before restore sends no command.
    fabric.emit(input(), "topChange", { text: "TIMOS", eventCount: 4 })
    await close()
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepStrictEqual(fabric.commands, [
      [tag, "setTextAndSelection", [1, "TIM", -1, -1]],
      [tag, "setTextAndSelection", [3, "TIMO", -1, -1]],
      [tag, "setTextAndSelection", [3, "", -1, -1]]
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
    made.operations.command(node, "clear")
    fabric.place(input, [1, 2, 3, 4])
    assert.deepStrictEqual(made.operations.measure(node), {
      x: 1,
      y: 2,
      width: 3,
      height: 4
    })
    assert.deepStrictEqual(fabric.commands, [
      [input.tag, "focus", []],
      [input.tag, "scrollTo", [0, 40, true]],
      [input.tag, "clear", []]
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
    host.setProp(toggle, "enabled", false)
    host.commit!()
    assert.deepStrictEqual(shadow().props, { enabled: false, value: true })
    host.setProp(toggle, "enabled", undefined)
    host.commit!()
    assert.deepStrictEqual(shadow().props, { enabled: true, value: true })
    fabric.emit(shadow(), "topValueChange", { value: true })
    assert.strictEqual(fired.length, 1)
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

  it("keeps the input node on multiline changes and applies defaults", () => {
    for (
      const [os, viewName] of [
        ["android", "AndroidTextInput"],
        ["ios", "RCTSinglelineTextInputView"]
      ] as const
    ) {
      const fabric = FakeFabric.make()
      const { host, root } = NativeHost.make({
        ui: fabric.ui,
        rootTag: 1,
        os,
        processColor: (c) => `color:${String(c)}`
      })
      const input = host.createElement("input")
      host.insertBefore(root, input, undefined)
      host.commit!()
      const committed = () =>
        FakeFabric.find(fabric.committed(), FakeFabric.byName(viewName))!
      const first = committed()
      assert.strictEqual(first.props.autoCapitalize, "sentences")
      assert.strictEqual(first.props.underlineColorAndroid, 0)

      host.setProp(input, "multiline", true)
      host.setProp(input, "autoCapitalize", "none")
      host.setProp(input, "underlineColorAndroid", "#3b82f6")
      host.commit!()
      const multi = committed()
      assert.strictEqual(multi.tag, first.tag)
      assert.strictEqual(multi.props.multiline, true)
      assert.strictEqual(multi.props.autoCapitalize, "none")
      assert.strictEqual(multi.props.underlineColorAndroid, "color:#3b82f6")

      host.setProp(input, "multiline", false)
      host.setProp(input, "underlineColorAndroid", undefined)
      host.commit!()
      const single = committed()
      assert.strictEqual(single.tag, first.tag)
      assert.strictEqual(single.props.multiline, false)
      assert.strictEqual(single.props.underlineColorAndroid, 0)
    }
  })

  it("handles defaultValue, clear, and setSelection", async () => {
    const Msg = UiSchema.TaggedEnum({
      SetDefault: { value: Schema.UndefinedOr(Schema.String) }
    })
    const Field = Native.component({
      name: "Field",
      model: Schema.Struct({ initial: Schema.UndefinedOr(Schema.String) }),
      message: Msg
    }).make({
      init: () => ({ initial: "hello" }),
      update: {
        SetDefault: ($, { value }) => $.evolve({ initial: value })
      },
      view: (h, model) =>
        h.view.children(
          h.input
            .prop("defaultValue", model.initial)
            .prop("multiline", true)
            .prop("keyboardType", "default")
            .prop("returnKeyType", "done")
            .prop("submitBehavior", "newline")
            .prop("placeholderTextColor", "#9ca3af")
            .prop("selectionColor", "#3b82f6")
            .prop("customNativeProp", 123),
          h.input.value("live").prop("defaultValue", "seed"),
          h.input.prop("defaultValue", "seed").value("live")
        )
    })
    const { close, fabric, find, made, root, settle } = await FakeFabric.mount(
      (container) => Renderer.mount(Field, {}, container)
    )
    const inputs = () => find(FakeFabric.byName("RCTView")).children
    const input = () => inputs()[0]!
    const node = input().handle as NativeHost.NativeNode
    assert.strictEqual(input().props.text, "hello")
    assert.strictEqual(input().props.mostRecentEventCount, 0)
    // Controlled `value` wins over `defaultValue` in either prop order.
    assert.strictEqual(inputs()[1]!.props.text, "live")
    assert.strictEqual(inputs()[2]!.props.text, "live")

    // Native edits on an uncontrolled input are not restored.
    fabric.emit(input(), "topChange", { text: "hello!", eventCount: 2 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepStrictEqual(fabric.commands, [])

    Native.setSelection(made.operations, node, 3)
    Native.setSelection(made.operations, node, 1, 4)
    Native.clear(made.operations, node)
    assert.strictEqual(node.props.text, "")

    // Updating defaultValue replaces text; removing it preserves the latest edit.
    root.send(Msg.SetDefault({ value: "next" }))
    await settle()
    assert.strictEqual(input().props.text, "next")
    fabric.emit(input(), "topChange", { text: "edited", eventCount: 3 })
    root.send(Msg.SetDefault({ value: undefined }))
    await settle()
    assert.strictEqual(node.props.text, "edited")
    assert.strictEqual(input().props.text, "next")

    const tag = input().tag
    assert.deepStrictEqual(fabric.commands, [
      [tag, "setTextAndSelection", [2, null, 3, 3]],
      [tag, "setTextAndSelection", [2, null, 1, 4]],
      [tag, "setTextAndSelection", [2, "", 0, 0]],
      [tag, "setTextAndSelection", [2, "next", -1, -1]]
    ])
    await close()
  })

  it("delivers textLayout and input events for Android and iOS", async () => {
    const received: Array<unknown> = []
    const Msg = UiSchema.TaggedEnum({
      Recorded: { entry: Schema.Unknown }
    })
    const record = (entry: unknown) => Msg.Recorded({ entry })
    const Events = Native.component({
      name: "Events",
      model: Schema.Number,
      message: Msg
    }).make({
      init: () => 0,
      update: {
        Recorded: ($, { entry }) => {
          received.push(entry)
          return $.model + 1
        }
      },
      view: (h) =>
        h.view.children(
          h.text
            .on("textLayout", ({ lines }) =>
              record(["textLayout", lines.length, lines[0]?.text]))
            .children("Hi"),
          h.input
            .on("selectionChange", ({ selection }) =>
              record(["selection", selection.start, selection.end]))
            .on("keyPress", ({ key }) =>
              record(["key", key]))
            .on("contentSizeChange", ({ contentSize }) =>
              record(["size", contentSize.width, contentSize.height]))
            .on("endEditing", ({ value }) =>
              record(["endEditing", value]))
        )
    })
    const { close, fabric, find, settle } = await FakeFabric.mount(
      (container) => Renderer.mount(Events, {}, container)
    )
    const text = find(FakeFabric.byName("RCTText"))
    const input = find(FakeFabric.byName("AndroidTextInput"))
    assert.strictEqual(text.props.onTextLayout, true)
    assert.strictEqual(input.props.onSelectionChange, true)
    assert.strictEqual(input.props.onKeyPress, true)
    assert.strictEqual(input.props.onContentSizeChange, true)
    assert.strictEqual(input.props.onEndEditing, true)

    fabric.emit(text, "topTextLayout", {
      lines: [{
        text: "Hi",
        x: 0,
        y: 0,
        width: 20,
        height: 18,
        ascender: 14,
        descender: 4,
        capHeight: 12,
        xHeight: 8
      }]
    })
    // Android and iOS payload shapes for each input event.
    fabric.emit(input, "topSelectionChange", {
      selection: { start: 1, end: 3 }
    })
    fabric.emit(input, "topSelectionChange", {
      selection: { start: 2, end: 2 },
      text: "ab",
      target: 1,
      eventCount: 4
    })
    fabric.emit(input, "topKeyPress", { key: "Backspace" })
    fabric.emit(input, "topKeyPress", { key: "Tab", eventCount: 5 })
    fabric.emit(input, "topContentSizeChange", {
      contentSize: { width: 100, height: 44 },
      target: 1
    })
    fabric.emit(input, "topContentSizeChange", {
      contentSize: { width: 100, height: 66 }
    })
    fabric.emit(input, "topEndEditing", { text: "android", target: 1 })
    fabric.emit(input, "topEndEditing", {
      text: "ios",
      target: 1,
      eventCount: 6
    })
    await settle()

    assert.deepStrictEqual(received, [
      ["textLayout", 1, "Hi"],
      ["selection", 1, 3],
      ["selection", 2, 2],
      ["key", "Backspace"],
      ["key", "Tab"],
      ["size", 100, 44],
      ["size", 100, 66],
      ["endEditing", "android"],
      ["endEditing", "ios"]
    ])
    await close()
  })
})
