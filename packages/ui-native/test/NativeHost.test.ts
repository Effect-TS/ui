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
  Scrolled: { event: Schema.String, y: Schema.Number },
  Toggled: {}
})

const Counter = Native.component({
  name: "Counter",
  model: Schema.Struct({
    count: Schema.Number,
    name: Schema.String,
    on: Schema.Boolean,
    y: Schema.Number,
    events: Schema.Array(Schema.String)
  }),
  message: Message
}).make({
  init: () => ({ count: 0, name: "", on: false, y: 0, events: [] }),
  update: {
    Pressed: ($) => $.evolve({ count: (count) => count + 1, name: () => "" }),
    // Keeps the name upper case, so an edit in lower case is replaced.
    Typed: ($, { value }) => $.evolve({ name: value.toUpperCase() }),
    Scrolled: ($, { event, y }) =>
      $.evolve({ y, events: (events) => [...events, event] }),
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
      h.scroll.horizontal(model.on)
        .contentContainerStyle(
          model.on ? { padding: 4 } : { padding: 8, flexDirection: "column" }
        )
        .on("scroll", ({ y }) => Message.Scrolled({ event: "scroll", y }))
        .on("momentumScrollEnd", ({ y }) =>
          Message.Scrolled({ event: "momentumScrollEnd", y }))
        .on("contentSizeChange", ({ height }) =>
          Message.Scrolled({ event: "contentSizeChange", y: height }))
        .children(h.text.children("Row")),
      h.text.children(`y ${model.y} ${model.events.join(",")}`)
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

  it("holds a scroll view's children in its styled content view and maps scroll events", async () => {
    const { fabric, find, printed, root, settle } = await setup()
    assert.include(
      printed(),
      "<RCTScrollView><RCTScrollContentView><RCTText>Row</></></>"
    )
    const scroll = find(FakeFabric.byName("RCTScrollView"))
    // Android sends momentum events only when asked.
    assert.strictEqual(scroll.props.sendMomentumEvents, true)
    assert.deepStrictEqual(scroll.children[0]!.props, {
      collapsable: false,
      padding: 8,
      flexDirection: "column",
      onLayout: true
    })
    const metrics = {
      contentOffset: { x: 0, y: 120 },
      contentSize: { width: 100, height: 900 },
      layoutMeasurement: { width: 100, height: 300 }
    }
    fabric.emit(scroll, "topScroll", metrics)
    fabric.emit(scroll, "topMomentumScrollEnd", {
      ...metrics,
      contentOffset: { x: 0, y: 200 }
    })
    fabric.emit(scroll.children[0]!, "topLayout", {
      layout: { x: 0, y: 0, width: 100, height: 900 }
    })
    await settle()
    assert.include(
      printed(),
      "y 900 scroll,momentumScrollEnd,contentSizeChange"
    )

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
    // Without a direction in the content style, horizontal content is a row.
    assert.deepStrictEqual(horizontal.children[0]!.props, {
      collapsable: false,
      padding: 4,
      flexDirection: "row",
      onLayout: true
    })

    root.send(Message.Toggled())
    await settle()
    assert.strictEqual(
      find(FakeFabric.byName("RCTScrollContentView")).props.flexDirection,
      "column"
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

  it("sets React Native's text and input defaults for the platform", () => {
    const props = (os: string) => {
      const fabric = FakeFabric.make()
      const { host, root } = NativeHost.make({
        ui: fabric.ui,
        rootTag: 1,
        os,
        processColor: (c) => c
      })
      const nodes = [host.createElement("text"), host.createElement("input")]
      for (const n of nodes) host.insertBefore(root, n, undefined)
      host.commit!()
      // Removing a prop puts its default back.
      for (const value of [false, undefined]) {
        for (const n of nodes) host.setProp(n, "accessible", value)
        host.commit!()
      }
      return fabric.committed().map((n) => n.props)
    }
    assert.deepStrictEqual(props("android"), [
      { ellipsizeMode: "tail" },
      { accessible: true }
    ])
    assert.deepStrictEqual(props("ios"), [
      { ellipsizeMode: "tail", accessible: true },
      { accessible: true }
    ])
  })

  it("commits an object prop only when its value changes", () => {
    const fabric = FakeFabric.make()
    const { host, root } = NativeHost.make({
      ui: fabric.ui,
      rootTag: 1,
      os: "android",
      processColor: (c) => c
    })
    const view = host.createElement("view")
    const set = (name: string, value: unknown) => {
      host.setProp(view, name, value)
      host.commit!()
      return fabric.committed()[0]!.props[name]
    }
    host.insertBefore(root, view, undefined)
    const transform = set("transform", [{ rotate: "45deg" }])
    assert.strictEqual(set("transform", [{ rotate: "45deg" }]), transform)
    assert.deepStrictEqual(set("transform", [{ rotate: "90deg" }]), [
      { rotate: "90deg" }
    ])
    set("accessibilityState", { disabled: undefined })
    assert.deepStrictEqual(set("accessibilityState", { selected: true }), {
      selected: true
    })
  })

  it("runs the Host operations on committed nodes", async () => {
    const { fabric, made, find } = await setup()
    const input = find(FakeFabric.byName("AndroidTextInput"))
    const node = input.handle as NativeHost.NativeNode
    made.operations.focus(node)
    made.operations.scrollTo(node, 0, 40)
    made.operations.scrollToEnd(node)
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
      [input.tag, "scrollToEnd", [true]],
      [input.tag, "clear", []]
    ])
  })

  it("renders a view another module defines, and sends its events only to it", () => {
    Native.defineView(() => new Native.Element("toggle"), {
      viewName: (_, host) => host.os === "ios" ? "RCTSwitch" : "AndroidSwitch",
      defaults: { enabled: true, thumbTintColor: 0x7fff0000 },
      props: { checked: (n, value, host) => host.set(n, "value", value) }
    })
    const fabric = FakeFabric.make()
    const { host, root } = NativeHost.make({
      ui: fabric.ui,
      rootTag: 1,
      os: "ios",
      processColor: (c) => `processed ${c}`
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
      thumbTintColor: 0x7fff0000,
      value: true,
      onValueChange: true
    })
    // A removed colour goes back to the default as it was at mount.
    for (const color of ["blue", undefined]) {
      host.setProp(toggle, "thumbTintColor", color)
      host.commit!()
    }
    assert.strictEqual(shadow().props.thumbTintColor, 0x7fff0000)

    fabric.emit(shadow(), "topValueChange", { value: false })
    assert.deepStrictEqual(fired, [["valueChange", "toggle", { value: false }]])

    host.setEvents(toggle, {}, dispatch, {})
    host.commit!()
    assert.deepStrictEqual(shadow().props, {
      enabled: true,
      thumbTintColor: 0x7fff0000,
      value: true
    })
    fabric.emit(shadow(), "topValueChange", { value: true })
    assert.strictEqual(fired.length, 1)
  })

  it("hands a wrapped node's layout from one wrapper kind to another", () => {
    const wrapper = (tag: string, outer: RegExp) =>
      Native.defineView(() => new Native.Element(tag), {
        viewName: tag,
        attach: () => ({ outer, props: {} })
      })
    wrapper("marginWrap", /^margin$/)
    wrapper("widthWrap", /^width$/)
    const fabric = FakeFabric.make()
    const { host, root } = NativeHost.make({
      ui: fabric.ui,
      rootTag: 1,
      os: "android",
      processColor: (c) => c
    })
    const box = host.createElement("view")
    host.setProp(box, "margin", 4)
    host.setProp(box, "width", 100)
    const a = host.createElement("marginWrap")
    host.insertBefore(root, box, undefined)
    host.insertBefore(box, a, undefined)
    host.commit!()
    // The renderer inserts a replacement before it removes the old node.
    host.insertBefore(box, host.createElement("widthWrap"), a)
    host.remove(a)
    host.commit!()
    const [b] = fabric.committed()
    assert.strictEqual(FakeFabric.print([b!]), "<widthWrap><RCTView></></>")
    assert.deepStrictEqual(b!.props, { width: 100 })
    assert.deepStrictEqual(b!.children[0]!.props, { margin: 4 })
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
})
