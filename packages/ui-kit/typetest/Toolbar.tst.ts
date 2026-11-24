import { Component, UiSchema, type View } from "@effect/ui"
import { Toolbar } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Button<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>
type Anchor<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"a">,
  HTMLAnchorElement,
  "a"
>
type Input<R> = Html.VoidElement<
  Msg,
  R,
  Html.EventsOf<"input">,
  HTMLInputElement,
  "input"
>
type Div<R> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">

const props = {
  items: [{ value: "bold", group: "format" }, { value: "help" }, {
    value: "search"
  }],
  groups: [{ value: "format" }]
}

describe("Toolbar", () => {
  it("each part returns the builder it was given, with the consumer's message type and the children's requirements", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Toolbar(h, {
          props,
          view: (toolbar) => {
            expect(toolbar.button({ element: h.button, value: "bold" })).type
              .toBe<Button<never>>()
            expect(
              toolbar.button({
                element: h.button.onClick(Msg.Clicked()),
                value: "bold"
              }).children([needsClock])
            )
              .type.toBe<Button<Clock>>()
            expect(toolbar.link({ element: h.a, value: "help" })).type.toBe<
              Anchor<never>
            >()
            expect(toolbar.input({ element: h.input, value: "search" })).type
              .toBe<Input<never>>()
            expect(toolbar.separator(h.div)).type.toBe<Div<never>>()
            expect(toolbar.isDisabled("bold")).type.toBe<boolean>()
            expect(toolbar.orientation).type.toBe<"horizontal" | "vertical">()
            const root = toolbar.root(h.div.class(["toolbar"])).children([
              toolbar.group({ element: h.div, value: "format" }).children([
                toolbar.button({ element: h.button, value: "bold" }),
                needsClock
              ])
            ])
            expect(root).type.toBe<Div<Clock>>()
            return root
          }
        })
    })
  })

  it("each part takes only its element, and the item parts a value", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => {
        expect(Toolbar).type.not.toBeCallableWith(h, {
          props: { groups: [] },
          view: (toolbar: Component.Headless.Parts<typeof Toolbar>) =>
            toolbar.root(h.div)
        })
        return Toolbar(h, {
          props,
          view: (toolbar) => {
            expect(toolbar.root).type.not.toBeCallableWith(h.span)
            expect(toolbar.separator).type.not.toBeCallableWith(h.hr)
            expect(toolbar.group).type.not.toBeCallableWith(h.div)
            expect(toolbar.button).type.not.toBeCallableWith({
              element: h.div,
              value: "bold"
            })
            expect(toolbar.button).type.not.toBeCallableWith({
              element: h.button
            })
            expect(toolbar.button).type.not.toBeCallableWith(h.button, "bold")
            expect(toolbar.link).type.not.toBeCallableWith({
              element: h.button,
              value: "help"
            })
            expect(toolbar.input).type.not.toBeCallableWith({
              element: h.textarea,
              value: "search"
            })
            return toolbar.root(h.div)
          }
        })
      }
    })
  })
})
