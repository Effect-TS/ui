import { Component, UiSchema } from "@effect/ui"
import { Popover, type PopoverDismissReason, type PopoverInstant, type PopoverOpenReason } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

type Button = Html.Element<Msg, never, Html.EventsOf<"button">, HTMLButtonElement, "button">
type Div = Html.Element<Msg, never, Html.EventsOf<"div">, HTMLDivElement, "div">

describe("Popover", () => {
  it("each part returns the builder it was given, and the portal and backdrop may be absent", () => {
    Component.define({ name: "App", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Popover(h, {
          key: "p",
          props: { open: false },
          view: (popover) => {
            const trigger = popover.trigger({ element: h.button.onClick(Msg.Clicked()), openOnHover: true, delay: 100 })
            expect(trigger).type.toBe<Button>()
            expect(popover.backdrop(h.div)).type.toBe<Div | undefined>()
            expect(popover.positioner(h.div)).type.toBe<Div>()
            expect(popover.popup(h.div)).type.toBe<Div>()
            expect(popover.viewport(h.div)).type.toBe<Div>()
            expect(popover.arrow(h.div)).type.toBe<Div>()
            expect(popover.triggerId).type.toBe<string | null>()
            expect(popover.openReason).type.toBe<PopoverOpenReason | null>()
            expect(popover.instant).type.toBe<PopoverInstant | undefined>()
            return h.span(
              trigger.children("Open"),
              popover.portal(h.dialog)?.children(
                popover.positioner(h.div).children(popover.popup(h.div).children(popover.title(h.h2).children("Title")))
              )
            )
          }
        })
    })
  })

  it("the trigger takes only a button, and reports why the popover opened and closed", () => {
    Component.define({ name: "App", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Popover(h, {
          key: "p",
          props: { open: false },
          onEmit: {
            Opened: ({ reason, triggerId }) => {
              expect(reason).type.toBe<PopoverOpenReason>()
              expect(triggerId).type.toBe<string | null>()
              return Msg.Clicked()
            },
            Dismissed: ({ reason }) => {
              expect(reason).type.toBe<PopoverDismissReason>()
              return Msg.Clicked()
            },
            Settled: () => Msg.Clicked()
          },
          view: (popover) => {
            expect(popover.trigger).type.not.toBeCallableWith({ element: h.a })
            expect(popover.positioner).type.not.toBeCallableWith(h.span)
            expect(popover).type.not.toHaveProperty("nestedDialogs")
            return popover.trigger({ element: h.button })
          }
        })
    })
  })
})
