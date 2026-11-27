import { Component, Mount, UiSchema, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import type { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"

const Picker = Html.customElement({
  tag: "hex-color-picker",
  properties: {
    color: Schema.String,
    value: Schema.Array(Schema.Number),
    content: Schema.String,
    disabled: Schema.String
  },
  events: {
    "color-changed": Schema.Struct({ value: Schema.String }),
    change: Schema.Struct({ n: Schema.Number }),
    click: Schema.Struct({ x: Schema.Number })
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

declare class TestQrCodeElement extends HTMLElement {
  value: string
  size: number
  errorCorrection: "L" | "M" | "Q" | "H"
  readonly version: number
  data: null
  onScan?: ((value: string) => void) | undefined
  generate(): void
}

declare global {
  interface HTMLElementTagNameMap {
    "test-qr-code": TestQrCodeElement
  }
}

describe("Html.customElement", () => {
  it("types the property methods and the primitives by the declared Schemas", () => {
    Html.component({ name: "App", model: Schema.String, message: Message })
      .make({
        init: () => "",
        update: { ChangedColor: (_, { color }) => color, Cleared: () => "" },
        view: (h, color) => {
          const picker = Picker(h).id("p").class("swatch").color(color)
            .on(
              "color-changed",
              ({ value }) => Message.ChangedColor({ color: value })
            )
            .on("click", ({ x }) => x > 0 ? Message.Cleared() : undefined)
            .disabled("yes")
            .value([1, 2])
            .on("change", ({ n }) => n > 0 ? Message.Cleared() : undefined)
            .prop("content", "tip")
            .children(h.span("slot"))
            .color(color)
          expect(picker.color).type.not.toBeCallableWith(1)
          expect(picker.value).type.not.toBeCallableWith("x")
          expect(picker.disabled).type.not.toBeCallableWith(true)
          expect(picker.on).type.not.toBeCallableWith(
            "click",
            ({ button }: { readonly button: number }) =>
              button > 0 ? Message.Cleared() : undefined
          )
          expect(picker.prop).type.not.toBeCallableWith("color", 1)
          expect(picker.prop).type.not.toBeCallableWith("nope", "x")
          expect(picker.on).type.not.toBeCallableWith("nope", Message.Cleared())
          expect(picker).type.not.toHaveProperty("nope")
          expect(picker.content).type.toBe<
            ReadonlyArray<View.Node<typeof Message.Type, any>> | undefined
          >()
          expect(picker.on).type.not.toBeCallableWith(
            "color-changed",
            ({ hex }: { readonly hex: string }) =>
              Message.ChangedColor({ color: hex })
          )
          expect(picker.on).type.not.toBeCallableWith("color-changed", {
            _tag: "Other" as const
          })
          const Attach = Mount.make(
            "Attach",
            { args: {} },
            (_: HTMLElement) => Effect.succeed(Component.noop)
          )
          expect(Picker(h).onMount(Attach()).forward((node) => h.div(node)))
            .type.toHaveProperty("color")
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

  it("infers prop and ref types from HTMLElementTagNameMap", () => {
    const h = {} as Html.H<typeof Message.Type>
    const QrCode = Html.customElement({ tag: "test-qr-code" })
    const qr = QrCode(h)
    const qrRef = Html.ref("Qr", "test-qr-code")

    expect(qr.prop).type.toBeCallableWith("value", "https://effect.website")
    expect(qr.prop).type.toBeCallableWith("size", 256)
    expect(qr.prop).type.toBeCallableWith("errorCorrection", "H")
    expect(qr.prop).type.not.toBeCallableWith("errorCorrection", "Z")
    expect(qr.prop).type.not.toBeCallableWith("size", "256")
    expect(qr.prop).type.not.toBeCallableWith("version", 1)
    expect(qr.prop).type.toBeCallableWith("data", null)
    expect(qr.prop).type.not.toBeCallableWith("generate", () => {})
    expect(qr.prop).type.not.toBeCallableWith("onScan", () => {})
    expect(qr.prop).type.not.toBeCallableWith("title", "qr")
    expect(qr).type.not.toHaveProperty("size")
    expect(qr.ref).type.toBeCallableWith(qrRef)
    expect(qr.ref).type.not.toBeCallableWith(Html.ref("Div", "div"))

    const CustomQrCode = Html.customElement({
      tag: "test-qr-code",
      properties: { size: Schema.String, custom: Schema.Boolean }
    })
    const customQr = CustomQrCode(h)
    expect(customQr.size).type.toBeCallableWith("256")
    expect(customQr.prop).type.toBeCallableWith("size", "256")
    expect(customQr.prop).type.not.toBeCallableWith("size", 256)
    expect(customQr.custom).type.toBeCallableWith(true)
    expect(customQr.custom).type.not.toBeCallableWith("yes")
    expect(customQr.prop).type.toBeCallableWith("custom", true)
    expect(customQr.prop).type.toBeCallableWith("errorCorrection", "H")
    expect(customQr).type.not.toHaveProperty("errorCorrection")

    const Plain = Html.customElement({ tag: "test-unregistered" })
    expect(Plain(h).prop).type.not.toBeCallableWith("value", "x")
  })
})
