import { ActivityIndicator } from "@effect/ui-native/kit/ActivityIndicator"
import { Switch } from "@effect/ui-native/kit/Switch"
import * as Native from "@effect/ui-native/Native"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { assert, describe, it } from "vitest"
import * as FakeFabric from "./utils/FakeFabric.ts"

const processColor = (color: unknown) => `processed ${String(color)}`
// The host restores a rejected toggle a macrotask after the event.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const Mode = Schema.Literals(["accept", "silent", "rerender"])

const SwitchMessage = UiSchema.TaggedEnum({
  Toggled: { checked: Schema.Boolean },
  Rejected: {},
  Configured: {
    mode: Schema.optional(Mode),
    disabled: Schema.optional(Schema.Boolean),
    styled: Schema.optional(Schema.Boolean),
    borderRadius: Schema.optional(Schema.NullOr(Schema.Number)),
    alignSelf: Schema.optional(Schema.NullOr(Schema.Literal("center")))
  }
})

const SwitchHarness = Native.component({
  name: "SwitchHarness",
  model: Schema.Struct({
    checked: Schema.Boolean,
    mode: Mode,
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
    mode: "accept" as const,
    disabled: false,
    styled: true,
    borderRadius: null,
    alignSelf: null,
    rejections: 0
  }),
  update: {
    Toggled: ($, { checked }) => $.evolve({ checked }),
    Rejected: ($) => $.evolve({ rejections: (n) => n + 1 }),
    Configured: ($, { alignSelf, borderRadius, disabled, mode, styled }) =>
      $.evolve({
        ...(mode === undefined ? {} : { mode }),
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
        onToggle: ({ checked }) =>
          model.mode === "silent"
            ? undefined
            : model.mode === "rerender"
            ? SwitchMessage.Rejected()
            : SwitchMessage.Toggled({ checked })
      }).style({
        marginLeft: 8,
        borderRadius: model.borderRadius ?? undefined,
        alignSelf: model.alignSelf ?? undefined
      }),
      h.text.children(`${model.checked}:${model.rejections}`)
    )
})

const IndicatorSize = Schema.Union([
  Schema.Literal("small"),
  Schema.Literal("large"),
  Schema.Number
])

const IndicatorMessage = UiSchema.TaggedEnum({
  Updated: {
    animating: Schema.Boolean,
    size: IndicatorSize,
    colored: Schema.Boolean,
    hidesWhenStopped: Schema.Boolean
  }
})

const IndicatorHarness = Native.component({
  name: "IndicatorHarness",
  model: Schema.Struct({
    animating: Schema.Boolean,
    size: IndicatorSize,
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
  update: { Updated: (_, next) => next },
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
  it("Switch maps platform props, restores rejected toggles, and preserves iOS styles", async () => {
    for (const os of ["android", "ios"] as const) {
      const viewName = os === "ios" ? "RCTSwitch" : "AndroidSwitch"
      const valueProp = os === "ios" ? "value" : "on"
      const commandName = os === "ios" ? "setValue" : "setNativeValue"
      const { close, fabric, find, printed, root, settle } = await FakeFabric
        .mount(
          (container) => Renderer.mount(SwitchHarness, {}, container),
          processColor,
          os
        )
      const node = () => find(FakeFabric.byName(viewName))
      const toggle = (value: boolean) =>
        fabric.emit(node(), "topChange", { target: node().tag, value })

      assert.deepStrictEqual(
        node().props,
        os === "ios"
          ? {
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
          }
          : {
            accessibilityRole: "switch",
            on: false,
            enabled: true,
            thumbTintColor: "processed #fff",
            trackColorForFalse: "processed #767577",
            trackColorForTrue: "processed #81b0ff",
            marginLeft: 8,
            onChange: true
          }
      )

      toggle(true)
      await settle()
      await tick()
      assert.strictEqual(node().props[valueProp], true)
      assert.deepStrictEqual(fabric.commands, [])

      const tag = node().tag
      root.send(SwitchMessage.Configured({ mode: "silent" }))
      await settle()
      toggle(false)
      await tick()
      assert.strictEqual(node().props[valueProp], true)

      root.send(SwitchMessage.Configured({ mode: "rerender" }))
      await settle()
      toggle(false)
      await settle()
      await tick()
      assert.include(printed(), "true:1")

      if (os === "ios") {
        root.send(
          SwitchMessage.Configured({ borderRadius: 8, alignSelf: "center" })
        )
        await settle()
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

      root.send(
        SwitchMessage.Configured({
          mode: "accept",
          disabled: true,
          styled: false
        })
      )
      await settle()
      assert.isUndefined(node().props.onChange)
      assert.isUndefined(node().props.thumbTintColor)
      if (os === "ios") {
        assert.strictEqual(node().props.disabled, true)
        assert.isUndefined(node().props.tintColor)
        assert.isUndefined(node().props.onTintColor)
        assert.isUndefined(node().props.backgroundColor)
        assert.isUndefined(node().props.borderRadius)
      } else {
        assert.strictEqual(node().props.enabled, false)
        assert.isUndefined(node().props.trackColorForFalse)
        assert.isUndefined(node().props.trackColorForTrue)
      }
      toggle(false)
      await tick()
      assert.strictEqual(node().props[valueProp], true)
      assert.deepStrictEqual(fabric.commands, [
        [tag, commandName, [true]],
        [tag, commandName, [true]],
        [tag, commandName, [true]]
      ])
      await close()
    }
  })

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
