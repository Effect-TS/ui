import { ActivityIndicator } from "@effect/ui-native/kit/ActivityIndicator"
import { Switch } from "@effect/ui-native/kit/Switch"
import * as Native from "@effect/ui-native/Native"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { assert, describe, it } from "vitest"
import * as FakeFabric from "./utils/FakeFabric.ts"

const processColor = (color: unknown) => `processed ${String(color)}`

const SwitchMessage = UiSchema.TaggedEnum({
  Toggled: { checked: Schema.Boolean },
  Rejected: {},
  Configured: {
    disabled: Schema.optional(Schema.Boolean),
    styled: Schema.optional(Schema.Boolean),
    borderRadius: Schema.optional(Schema.NullOr(Schema.Number)),
    alignSelf: Schema.optional(Schema.NullOr(Schema.Literal("center")))
  }
})

const SwitchHarness = Native.component({
  name: "SwitchHarness",
  props: Schema.Struct({
    reject: Schema.optional(Schema.Union([
      Schema.Literal("silent"),
      Schema.Literal("rerender")
    ])),
    unhandled: Schema.optional(Schema.Boolean)
  }),
  model: Schema.Struct({
    checked: Schema.Boolean,
    disabled: Schema.Boolean,
    styled: Schema.Boolean,
    borderRadius: Schema.NullOr(Schema.Number),
    alignSelf: Schema.NullOr(Schema.Literal("center")),
    rejections: Schema.Number
  }),
  message: SwitchMessage
}).make({
  init: () => ({
    checked: false,
    disabled: false,
    styled: true,
    borderRadius: null,
    alignSelf: null,
    rejections: 0
  }),
  update: {
    Toggled: ($, { checked }) => $.evolve({ checked }),
    Rejected: ($) => $.evolve({ rejections: (n) => n + 1 }),
    Configured: ($, { alignSelf, borderRadius, disabled, styled }) =>
      $.evolve({
        ...(disabled === undefined ? {} : { disabled }),
        ...(styled === undefined ? {} : { styled }),
        ...(borderRadius === undefined ? {} : { borderRadius }),
        ...(alignSelf === undefined ? {} : { alignSelf })
      })
  },
  view: (h, model) =>
    h.view.children(
      Switch(h, {
        props: {
          checked: model.checked,
          disabled: model.disabled,
          ...(model.styled
            ? {
              thumbColor: "#fff",
              trackColor: { false: "#767577", true: "#81b0ff" },
              iosBackgroundColor: "#3e3e3e"
            }
            : {})
        },
        ...(h.props.unhandled
          ? {}
          : {
            onToggle: ({ checked }) =>
              h.props.reject === "silent"
                ? undefined
                : h.props.reject === "rerender"
                ? SwitchMessage.Rejected()
                : SwitchMessage.Toggled({ checked })
          })
      }).style({
        marginLeft: 8,
        borderRadius: model.borderRadius ?? undefined,
        alignSelf: model.alignSelf ?? undefined
      }),
      h.text.children(`${model.checked}:${model.rejections}`)
    )
})

const IndicatorMessage = UiSchema.TaggedEnum({
  Updated: {
    animating: Schema.Boolean,
    size: Schema.Union([
      Schema.Literal("small"),
      Schema.Literal("large"),
      Schema.Number
    ]),
    colored: Schema.Boolean,
    hidesWhenStopped: Schema.Boolean
  }
})

const IndicatorHarness = Native.component({
  name: "IndicatorHarness",
  model: Schema.Struct({
    animating: Schema.Boolean,
    size: Schema.Union([
      Schema.Literal("small"),
      Schema.Literal("large"),
      Schema.Number
    ]),
    colored: Schema.Boolean,
    hidesWhenStopped: Schema.Boolean
  }),
  message: IndicatorMessage
}).make({
  init: () => ({
    animating: true,
    size: "small" as const,
    colored: false,
    hidesWhenStopped: true
  }),
  update: {
    Updated: (_, next) => next
  },
  view: (h, model) =>
    h.view.children(
      ActivityIndicator(h),
      ActivityIndicator(h, {
        props: {
          animating: model.animating,
          size: model.size,
          color: model.colored ? "#2563eb" : undefined,
          hidesWhenStopped: model.hidesWhenStopped
        }
      }).style({ marginTop: 12 }),
      ActivityIndicator(h, { props: { size: "small" } }).style({
        width: 44,
        height: 44
      })
    )
})

describe("@effect/ui-native/kit", () => {
  for (const os of ["android", "ios"] as const) {
    const viewName = os === "ios" ? "RCTSwitch" : "AndroidSwitch"
    const valueProp = os === "ios" ? "value" : "on"
    const commandName = os === "ios" ? "setValue" : "setNativeValue"

    it(`Switch accepts toggles, updates platform props, and disables interaction on ${os}`, async () => {
      const { close, fabric, find, root, settle } = await FakeFabric.mount(
        (container) => Renderer.mount(SwitchHarness, {}, container),
        processColor,
        os
      )
      const node = () => find(FakeFabric.byName(viewName))
      if (os === "ios") {
        assert.deepStrictEqual(node().props, {
          accessibilityRole: "switch",
          value: false,
          alignSelf: "flex-start",
          disabled: false,
          thumbTintColor: "processed #fff",
          tintColor: "processed #767577",
          onTintColor: "processed #81b0ff",
          backgroundColor: "processed #3e3e3e",
          borderRadius: 16,
          marginLeft: 8,
          onChange: true
        })
      } else {
        assert.deepStrictEqual(node().props, {
          accessibilityRole: "switch",
          on: false,
          enabled: true,
          thumbTintColor: "processed #fff",
          trackColorForFalse: "processed #767577",
          trackColorForTrue: "processed #81b0ff",
          marginLeft: 8,
          onChange: true
        })
      }

      // Accepted toggle commits the new value and sends no restore command.
      fabric.emit(node(), "topChange", { target: node().tag, value: true })
      await settle()
      await new Promise((r) => setTimeout(r, 0))
      assert.strictEqual(node().props[valueProp], true)
      assert.deepStrictEqual(fabric.commands, [])

      // Explicit borderRadius and alignSelf survive removing and re-adding
      // iosBackgroundColor, and fall back to iOS defaults when cleared.
      if (os === "ios") {
        root.send(
          SwitchMessage.Configured({ borderRadius: 8, alignSelf: "center" })
        )
        await settle()
        assert.strictEqual(node().props.borderRadius, 8)
        assert.strictEqual(node().props.alignSelf, "center")

        root.send(SwitchMessage.Configured({ styled: false }))
        await settle()
        assert.isUndefined(node().props.backgroundColor)
        assert.strictEqual(node().props.borderRadius, 8)
        assert.strictEqual(node().props.alignSelf, "center")

        root.send(SwitchMessage.Configured({ styled: true }))
        await settle()
        assert.strictEqual(node().props.backgroundColor, "processed #3e3e3e")
        assert.strictEqual(node().props.borderRadius, 8)

        root.send(
          SwitchMessage.Configured({ borderRadius: null, alignSelf: null })
        )
        await settle()
        assert.strictEqual(node().props.borderRadius, 16)
        assert.strictEqual(node().props.alignSelf, "flex-start")
      }

      // Disabling removes the handler, updates native enabled/disabled, and clears styling.
      root.send(SwitchMessage.Configured({ disabled: true, styled: false }))
      await settle()
      assert.isUndefined(node().props.onChange)
      assert.isUndefined(node().props.thumbTintColor)
      if (os === "ios") {
        assert.strictEqual(node().props.disabled, true)
        assert.strictEqual(node().props.alignSelf, "flex-start")
        assert.isUndefined(node().props.tintColor)
        assert.isUndefined(node().props.onTintColor)
        assert.isUndefined(node().props.backgroundColor)
        assert.isUndefined(node().props.borderRadius)
      } else {
        assert.strictEqual(node().props.enabled, false)
        assert.isUndefined(node().props.trackColorForFalse)
        assert.isUndefined(node().props.trackColorForTrue)
      }

      // A native event while disabled does not notify onToggle and snaps back.
      fabric.emit(node(), "topChange", { target: node().tag, value: false })
      await new Promise((r) => setTimeout(r, 0))
      assert.strictEqual(node().props[valueProp], true)
      assert.deepStrictEqual(fabric.commands, [
        [node().tag, commandName, [true]]
      ])
      await close()
    })

    it(`Switch sends the controlled value back when a toggle is rejected on ${os}`, async () => {
      // Silent rejection (no re-render): restored after the event tick.
      const silent = await FakeFabric.mount(
        (container) =>
          Renderer.mount(SwitchHarness, { reject: "silent" }, container),
        processColor,
        os
      )
      const silentNode = silent.find(FakeFabric.byName(viewName))
      silent.fabric.emit(silentNode, "topChange", {
        target: silentNode.tag,
        value: true
      })
      await new Promise((r) => setTimeout(r, 0))
      assert.strictEqual(silentNode.props[valueProp], false)
      assert.deepStrictEqual(silent.fabric.commands, [
        [silentNode.tag, commandName, [false]]
      ])

      // Unmounting before restore sends no command.
      silent.fabric.emit(silentNode, "topChange", {
        target: silentNode.tag,
        value: true
      })
      await silent.close()
      await new Promise((r) => setTimeout(r, 0))
      assert.strictEqual(silent.fabric.commands.length, 1)

      // Rejection with a re-render (Model changes elsewhere, checked stays false): restored once.
      const rerender = await FakeFabric.mount(
        (container) =>
          Renderer.mount(SwitchHarness, { reject: "rerender" }, container),
        processColor,
        os
      )
      const rerenderNode = () => rerender.find(FakeFabric.byName(viewName))
      rerender.fabric.emit(rerenderNode(), "topChange", {
        target: rerenderNode().tag,
        value: true
      })
      await rerender.settle()
      await new Promise((r) => setTimeout(r, 0))
      assert.include(rerender.printed(), "false:1")
      assert.deepStrictEqual(rerender.fabric.commands, [
        [rerenderNode().tag, commandName, [false]]
      ])
      await rerender.close()

      // No onToggle handler at all: still snaps back to checked.
      const unhandled = await FakeFabric.mount(
        (container) =>
          Renderer.mount(SwitchHarness, { unhandled: true }, container),
        processColor,
        os
      )
      const unhandledNode = unhandled.find(FakeFabric.byName(viewName))
      unhandled.fabric.emit(unhandledNode, "topChange", {
        target: unhandledNode.tag,
        value: true
      })
      await new Promise((r) => setTimeout(r, 0))
      assert.deepStrictEqual(unhandled.fabric.commands, [
        [unhandledNode.tag, commandName, [false]]
      ])
      await unhandled.close()
    })
  }

  it("ActivityIndicator maps defaults, sizes, color and platform props on Android and iOS", async () => {
    for (const os of ["android", "ios"] as const) {
      const viewName = os === "ios"
        ? "ActivityIndicatorView"
        : "AndroidProgressBar"
      const { close, fabric, root, settle } = await FakeFabric.mount(
        (container) => Renderer.mount(IndicatorHarness, {}, container),
        processColor,
        os
      )
      const children = () => fabric.committed()[0]!.children
      assert.strictEqual(children()[0]!.viewName, viewName)
      assert.deepStrictEqual(
        children()[0]!.props,
        os === "ios"
          ? { animating: true, width: 20, height: 20, size: "small" }
          : {
            styleAttr: "Normal",
            indeterminate: true,
            animating: true,
            width: 20,
            height: 20
          }
      )
      // Consumer .style({ width, height }) overrides size defaults.
      assert.strictEqual(children()[2]!.props.width, 44)
      assert.strictEqual(children()[2]!.props.height, 44)

      root.send(IndicatorMessage.Updated({
        animating: false,
        size: "large",
        colored: true,
        hidesWhenStopped: false
      }))
      await settle()
      assert.deepStrictEqual(
        children()[1]!.props,
        os === "ios"
          ? {
            animating: false,
            width: 36,
            height: 36,
            size: "large",
            color: "processed #2563eb",
            hidesWhenStopped: false,
            marginTop: 12
          }
          : {
            styleAttr: "Normal",
            indeterminate: true,
            animating: false,
            width: 36,
            height: 36,
            color: "processed #2563eb",
            marginTop: 12
          }
      )

      // Numeric size sets dimensions on both platforms and drops iOS string size.
      root.send(IndicatorMessage.Updated({
        animating: true,
        size: 52,
        colored: false,
        hidesWhenStopped: true
      }))
      await settle()
      assert.strictEqual(children()[1]!.props.width, 52)
      assert.strictEqual(children()[1]!.props.height, 52)
      assert.isUndefined(children()[1]!.props.size)
      assert.isUndefined(children()[1]!.props.color)
      await close()
    }
  })
})
