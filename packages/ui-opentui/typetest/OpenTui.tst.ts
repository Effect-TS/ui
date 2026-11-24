import { Component, type View } from "@effect/ui"
import { OpenTui } from "@effect/ui-opentui"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

describe("OpenTui vocabulary types", () => {
  it("gives h.text the OpenTui TextElement type and enforces no-text containers", () => {
    const Child = Component.define({
      name: "Child",
      model: Schema.Void,
      message: Schema.Never,
      elements: OpenTui
    }).make({
      init: () => undefined,
      update: () => undefined,
      view: (h) => h.text("child")
    })

    const Kept = Component.define({
      name: "Kept",
      model: Schema.Void,
      message: Schema.Never,
      elements: OpenTui,
      keepAlive: true
    }).make({
      init: () => undefined,
      update: () => undefined,
      view: (h) => h.text("kept")
    })

    const InputRef = OpenTui.ref("Input", "input")

    Component.define({
      name: "Parent",
      model: Schema.Void,
      message: Schema.Never,
      elements: OpenTui
    }).make({
      init: () => undefined,
      update: () => undefined,
      view: (h) => {
        const textNode = h.text("hello").style({ fg: "#00ff00" })
        expect(textNode).type.toBeAssignableTo<
          View.ElementBuilder<never, never, any, any, "text">
        >()

        h.input.ref(InputRef)
        expect(h.box.ref).type.not.toBeCallableWith(InputRef)
        expect(h.box).type.not.toBeCallableWith("stray")
        expect(h.box.children).type.not.toBeCallableWith("stray")
        expect(h.scrollbox).type.not.toBeCallableWith("stray")

        return h.box.children(
          textNode,
          Child(h, {}),
          h.keepAlive((s) => {
            expect(s.text).type.toBe(h.text)
            return s.box.children(Kept(s, { key: "k" }), s.text("ok"))
          })
        )
      }
    })
  })

  it("replaces the core h.text wherever a helper takes the vocabulary", () => {
    type H = View.WithTags<never, {}, OpenTui.Elements>
    expect<H["text"]>().type.toBe<OpenTui.Tags<never>["text"]>()
    expect<H>().type.toBeAssignableTo<View.HelperBase<never, {}>>()
    expect<H>().type.not.toBeAssignableTo<View.Helper<never, {}>>()
  })
})
