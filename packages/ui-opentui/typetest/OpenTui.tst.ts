import type { Component, View } from "@effect/ui"
import { OpenTui } from "@effect/ui-opentui"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

describe("OpenTui vocabulary types", () => {
  it("gives h.text the OpenTui TextElement type and enforces no-text containers", () => {
    const Child = OpenTui.component({
      name: "Child",
      model: Schema.Void,
      message: Schema.Never
    }).make({
      init: () => undefined,
      update: () => undefined,
      view: (h) => h.text("child")
    })

    const Kept = OpenTui.component({
      name: "Kept",
      model: Schema.Void,
      message: Schema.Never
    }).make({
      init: () => undefined,
      update: () => undefined,
      view: (h) => h.text("kept")
    })

    const InputRef = OpenTui.ref("Input", "input")

    OpenTui.component({
      name: "Parent",
      model: Schema.Void,
      message: Schema.Never
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

  it("OpenTui.component supplies the OpenTUI vocabulary and OpenTui.H types reusable pure views", () => {
    const Badge = <M>(h: OpenTui.H<M>, label: string) =>
      h.text(label).style({ fg: "#00ff00" })
    const Panel = OpenTui.component({
      name: "Panel",
      model: Schema.String,
      message: Schema.Literal("Pressed")
    }).make({
      init: () => "ready",
      update: ($) => $.model,
      view: (h, label) => h.box.children(Badge(h, label))
    })
    expect(Panel).type.toBe<
      Component.Component<
        "Panel",
        {},
        string,
        "Pressed",
        never,
        never,
        OpenTui.Elements
      >
    >()
  })

  it("types tabSelect, slider, code, diff, markdown, asciiFont, and lineNumber tags", () => {
    const TabsRef = OpenTui.ref("Tabs", "tabSelect")
    const SliderRef = OpenTui.ref("Slider", "slider")
    const CodeRef = OpenTui.ref("Code", "code")
    const LineNumRef = OpenTui.ref("LineNum", "lineNumber")

    OpenTui.component({
      name: "NewTags",
      model: Schema.Void,
      message: Schema.Literals(["Changed", "Picked"])
    }).make({
      init: () => undefined,
      update: () => undefined,
      view: (h) => {
        const tabs = h.tabSelect.ref(TabsRef).options([
          { name: "One", description: "first" }
        ]).selectedIndex(0).on("selectionChanged", ({ index }) => {
          expect(index).type.toBe<number>()
          return "Changed" as const
        }).on("itemSelected", ({ index }) => {
          expect(index).type.toBe<number>()
          return "Picked" as const
        })

        const slider = h.slider.ref(SliderRef).style({
          orientation: "vertical",
          min: 0,
          max: 100
        }).value(50).on("change", ({ value }) => {
          expect(value).type.toBe<number>()
          return "Changed" as const
        })

        expect(h.slider.value).type.not.toBeCallableWith("50")
        expect(h.input.value).type.not.toBeCallableWith(50)
        h.input.on("change", ({ value }) => {
          expect(value).type.toBe<string>()
          return "Changed" as const
        })

        const code = h.code.ref(CodeRef).style({
          content: "const x = 1",
          filetype: "typescript"
        })
        const numbered = h.lineNumber.ref(LineNumRef).style({
          showLineNumbers: true
        }).children(code)
        expect(h.lineNumber).type.not.toBeCallableWith("stray")

        const diff = h.diff.style({ diff: "", view: "split" })
        const md = h.markdown.style({ content: "# Hello" })
        const font = h.asciiFont.style({ text: "HI", font: "tiny" })

        return h.box.children(tabs, slider, numbered, diff, md, font)
      }
    })
  })
})
