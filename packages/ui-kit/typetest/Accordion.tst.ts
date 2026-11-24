import { type Component, UiSchema, type View } from "@effect/ui"
import { Accordion, AccordionItem } from "@effect/ui-kit"
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
type H2 = Html.Element<
  Msg,
  never,
  Html.EventsOf<"h2">,
  HTMLHeadingElement,
  "h2"
>

declare const h: View.Helper<Msg, unknown> & View.Tags<Html.Elements, Msg>

describe("Accordion", () => {
  it("the accordion needs nothing, and an item needs an accordion above it", () => {
    expect<Component.Headless.Requirements<typeof Accordion>>().type.toBe<
      never
    >()
    expect<Component.Headless.Requirements<typeof AccordionItem>>().type.toBe<
      Component.Shared.Of<typeof Accordion>
    >()
  })

  it("each part returns the builder it was given, and the panel may draw nothing", () => {
    Accordion(h, {
      props: { value: [] },
      view: (accordion) => {
        expect(accordion.root(h.div)).type.toBe<Div>()
        expect(accordion.value).type.toBe<ReadonlyArray<string>>()
        expect(accordion.orientation).type.toBe<"vertical" | "horizontal">()
        expect(accordion.root).type.not.toBeCallableWith(h.span)
        return accordion.root(h.div).children(
          AccordionItem(h, {
            key: "a",
            props: { value: "a" },
            view: (item) => {
              const trigger = item.trigger(h.button.onClick(Msg.Clicked()))
              expect(trigger).type.toBe<Button>()
              expect(item.root(h.div)).type.toBe<Div>()
              expect(item.header(h.h2)).type.toBe<H2>()
              expect(item.panel(h.div)).type.toBe<Div | undefined>()
              expect(item.open).type.toBe<boolean>()
              expect(item.index).type.toBe<number | undefined>()
              expect(item.transitionStatus).type.toBe<
                "starting" | "ending" | null
              >()

              expect(item.root).type.not.toBeCallableWith(h.span)
              expect(item.header).type.not.toBeCallableWith(h.div)
              expect(item.trigger).type.not.toBeCallableWith(h.div)
              expect(item.panel).type.not.toBeCallableWith(h.section)
              return item.root(h.div).children(
                item.header(h.h3).children(trigger),
                item.panel(h.div)
              )
            }
          })
        )
      }
    })
  })

  it("value is required, and the events carry their payloads", () => {
    const view = () => h.div
    expect(Accordion).type.not.toBeCallableWith(h, { props: {}, view })
    expect(AccordionItem).type.not.toBeCallableWith(h, { props: {}, view })
    expect(Accordion).type.not.toBeCallableWith(h, {
      props: { value: [], orientation: "diagonal" },
      view
    })
    Accordion(h, {
      props: {
        value: ["a"],
        multiple: true,
        disabled: false,
        keepMounted: true,
        hiddenUntilFound: true,
        orientation: "horizontal"
      },
      onEmit: {
        Toggled: ({ value, reason }) => {
          expect(value).type.toBe<ReadonlyArray<string>>()
          expect(reason).type.toBe<"trigger-press" | "find-in-page">()
          return Msg.Clicked()
        }
      },
      view
    })
    AccordionItem(h, {
      props: {
        value: "a",
        index: 0,
        disabled: true,
        keepMounted: true,
        hiddenUntilFound: false,
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
