import { Component, UiSchema } from "@effect/ui"
import { type ToastItem, ToastProvider } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

type Button = Html.Element<
  Msg,
  never,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>
type Div = Html.Element<Msg, never, Html.EventsOf<"div">, HTMLDivElement, "div">
type Strong = Html.Element<
  Msg,
  never,
  Html.EventsOf<"strong">,
  HTMLElement,
  "strong"
>

declare const toast: ToastItem

describe("ToastProvider", () => {
  it("needs nothing provided", () => {
    expect<Component.Headless.Requirements<typeof ToastProvider>>().type.toBe<
      never
    >()
  })

  it("each part returns the builder it was given, with the consumer's message type", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        ToastProvider(h, {
          view: (toastProvider) => {
            expect(toastProvider.toasts).type.toBe<ReadonlyArray<ToastItem>>()
            expect(toastProvider.viewport(h.div.onClick(Msg.Clicked()))).type
              .toBe<Div>()
            expect(toastProvider.root({ element: h.div, toast })).type.toBe<
              Div
            >()
            expect(toastProvider.content({ element: h.div, toast })).type.toBe<
              Div
            >()
            expect(toastProvider.title({ element: h.strong, toast })).type.toBe<
              Strong
            >()
            expect(toastProvider.description({ element: h.strong, toast })).type
              .toBe<Strong>()
            expect(toastProvider.action({ element: h.button, toast })).type
              .toBe<Button>()
            expect(toastProvider.close({ element: h.button, toast })).type.toBe<
              Button
            >()
            return toastProvider.viewport(h.div)
          }
        })
    })
  })

  it("the buttons take only a button, and the containers only a div", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        ToastProvider(h, {
          view: (toastProvider) => {
            expect(toastProvider.viewport).type.not.toBeCallableWith(h.section)
            expect(toastProvider.root).type.not.toBeCallableWith({
              element: h.li,
              toast
            })
            expect(toastProvider.content).type.not.toBeCallableWith({
              element: h.span,
              toast
            })
            expect(toastProvider.action).type.not.toBeCallableWith({
              element: h.a,
              toast
            })
            expect(toastProvider.close).type.not.toBeCallableWith({
              element: h.a,
              toast
            })
            return toastProvider.viewport(h.div)
          }
        })
    })
  })

  it("a sender posts only the add, update and close messages", () => {
    Component.define({
      name: "Sender",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => {
        expect($.send).type.toBeCallableWith(ToastProvider, {
          _tag: "RequestedAdd",
          toast: { id: "a", title: "A" }
        })
        expect($.send).type.toBeCallableWith(ToastProvider, {
          _tag: "RequestedUpdate",
          id: "a",
          type: "success"
        })
        expect($.send).type.toBeCallableWith(ToastProvider, {
          _tag: "RequestedClose",
          id: "a"
        })
        expect($.send).type.not.toBeCallableWith(ToastProvider, {
          _tag: "ClickedClose",
          id: "a"
        })
        expect($.send).type.not.toBeCallableWith(ToastProvider, {
          _tag: "RequestedAdd",
          toast: { title: "A" }
        })
        return $.model
      },
      view: (h) => h.div
    })
  })
})
