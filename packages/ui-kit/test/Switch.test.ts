import { UiSchema, View } from "@effect/ui"
import {
  Switch,
  type SwitchButton,
  type SwitchProps,
  type SwitchSpan
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const SettingsMessage = UiSchema.TaggedEnum({
  ToggledNotify: { checked: Schema.Boolean },
  ClickedRow: {}
})

// A consumer that keeps the value in its Model and draws the least markup
// the parts need: a labelled root with a thumb. The form field comes with
// the root. The row around it counts the clicks the switch leaves alone.
const Settings = Html.component({
  name: "Settings",
  props: Schema.Struct({
    disabled: Schema.optional(Schema.Boolean),
    readOnly: Schema.optional(Schema.Boolean),
    required: Schema.optional(Schema.Boolean)
  }),
  model: Schema.Struct({ notify: Schema.Boolean, rowClicks: Schema.Number }),
  message: SettingsMessage
}).make({
  init: () => ({ notify: false, rowClicks: 0 }),
  update: {
    ToggledNotify: ($, { checked }) => ({ ...$.model, notify: checked }),
    ClickedRow: ($) => ({ ...$.model, rowClicks: $.model.rowClicks + 1 })
  },
  view: (h, model) =>
    h.div.on("click", SettingsMessage.ClickedRow()).children(
      Switch(h, {
        props: { checked: model.notify, ...h.props },
        onToggle: ({ checked }) => SettingsMessage.ToggledNotify({ checked }),
        view: (parts) =>
          h.label(
            parts.root(h.button).children(parts.thumb(h.span.class("thumb"))),
            "Notifications"
          )
      }),
      h.output(String(model.rowClicks))
    )
})

const root = Locator.attr("role", "switch")
const thumb = Locator.tag("span")
const rowClicks = (
  scene: { readonly get: (locator: Locator.Locator) => Locator.Node }
) => scene.get(Locator.tag("output")).children?.[0]?.text
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

// The root a consumer gets for these props and this button: the element the
// part's builder becomes, with what `chain` adds after the part.
const rootOf = (
  props: SwitchProps,
  element: SwitchButton<never> = h.button,
  chain: (root: SwitchButton<never>) => SwitchButton<never> = (root) => root
) =>
  View.build(
    Switch(h, {
      props,
      view: (parts) => chain(parts.root(element)).children("label")
    }),
    []
  )

describe("Switch", () => {
  it.effect("a click asks for the other value, and the root and thumb show the value they were given", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Settings, {})
      const attrs = scene.get(root).attrs
      assert.strictEqual(attrs?.type, "button")
      assert.strictEqual(attrs?.["aria-checked"], "false")
      assert.strictEqual(attrs?.["data-unchecked"], "")
      assert.isUndefined(attrs?.["data-checked"])
      assert.strictEqual(scene.get(thumb).attrs?.class, "thumb")
      assert.strictEqual(scene.get(thumb).attrs?.["data-unchecked"], "")
      scene.fire(root, "click")
      assert.strictEqual(scene.get(root).attrs?.["aria-checked"], "true")
      assert.strictEqual(scene.get(root).attrs?.["data-checked"], "")
      assert.strictEqual(scene.get(thumb).attrs?.["data-checked"], "")
      assert.isUndefined(scene.get(thumb).attrs?.["data-unchecked"])
      scene.fire(root, "click")
      assert.strictEqual(scene.get(root).attrs?.["aria-checked"], "false")
      // The switch handled both clicks, so the row heard neither.
      assert.strictEqual(rowClicks(scene), "0")
    }))

  it.effect("a read-only switch leaves its click to the row around it, and only a disabled one leaves the tab order", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Settings, { disabled: true })
      const disabled = scene.get(root).attrs
      assert.strictEqual(disabled?.disabled, "")
      assert.strictEqual(disabled?.["data-disabled"], "")
      assert.strictEqual(scene.get(thumb).attrs?.["data-disabled"], "")
      scene.props({ readOnly: true, required: true })
      const attrs = scene.get(root).attrs
      assert.isUndefined(attrs?.disabled)
      assert.strictEqual(attrs?.["aria-readonly"], "true")
      assert.strictEqual(attrs?.["data-readonly"], "")
      assert.strictEqual(attrs?.["aria-required"], "true")
      assert.strictEqual(attrs?.["data-required"], "")
      const thumbAttrs = scene.get(thumb).attrs
      assert.isUndefined(thumbAttrs?.["data-disabled"])
      assert.strictEqual(thumbAttrs?.["data-readonly"], "")
      assert.strictEqual(thumbAttrs?.["data-required"], "")
      scene.fire(root, "click")
      assert.strictEqual(rowClicks(scene), "1")
      assert.strictEqual(scene.get(root).attrs?.["aria-checked"], "false")
    }))

  it("the root keeps the consumer's attributes, but the switch's own win, present or absent", () => {
    const element = h.button
      .class("switch")
      .attrs({
        "aria-label": "Mute",
        type: "submit",
        role: "checkbox",
        "aria-checked": "mixed",
        "aria-readonly": "true",
        "aria-disabled": "true",
        "aria-required": "true",
        "data-checked": "",
        "data-disabled": "",
        "data-readonly": "",
        "data-required": ""
      })

    // An enabled, optional, unchecked switch removes every state attribute
    // the consumer set, as it doesn't report those states.
    assert.deepStrictEqual(
      rootOf({ checked: false }, element.disabled(true)).attrs,
      {
        class: "switch",
        "aria-label": "Mute",
        type: "button",
        role: "switch",
        "aria-checked": "false",
        "data-unchecked": ""
      }
    )
    // A disabled, checked switch keeps its own `disabled` over the
    // consumer's removal, and removes the consumer's `data-unchecked`,
    // chained after the part as well as set before it.
    const disabled = rootOf(
      { checked: true, disabled: true },
      element.attr("data-unchecked", ""),
      (root) => root.disabled(false).attr("role", "checkbox")
    )
    assert.deepStrictEqual(disabled.attrs, {
      class: "switch",
      "aria-label": "Mute",
      type: "button",
      role: "switch",
      "aria-checked": "true",
      disabled: "",
      "data-checked": "",
      "data-disabled": ""
    })
  })

  it("the thumb drops a state the switch doesn't have, and its result is another call's element", () => {
    const element = h.span.class("thumb")
      .attrs({
        "data-checked": "",
        "data-disabled": "",
        "data-readonly": "",
        "data-required": ""
      })
    const thumbOf = (checked: boolean, span: SwitchSpan<never>) =>
      View.build(
        Switch(h, {
          props: { checked },
          view: (parts) => parts.thumb(span).children("on")
        }),
        []
      )
    const finished = thumbOf(false, element)
    assert.deepStrictEqual(finished.attrs, {
      class: "thumb",
      "aria-hidden": "true",
      "data-unchecked": ""
    })
    assert.strictEqual(finished.children.length, 1)
    // The part returns the builder, so a second call takes it as its
    // element. Both write when the span is built, the inner call last.
    const builder = Switch(h, {
      props: { checked: false, required: true },
      view: (parts) => parts.thumb(element)
    })
    assert.deepStrictEqual(thumbOf(true, builder).attrs, {
      class: "thumb",
      "aria-hidden": "true",
      "data-unchecked": "",
      "data-required": ""
    })
  })

  it("the root keeps a consumer's click handler without onToggle, and refuses it with one in every state", () => {
    const handler = () => undefined
    assert.strictEqual(
      rootOf({ checked: false }, h.button.on("click", handler)).handlers.click,
      handler
    )
    const toggling = (props: SwitchProps, when: "before" | "after") => () =>
      View.build(
        Switch(h, {
          props,
          onToggle: () => undefined,
          view: (parts) =>
            when === "before"
              ? parts.root(h.button.on("click", handler))
              : parts.root(h.button).on("click", handler)
        }),
        []
      )
    // Set on the builder before the part, or chained after it.
    assert.throws(
      toggling({ checked: false }, "before"),
      /Switch: the root already handles click/
    )
    assert.throws(
      toggling({ checked: false }, "after"),
      /Switch: the root already handles click/
    )
    // A read-only switch sets no handler, but it would once it's editable.
    assert.throws(
      toggling({ checked: false, readOnly: true }, "after"),
      /Switch: the root already handles click/
    )
  })

  it("the root draws the form field before its children: value when on, and uncheckedValue or nothing when off", () => {
    const field = (props: SwitchProps) => {
      const first = rootOf(props).children[0]!
      if (first._tag !== "Element") return null
      assert.strictEqual(first.tag, "input")
      assert.strictEqual(first.attrs.type, "hidden")
      assert.strictEqual(first.attrs.name, "notify")
      return first.attrs.value
    }
    assert.strictEqual(field({ checked: true, name: "notify" }), "on")
    assert.strictEqual(
      field({ checked: true, name: "notify", value: "yes" }),
      "yes"
    )
    assert.isNull(field({ checked: false, name: "notify" }))
    assert.strictEqual(
      field({ checked: false, name: "notify", uncheckedValue: "no" }),
      "no"
    )
    // A disabled field submits nothing, as a disabled checkbox doesn't, and
    // a switch without a name has no field.
    assert.isNull(field({ checked: true, name: "notify", disabled: true }))
    assert.isNull(field({ checked: true }))
  })
})
