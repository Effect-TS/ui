import { Drawer } from "@effect/ui-native/kit/Drawer"
import { InputAccessory } from "@effect/ui-native/kit/InputAccessory"
import { Modal } from "@effect/ui-native/kit/Modal"
import { SafeArea } from "@effect/ui-native/kit/SafeArea"
import * as Native from "@effect/ui-native/Native"
import type * as NativeHost from "@effect/ui-native/NativeHost"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import type * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import { assert, describe, it } from "vitest"
import * as FakeFabric from "./utils/FakeFabric.ts"

const mountOn = <A>(
  os: string,
  mount: (
    container: NativeHost.NativeNode
  ) => Effect.Effect<A, never, Renderer.Renderer | Native.Host | Scope.Scope>
) => FakeFabric.mount(mount, (color) => `processed ${String(color)}`, os)

describe("Modal", () => {
  const Message = UiSchema.TaggedEnum({
    Opened: {},
    Closed: {},
    Shown: {},
    Rotated: { orientation: Schema.Literals(["portrait", "landscape"]) }
  })

  const Screen = Native.component({
    name: "ModalScreen",
    model: Schema.Struct({
      open: Schema.Boolean,
      shows: Schema.Number,
      orientation: Schema.String
    }),
    message: Message
  }).make({
    init: () => ({ open: false, shows: 0, orientation: "" }),
    update: {
      Opened: ($) => $.evolve({ open: true }),
      Closed: ($) => $.evolve({ open: false }),
      Shown: ($) => $.evolve({ shows: (n) => n + 1 }),
      Rotated: ($, { orientation }) => $.evolve({ orientation })
    },
    view: (h, model) =>
      h.view.style({ flex: 1 }).children(
        h.text.children(`${model.shows}:${model.orientation}`),
        model.open && Modal(h, {
          onRequestClose: Message.Closed(),
          animationType: "slide",
          transparent: true,
          presentationStyle: "pageSheet",
          supportedOrientations: ["portrait", "landscape"],
          allowSwipeDismissal: true,
          hardwareAccelerated: true,
          statusBarTranslucent: true,
          navigationBarTranslucent: true
        })
          .on("show", Message.Shown())
          .on("orientationChange", ({ orientation }) =>
            Message.Rotated({ orientation }))
          .children(
            SafeArea(h).style({ flex: 1 }).children(
              h.text.children("Dialog")
            )
          )
      )
  })

  it("mounts RCTModalHostView while open, forwards props and events, and unmounts on requestClose", async () => {
    const { close, fabric, find, printed, root, settle } = await mountOn(
      "android",
      (container) => Renderer.mount(Screen, {}, container)
    )
    assert.strictEqual(printed(), "<RCTView><RCTText>0:</></>")

    root.send(Message.Opened())
    await settle()
    assert.strictEqual(
      printed(),
      "<RCTView><RCTText>0:</><RCTModalHostView><RCTSafeAreaView><RCTText>Dialog</></></></>"
    )
    const modal = find(FakeFabric.byName("RCTModalHostView"))
    assert.deepStrictEqual(modal.props, {
      visible: true,
      position: "absolute",
      animationType: "slide",
      transparent: true,
      presentationStyle: "pageSheet",
      supportedOrientations: ["portrait", "landscape"],
      allowSwipeDismissal: true,
      hardwareAccelerated: true,
      statusBarTranslucent: true,
      navigationBarTranslucent: true,
      onRequestClose: true,
      onShow: true,
      onOrientationChange: true
    })

    fabric.emit(modal, "topShow", {})
    fabric.emit(modal, "topOrientationChange", { orientation: "landscape" })
    await settle()
    assert.include(printed(), "<RCTText>1:landscape</>")

    fabric.emit(modal, "topRequestClose", {})
    await settle()
    assert.strictEqual(printed(), "<RCTView><RCTText>1:landscape</></>")
    await close()
  })
})

describe("Drawer", () => {
  const DrawerRef = Native.ref("drawer")
  const Message = UiSchema.TaggedEnum({
    Opened: {},
    Closed: {},
    Slid: { offset: Schema.Number },
    StateChanged: { state: Schema.String },
    Flipped: {}
  })

  const Screen = Native.component({
    name: "DrawerScreen",
    model: Schema.Struct({
      side: Schema.Literals(["left", "right"]),
      open: Schema.Boolean,
      offset: Schema.Number,
      state: Schema.String
    }),
    message: Message
  }).make({
    init: () => ({ side: "left" as const, open: false, offset: 0, state: "" }),
    update: {
      Opened: ($) => $.evolve({ open: true }),
      Closed: ($) => $.evolve({ open: false }),
      Slid: ($, { offset }) => $.evolve({ offset }),
      StateChanged: ($, { state }) => $.evolve({ state }),
      Flipped: ($) =>
        $.evolve({
          side: (s) => s === "left" ? "right" as const : "left" as const
        })
    },
    view: (h, model) =>
      Drawer(h, {
        drawerWidth: 240,
        drawerLockMode: "unlocked",
        drawerBackgroundColor: "#eee",
        drawer: h.text.children("Menu")
      })
        .prop("drawerPosition", model.side)
        .ref(DrawerRef)
        .on("drawerOpen", Message.Opened())
        .on("drawerClose", Message.Closed())
        .on("drawerSlide", ({ offset }) => Message.Slid({ offset }))
        .on(
          "drawerStateChanged",
          ({ state }) => Message.StateChanged({ state })
        )
        .children(
          h.text.children(`${model.open}:${model.offset}:${model.state}`)
        )
  })

  it("renders AndroidDrawerLayout with two non-collapsable wrappers, maps events, and flips sides", async () => {
    const { close, fabric, find, made, printed, root, settle } = await mountOn(
      "android",
      (container) => Renderer.mount(Screen, {}, container)
    )
    assert.strictEqual(
      printed(),
      "<AndroidDrawerLayout><RCTView><RCTText>false:0:</></><RCTView><RCTText>Menu</></></>"
    )
    const host = find(FakeFabric.byName("AndroidDrawerLayout"))
    assert.deepStrictEqual(host.props, {
      flex: 1,
      elevation: 16,
      drawerWidth: 240,
      drawerPosition: "left",
      drawerLockMode: "unlocked",
      drawerBackgroundColor: "processed #eee",
      onDrawerOpen: true,
      onDrawerClose: true,
      onDrawerSlide: true,
      onDrawerStateChanged: true
    })
    assert.deepStrictEqual(host.children[0]!.props, {
      collapsable: false,
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0
    })
    assert.deepStrictEqual(host.children[1]!.props, {
      collapsable: false,
      position: "absolute",
      top: 0,
      bottom: 0,
      start: 0,
      width: 240,
      backgroundColor: "processed #eee"
    })

    // Programmatic commands run against the root AndroidDrawerLayout ref.
    made.operations.command(host.handle as NativeHost.NativeNode, "openDrawer")
    made.operations.command(host.handle as NativeHost.NativeNode, "closeDrawer")
    assert.deepStrictEqual(fabric.commands, [
      [host.tag, "openDrawer", []],
      [host.tag, "closeDrawer", []]
    ])

    fabric.emit(host, "topDrawerStateChanged", { drawerState: 1 })
    fabric.emit(host, "topDrawerSlide", { offset: 0.5 })
    fabric.emit(host, "topDrawerOpen", {})
    await settle()
    assert.include(printed(), "<RCTText>true:0.5:dragging</>")

    fabric.emit(host, "topDrawerStateChanged", { drawerState: 0 })
    fabric.emit(host, "topDrawerClose", {})
    await settle()
    assert.include(printed(), "<RCTText>false:0.5:idle</>")

    root.send(Message.Flipped())
    await settle()
    const flipped = find(FakeFabric.byName("AndroidDrawerLayout"))
    assert.strictEqual(flipped.props.drawerPosition, "right")
    assert.isUndefined(flipped.children[1]!.props.start)
    assert.strictEqual(flipped.children[1]!.props.end, 0)
    await close()
  })

  it("falls back to a plain RCTView with a hidden drawer panel on iOS", async () => {
    const { close, fabric, printed } = await mountOn(
      "ios",
      (container) => Renderer.mount(Screen, {}, container)
    )
    assert.strictEqual(
      printed(),
      "<RCTView><RCTView><RCTText>false:0:</></><RCTView><RCTText>Menu</></></>"
    )
    assert.strictEqual(
      fabric.committed()[0]!.children[1]!.props.display,
      "none"
    )
    await close()
  })
})

describe("InputAccessory", () => {
  const Screen = Native.component({
    name: "AccessoryScreen",
    model: Schema.Number,
    message: Schema.Never
  }).make({
    init: () => 0,
    update: {},
    view: (h) =>
      h.view.children(
        h.input.prop("inputAccessoryViewID", "bar"),
        InputAccessory(h, { nativeID: "bar", backgroundColor: "#fff" })
          .children(
            h.text.children("Done")
          )
      )
  })

  it("renders RCTInputAccessoryView with an inner RCTSafeAreaView on iOS and hides on Android", async () => {
    const ios = await mountOn(
      "ios",
      (container) => Renderer.mount(Screen, {}, container)
    )
    assert.strictEqual(
      ios.printed(),
      "<RCTView><RCTSinglelineTextInputView></><RCTInputAccessoryView><RCTSafeAreaView><RCTText>Done</></></></>"
    )
    const accessory = ios.find(FakeFabric.byName("RCTInputAccessoryView"))
    assert.deepStrictEqual(accessory.props, {
      position: "absolute",
      nativeID: "bar",
      backgroundColor: "processed #fff"
    })
    assert.deepStrictEqual(accessory.children[0]!.props, { flex: 1 })
    await ios.close()

    const android = await mountOn(
      "android",
      (container) => Renderer.mount(Screen, {}, container)
    )
    assert.strictEqual(
      android.printed(),
      "<RCTView><AndroidTextInput></><RCTView><RCTView><RCTText>Done</></></></>"
    )
    assert.strictEqual(
      android.fabric.committed()[0]!.children[1]!.props.display,
      "none"
    )
    await android.close()
  })
})
