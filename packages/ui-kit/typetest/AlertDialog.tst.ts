import { UiSchema, type View } from "@effect/ui"
import { AlertDialog } from "@effect/ui-kit"
import type { Html } from "@effect/ui/html"
import { describe, expect, it } from "tstyche"

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

type Button = Html.Element<Msg, never, Html.EventsOf<"button">, HTMLButtonElement, "button">
type DialogElement = Html.Element<Msg, never, Html.EventsOf<"dialog">, HTMLDialogElement, "dialog">

declare const h: View.Helper<Msg, unknown> & View.Tags<Html.Elements, Msg>

describe("AlertDialog", () => {
  it("returns a child with the caller's message type that needs nothing", () => {
    expect(AlertDialog(h, { props: { open: false }, view: () => h.div })).type.toBe<View.Child<Msg, never>>()
  })

  it("takes a dialog's parts, and the portal returns the dialog it was given or nothing", () => {
    AlertDialog(h, {
      props: { open: true },
      view: (s) => {
        expect(s.portal(h.dialog)).type.toBe<DialogElement | undefined>()
        expect(s.close(h.button)).type.toBe<Button>()
        expect(s.portal).type.not.toBeCallableWith(h.div)
        return h.div(s.portal(h.dialog)?.children(s.popup(h.div)))
      }
    })
  })

  it("open is required, modal and pointer dismissal are fixed, and Dismissed carries its reason", () => {
    const view = () => h.div
    expect(AlertDialog).type.not.toBeCallableWith(h, { props: {}, view })
    expect(AlertDialog).type.not.toBeCallableWith(h, { props: { open: true, modal: false }, view })
    expect(AlertDialog).type.not.toBeCallableWith(h, { props: { open: true, disablePointerDismissal: false }, view })
    AlertDialog(h, {
      key: "discard",
      props: { open: true, id: "discard", openMethod: "touch", holdExit: false },
      onEmit: {
        Opened: () => Msg.Clicked(),
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
