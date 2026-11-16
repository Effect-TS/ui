// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"
import { Component, type View } from "@effect/ui"
import type { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

describe("@effect/ui/html/register", () => {
  it("types reusable pure views with Component.H", () => {
    const button = <Msg>(h: Component.H<Msg>, message: Msg) => {
      expect(h.props).type.toBe<unknown>()
      expect(h.button).type.toBe<Html.Tags<Msg>["button"]>()
      return h.button.onClick(message).children("Save")
    }
    Component.define({
      name: "SaveButton",
      props: Schema.Struct({ id: Schema.String }),
      model: Schema.Number,
      message: Schema.Literal("Save")
    }).view((_, h) => {
      expect(button<"Save">).type.not.toBeCallableWith(h, "Delete")
      return button(h, "Save")
    })
  })

  it("declares Html as the registered vocabulary", () => {
    expect<View.Registered>().type.toBe<Html.Elements>()
  })

  it("gives a component without `elements` the HTML tags", () => {
    const label = (h: Component.H, text: string) => {
      expect(h.span).type.toBe<Html.Tags<never>["span"]>()
      return h.span(text)
    }
    Component.define({
      name: "Greeting",
      model: Schema.Struct({}),
      message: Schema.Never
    }).make({
      init: () => ({}),
      update: (model) => model,
      view: (_, h) => {
        expect(h.p).type.toBe<Html.Tags<never>["p"]>()
        return h.p(label(h, "Hello"))
      }
    })
  })
})
