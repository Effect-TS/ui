import { Component, UiSchema, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import type { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

const Picker = Html.customElement({
  tag: "hex-color-picker",
  properties: {
    color: Schema.String,
    value: Schema.Array(Schema.Number),
    content: Schema.String
  },
  events: {
    "color-changed": Schema.Struct({ value: Schema.String }),
    change: Schema.Struct({ n: Schema.Number })
  }
})

interface NativeTags<Msg> {
  readonly view: View.ElementBuilder<Msg>
}
interface Native extends View.Elements {
  readonly Tags: NativeTags<this["Msg"]>
  readonly Host: { readonly NativeHost: unique symbol }
}

const Message = UiSchema.TaggedEnum({
  ChangedColor: { color: Schema.String },
  Cleared: {}
})

describe("Html.customElement", () => {
  it("types the generated methods and the primitives by the declared Schemas", () => {
    Html.component({ name: "App", model: Schema.String, message: Message })
      .make({
        init: () => "",
        update: { ChangedColor: (_, { color }) => color, Cleared: () => "" },
        view: (h, color) => {
          const picker = Picker(h).id("p").class("swatch").color(color)
            .onColorChanged(({ value }) =>
              Message.ChangedColor({ color: value })
            )
            .onClick(Message.Cleared())
            .value([1, 2])
            .onChange(({ n }) => n > 0 ? Message.Cleared() : undefined)
            .prop("content", "tip")
            .on(
              "color-changed",
              ({ value }) => Message.ChangedColor({ color: value })
            )
            .children(h.span("slot"))
            .color(color)
          expect(picker.color).type.not.toBeCallableWith(1)
          expect(picker.value).type.not.toBeCallableWith("x")
          expect(picker.prop).type.not.toBeCallableWith("color", 1)
          expect(picker.prop).type.not.toBeCallableWith("nope", "x")
          expect(picker.on).type.not.toBeCallableWith("nope", Message.Cleared())
          expect(picker).type.not.toHaveProperty("nope")
          expect(picker).type.not.toHaveProperty("onNope")
          expect(picker.content).type.toBe<
            ReadonlyArray<View.Node<typeof Message.Type, any>> | undefined
          >()
          expect(picker.onColorChanged).type.not.toBeCallableWith(
            ({ hex }: { readonly hex: string }) =>
              Message.ChangedColor({ color: hex })
          )
          expect(picker.onColorChanged).type.not.toBeCallableWith({
            _tag: "Other" as const
          })
          return Picker(h)(h.span("shorthand")).color(color)
        }
      })
  })

  it("only an HTML view can use it", () => {
    const Native: View.Vocabulary<Native> = { name: "native", tags: {} }
    Component.define({
      name: "App",
      model: Schema.String,
      message: Message,
      elements: Native
    })
      .make({
        init: () => "",
        update: { ChangedColor: ($) => $.model, Cleared: ($) => $.model },
        view: (h) => {
          expect(Picker).type.not.toBeCallableWith(h)
          return h.view
        }
      })
  })

  it("a scene fires a declared event with the detail its Schema encodes", () => {
    const scene = {} as HtmlScene.Steps<any>
    const picker = Locator.tag("hex-color-picker")
    expect(scene.fireElement).type.toBeCallableWith(
      Picker,
      picker,
      "color-changed",
      { value: "#fff" }
    )
    expect(scene.fireElement).type.not.toBeCallableWith(
      Picker,
      picker,
      "color-changed",
      { hex: "#fff" }
    )
    expect(scene.fireElement).type.not.toBeCallableWith(
      Picker,
      picker,
      "nope",
      {}
    )
  })
})
