import { type Component, UiSchema } from "@effect/ui"
import { Tooltip, type TooltipProvider } from "@effect/ui-kit"
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
type Anchor = Html.Element<
  Msg,
  never,
  Html.EventsOf<"a">,
  HTMLAnchorElement,
  "a"
>

describe("Tooltip", () => {
  it("needs no provider: its read of a TooltipProvider is optional", () => {
    expect<Component.Headless.Requirements<typeof Tooltip>>().type.toBe<never>()
    expect<Component.Headless.Requirements<typeof TooltipProvider>>().type.toBe<
      never
    >()
  })

  it("each part returns the builder it was given, with the consumer's message type", () => {
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Tooltip(h, {
          key: "t",
          props: { open: false },
          view: (tooltip) => {
            const trigger = tooltip.trigger(
              h.button.class("tool").on("click", Msg.Clicked())
            )
            expect(trigger).type.toBe<Button>()
            expect(tooltip.positioner(h.div)).type.toBe<Div>()
            expect(tooltip.popup(h.div)).type.toBe<Div>()
            expect(tooltip.arrow(h.div)).type.toBe<Div>()
            return h.span(
              trigger.children("B"),
              tooltip.positioner(h.div).children(
                tooltip.popup(h.div).children("Bold")
              )
            )
          }
        })
    })
  })

  it("the trigger takes a button or a link, and the other parts only a div", () => {
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Tooltip(h, {
          key: "t",
          props: { open: false },
          view: (tooltip) => {
            expect(tooltip.trigger(h.a)).type.toBe<Anchor>()
            expect(tooltip.trigger).type.not.toBeCallableWith(h.span)
            expect(tooltip.positioner).type.not.toBeCallableWith(h.span)
            expect(tooltip.popup).type.not.toBeCallableWith(h.span)
            expect(tooltip.arrow).type.not.toBeCallableWith(h.span)
            return tooltip.trigger(h.button)
          }
        })
    })
  })
})
