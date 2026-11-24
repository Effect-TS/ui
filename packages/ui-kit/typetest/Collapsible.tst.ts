import { type Component, UiSchema, type View } from "@effect/ui"
import { Collapsible } from "@effect/ui-kit"
import type { Html } from "@effect/ui/html"
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

declare const h: View.Helper<Msg, unknown> & View.Tags<Html.Elements, Msg>

describe("Collapsible", () => {
  it("needs nothing", () => {
    expect<Component.Headless.Requirements<typeof Collapsible>>().type.toBe<
      never
    >()
  })

  it("each part returns the builder it was given, and the panel may draw nothing", () => {
    Collapsible(h, {
      props: { open: false },
      view: (collapsible) => {
        const trigger = collapsible.trigger(
          h.button.class(["trigger"]).onClick(Msg.Clicked())
        )
        expect(trigger).type.toBe<Button>()
        expect(collapsible.root(h.div)).type.toBe<Div>()
        expect(collapsible.panel(h.div)).type.toBe<Div | undefined>()
        expect(collapsible.open).type.toBe<boolean>()
        expect(collapsible.mounted).type.toBe<boolean>()
        expect(collapsible.transitionStatus).type.toBe<
          "starting" | "ending" | null
        >()

        expect(collapsible.root).type.not.toBeCallableWith(h.span)
        expect(collapsible.trigger).type.not.toBeCallableWith(h.div)
        expect(collapsible.panel).type.not.toBeCallableWith(h.section)
        return collapsible.root(h.div).children([
          trigger,
          collapsible.panel(h.div)?.children(["Content"])
        ])
      }
    })
  })

  it("open is required, and the events carry their payloads", () => {
    const view = () => h.div
    expect(Collapsible).type.not.toBeCallableWith(h, { props: {}, view })
    expect(Collapsible).type.not.toBeCallableWith(h, {
      props: { open: true, keepMounted: "yes" },
      view
    })
    Collapsible(h, {
      props: {
        open: true,
        disabled: false,
        keepMounted: true,
        hiddenUntilFound: true,
        holdExit: false
      },
      onEmit: {
        Toggled: ({ open, reason }) => {
          expect(open).type.toBe<boolean>()
          expect(reason).type.toBe<"trigger-press" | "find-in-page">()
          return Msg.Clicked()
        },
        Settled: ({ open }) => {
          expect(open).type.toBe<boolean>()
          return undefined
        }
      },
      view
    })
  })
})
