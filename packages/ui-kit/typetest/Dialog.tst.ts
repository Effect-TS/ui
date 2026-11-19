import { type Component, UiSchema, type View } from "@effect/ui"
import { Dialog, DialogTrigger, type DialogTriggerPress } from "@effect/ui-kit"
import type { Html } from "@effect/ui/html"
import { describe, expect, it } from "tstyche"

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

type Button = Html.Element<Msg, never, Html.EventsOf<"button">, HTMLButtonElement, "button">
type DialogElement = Html.Element<Msg, never, Html.EventsOf<"dialog">, HTMLDialogElement, "dialog">
type Div = Html.Element<Msg, never, Html.EventsOf<"div">, HTMLDivElement, "div">
type H2 = Html.Element<Msg, never, Html.EventsOf<"h2">, HTMLHeadingElement, "h2">
type P = Html.Element<Msg, never, Html.EventsOf<"p">, HTMLParagraphElement, "p">
type Input = Html.VoidElement<Msg, never, Html.EventsOf<"input">, HTMLInputElement, "input">

declare const h: View.Helper<Msg, unknown> & View.Tags<Html.Elements, Msg>

describe("Dialog", () => {
  it("needs nothing: its read of a dialog above it is optional", () => {
    expect<Component.Headless.Requirements<typeof Dialog>>().type.toBe<never>()
  })

  it("each part returns the builder it was given, and the portal and backdrop may draw nothing", () => {
    Dialog(h, {
      props: { open: false },
      view: (s) => {
        const trigger = s.trigger(h.button.class("open").onClick(Msg.Clicked()))
        expect(trigger).type.toBe<Button>()
        expect(s.portal(h.dialog)).type.toBe<DialogElement | undefined>()
        expect(s.backdrop(h.div)).type.toBe<Div | undefined>()
        expect(s.viewport(h.div)).type.toBe<Div>()
        expect(s.popup(h.div)).type.toBe<Div>()
        expect(s.title(h.h2)).type.toBe<H2>()
        expect(s.description(h.p)).type.toBe<P>()
        expect(s.close(h.button)).type.toBe<Button>()
        expect(s.initialFocus(h.input)).type.toBe<Input>()
        expect(s.finalFocus(h.button)).type.toBe<Button>()
        expect(s.transitionStatus).type.toBe<"starting" | "ending" | null>()
        expect(s.openMethod).type.toBe<"mouse" | "touch" | "pen" | "keyboard" | null>()

        expect(s.trigger).type.not.toBeCallableWith(h.div)
        expect(s.portal).type.not.toBeCallableWith(h.div)
        expect(s.backdrop).type.not.toBeCallableWith(h.span)
        expect(s.viewport).type.not.toBeCallableWith(h.span)
        expect(s.popup).type.not.toBeCallableWith(h.span)
        expect(s.title).type.not.toBeCallableWith(h.p)
        expect(s.description).type.not.toBeCallableWith(h.div)
        expect(s.close).type.not.toBeCallableWith(h.a)
        return h.div(trigger.children("Open"), s.portal(h.dialog)?.children(s.popup(h.div)))
      }
    })
  })

  it("open is required, and the events carry their payloads", () => {
    const view = () => h.button
    expect(Dialog).type.not.toBeCallableWith(h, { props: {}, view })
    expect(Dialog).type.not.toBeCallableWith(h, { props: { open: true, openMethod: "stylus" }, view })
    Dialog(h, {
      props: { open: true, modal: "trap-focus", id: "settings", openMethod: "touch", holdExit: false },
      onEmit: {
        Opened: ({ triggerId }) => {
          expect(triggerId).type.toBe<string | null>()
          return Msg.Clicked()
        },
        Dismissed: ({ reason }) => {
          expect(reason).type.toBe<"trigger-press" | "outside-press" | "escape-key" | "close-press" | "focus-out">()
          return undefined
        },
        Settled: () => undefined
      },
      view
    })
  })
})

describe("DialogTrigger", () => {
  it("returns the button it was given, and its press has the caller's message type", () => {
    expect(DialogTrigger(h, { props: { open: false }, onPress: Msg.Clicked() })).type.toBe<Button>()
    expect(DialogTrigger).type.not.toBeCallableWith(h, { props: { open: false }, onPress: "other" })
    expect(DialogTrigger).type.not.toBeCallableWith(h, { element: h.div, props: { open: false } })
    DialogTrigger(h, { props: { open: false } })
  })

  it("accepts a press callback and a string popupId", () => {
    DialogTrigger(h, {
      props: { open: true, popupId: "settings" },
      onPress: (press) => {
        expect(press).type.toBe<DialogTriggerPress>()
        expect(press.method).type.toBe<"mouse" | "touch" | "pen" | "keyboard">()
        expect(press.triggerId).type.toBe<string | null>()
        return Msg.Clicked()
      }
    })
    expect(DialogTrigger).type.not.toBeCallableWith(h, { props: { open: false }, onPress: () => "other" })
    expect(DialogTrigger).type.not.toBeCallableWith(h, { props: { open: false, popupId: 1 } })
  })
})
