import { Component, Mount, UiSchema, type View } from "@effect/ui"
import { AlertDialog } from "@effect/ui-kit"
import type { Html } from "@effect/ui/html"
import { Context, Effect } from "effect"
import { expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make(
  "NeedsClock",
  { args: {} },
  () => Clock.use(() => Effect.succeed(Component.noop))
)

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

type DialogElement<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"dialog">,
  HTMLDialogElement,
  "dialog"
>

declare const h: View.Helper<Msg, unknown> & View.Tags<Html.Elements, Msg>

it("does not let the caller disable modality or enable outside dismissal", () => {
  const view = () => h.div
  expect(AlertDialog).type.toBeCallableWith(h, { props: { open: true }, view })
  expect(AlertDialog).type.not.toBeCallableWith(h, { props: {}, view })
  expect(AlertDialog).type.not.toBeCallableWith(h, {
    props: { open: true, modal: false },
    view
  })
  expect(AlertDialog).type.not.toBeCallableWith(h, {
    props: { open: true, disablePointerDismissal: false },
    view
  })
})

it("wraps portal as an optional dialog builder and preserves its requirements", () => {
  const child = AlertDialog(h, {
    props: { open: true },
    view: (alertDialog) => {
      const portal = alertDialog.portal(h.dialog.onMount(NeedsClock()))
      expect(portal).type.toBe<DialogElement<Clock> | undefined>()
      expect(alertDialog.portal).type.not.toBeCallableWith(h.div)
      return h.div([portal])
    }
  })
  expect<View.Requirements<typeof child>>().type.toBe<Clock>()
})
