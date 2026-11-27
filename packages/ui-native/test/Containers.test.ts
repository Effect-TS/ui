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

describe("Modal and SafeArea", () => {
  const Message = UiSchema.TaggedEnum({
    Opened: {},
    Closed: {},
    Shown: {}
  })

  const Screen = Native.component({
    name: "ModalScreen",
    model: Schema.Struct({ open: Schema.Boolean, shows: Schema.Number }),
    message: Message
  }).make({
    init: () => ({ open: false, shows: 0 }),
    update: {
      Opened: ($) => $.evolve({ open: true }),
      Closed: ($) => $.evolve({ open: false }),
      Shown: ($) => $.evolve({ shows: (n) => n + 1 })
    },
    view: (h, model) =>
      h.view.style({ flex: 1 }).children(
        h.text.children(String(model.shows)),
        model.open && Modal(h, {
          onRequestClose: Message.Closed(),
          animationType: "slide",
          transparent: true
        })
          .on("show", Message.Shown())
          .children(
            SafeArea(h).style({ flex: 1 }).children(h.text.children("Dialog"))
          )
      )
  })

  it("mounts RCTModalHostView while open, forwards options and events, and unmounts on requestClose", async () => {
    const { close, fabric, find, printed, root, settle } = await mountOn(
      "android",
      (container) => Renderer.mount(Screen, {}, container)
    )
    assert.strictEqual(printed(), "<RCTView><RCTText>0</></>")

    root.send(Message.Opened())
    await settle()
    assert.strictEqual(
      printed(),
      "<RCTView><RCTText>0</><RCTModalHostView><RCTSafeAreaView><RCTText>Dialog</></></></>"
    )
    const modal = find(FakeFabric.byName("RCTModalHostView"))
    assert.deepStrictEqual(modal.props, {
      visible: true,
      position: "absolute",
      animationType: "slide",
      transparent: true,
      onRequestClose: true,
      onShow: true
    })

    fabric.emit(modal, "topShow", {})
    await settle()
    assert.include(printed(), "<RCTText>1</>")

    fabric.emit(modal, "topRequestClose", {})
    await settle()
    assert.strictEqual(printed(), "<RCTView><RCTText>1</></>")
    await close()
  })
})

describe("Drawer", () => {
  const Message = UiSchema.TaggedEnum({
    StateChanged: { state: Schema.String },
    Flipped: {}
  })

  const Screen = Native.component({
    name: "DrawerScreen",
    model: Schema.Struct({
      side: Schema.Literals(["left", "right"]),
      state: Schema.String
    }),
    message: Message
  }).make({
    init: () => ({ side: "left" as const, state: "" }),
    update: {
      StateChanged: ($, { state }) => $.evolve({ state }),
      Flipped: ($) =>
        $.evolve({
          side: (s) => s === "left" ? "right" as const : "left" as const
        })
    },
    view: (h, model) =>
      Drawer(h, {
        drawerWidth: 240,
        drawerBackgroundColor: "#eee",
        drawer: h.text.children("Menu")
      })
        .prop("drawerPosition", model.side)
        .on(
          "drawerStateChanged",
          ({ state }) => Message.StateChanged({ state })
        )
        .children(h.text.children(model.state))
  })

  it("renders two wrappers on Android, maps drawer state, follows chained props, and hides the panel on iOS", async () => {
    const android = await mountOn(
      "android",
      (container) => Renderer.mount(Screen, {}, container)
    )
    assert.strictEqual(
      android.printed(),
      "<AndroidDrawerLayout><RCTView><RCTText></></><RCTView><RCTText>Menu</></></>"
    )
    const host = android.find(FakeFabric.byName("AndroidDrawerLayout"))
    assert.deepStrictEqual(host.props, {
      flex: 1,
      elevation: 16,
      drawerWidth: 240,
      drawerPosition: "left",
      drawerBackgroundColor: "processed #eee",
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

    android.fabric.emit(host, "topDrawerStateChanged", { drawerState: 1 })
    await android.settle()
    assert.include(android.printed(), "<RCTText>dragging</>")

    android.root.send(Message.Flipped())
    await android.settle()
    const flipped = android.find(FakeFabric.byName("AndroidDrawerLayout"))
    assert.strictEqual(flipped.props.drawerPosition, "right")
    assert.isUndefined(flipped.children[1]!.props.start)
    assert.strictEqual(flipped.children[1]!.props.end, 0)
    await android.close()

    const ios = await mountOn(
      "ios",
      (container) => Renderer.mount(Screen, {}, container)
    )
    assert.strictEqual(
      ios.printed(),
      "<RCTView><RCTView><RCTText></></><RCTView><RCTText>Menu</></></>"
    )
    assert.strictEqual(
      ios.fabric.committed()[0]!.children[1]!.props.display,
      "none"
    )
    await ios.close()
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
      InputAccessory(h, { nativeID: "bar", backgroundColor: "#fff" }).children(
        h.text.children("Done")
      )
  })

  it("renders RCTInputAccessoryView with an inner RCTSafeAreaView on iOS and hides on Android", async () => {
    const ios = await mountOn(
      "ios",
      (container) => Renderer.mount(Screen, {}, container)
    )
    assert.strictEqual(
      ios.printed(),
      "<RCTInputAccessoryView><RCTSafeAreaView><RCTText>Done</></></>"
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
      "<RCTView><RCTView><RCTText>Done</></></>"
    )
    assert.strictEqual(
      android.fabric.committed()[0]!.props.display,
      "none"
    )
    await android.close()
  })
})
