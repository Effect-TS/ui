import { Component, Mount, UiSchema, type View } from "@effect/ui"
import { Popover, type PopoverDismissReason, type PopoverInstant, type PopoverOpenReason } from "@effect/ui-kit"
import type { Html } from "@effect/ui/html"
import { Context, Effect } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make("NeedsClock", { args: {} }, () => Clock.use(() => Effect.succeed(Component.noop)))

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

type Button<R = never> = Html.Element<Msg, R, Html.EventsOf<"button">, HTMLButtonElement, "button">
type DialogElement<R = never> = Html.Element<Msg, R, Html.EventsOf<"dialog">, HTMLDialogElement, "dialog">
type Div<R = never> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">

declare const h: View.Helper<Msg, unknown> & View.Tags<Html.Elements, Msg>

describe("Popover", () => {
  it("each part returns the builder it was given, and the portal and backdrop may be absent", () => {
    expect<Component.Headless.Requirements<typeof Popover>>().type.toBe<never>()
    const child = Popover(h, {
      key: "p",
      props: { open: false },
      view: (popover) => {
        const trigger = popover.trigger({ element: h.button.onClick(Msg.Clicked()), openOnHover: true, delay: 100 })
        expect(trigger).type.toBe<Button>()
        expect(popover.portal(h.dialog)).type.toBe<DialogElement | undefined>()
        const portal = popover.portal(h.dialog.onMount(NeedsClock()))
        expect(portal).type.toBe<DialogElement<Clock> | undefined>()
        expect(popover.backdrop(h.div)).type.toBe<Div | undefined>()
        expect(popover.backdrop(h.div.onMount(NeedsClock()))).type.toBe<Div<Clock> | undefined>()
        expect(popover.positioner(h.div)).type.toBe<Div>()
        expect(popover.popup(h.div)).type.toBe<Div>()
        expect(popover.popup(h.div.onMount(NeedsClock()))).type.toBe<Div<Clock>>()
        expect(popover.viewport(h.div)).type.toBe<Div>()
        expect(popover.arrow(h.div)).type.toBe<Div>()
        expect(popover.triggerId).type.toBe<string | null>()
        expect(popover.openReason).type.toBe<PopoverOpenReason | null>()
        expect(popover.instant).type.toBe<PopoverInstant | undefined>()
        return h.span(
          trigger.children("Open"),
          portal?.children(
            popover.positioner(h.div).children(popover.popup(h.div).children(popover.title(h.h2).children("Title")))
          )
        )
      }
    })
    expect<View.Requirements<typeof child>>().type.toBe<Clock>()
  })

  it("the trigger takes only a button, and reports why the popover opened and closed", () => {
    Popover(h, {
      key: "p",
      props: { open: false },
      onEmit: {
        RequestedOpen: ({ reason, triggerId }) => {
          expect(reason).type.toBe<PopoverOpenReason>()
          expect(triggerId).type.toBe<string | null>()
          return Msg.Clicked()
        },
        RequestedClose: ({ reason }) => {
          expect(reason).type.toBe<PopoverDismissReason>()
          return Msg.Clicked()
        },
        Settled: () => Msg.Clicked()
      },
      view: (popover) => {
        expect(popover.trigger).type.not.toBeCallableWith({ element: h.a })
        expect(popover.portal).type.not.toBeCallableWith(h.div)
        expect(popover.backdrop).type.not.toBeCallableWith(h.span)
        expect(popover.positioner).type.not.toBeCallableWith(h.span)
        expect(popover.popup).type.not.toBeCallableWith(h.span)
        expect(popover.arrow).type.not.toBeCallableWith(h.span)
        expect(popover.viewport).type.not.toBeCallableWith(h.span)
        expect(popover).type.not.toHaveProperty("nestedDialogs")
        return popover.trigger({ element: h.button })
      }
    })
  })
})
