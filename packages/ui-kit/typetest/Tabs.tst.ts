import { Component, Mount, UiSchema, View } from "@effect/ui"
import {
  type DirectionProvider,
  makeTabs,
  Tabs,
  type TabsActivationDirection,
  type TabsEvents
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make(
  "NeedsClock",
  { args: {} },
  () => Clock.use(() => Effect.succeed(Component.noop))
)

const Msg = UiSchema.TaggedEnum({ Selected: { value: Schema.String } })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Div<R> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">
type Section<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"section">,
  HTMLElement,
  "section"
>
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
type Span<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"span">,
  HTMLSpanElement,
  "span"
>

const h = View.makeHelper<Msg, {}, Html.Elements>({}, Html)
const tabs = [{ value: "a" }, { value: "b", disabled: true, keepMounted: true }]

describe("Tabs", () => {
  it("needs no provider: its read of a DirectionProvider is optional", () => {
    expect<Component.Headless.Requirements<typeof Tabs>>().type.toBe<never>()
    expect<Component.Headless.Requirements<typeof DirectionProvider>>().type
      .toBe<never>()
  })

  it("each part returns the builder it was given, and a panel or the indicator may be undefined", () => {
    const child = Tabs(h, {
      props: { value: "a", tabs },
      onEmit: {
        Selected: (event) => {
          expect(event).type.toBe<
            Extract<TabsEvents, { readonly _tag: "Selected" }>
          >()
          expect(event.activationDirection).type.toBe<TabsActivationDirection>()
          return Msg.Selected({ value: event.value })
        }
      },
      view: (tabs) => {
        expect(tabs.root(h.div.children(needsClock))).type.toBe<Div<Clock>>()
        expect(tabs.list(h.div)).type.toBe<Div<never>>()
        expect(tabs.tab({ element: h.button, value: "a" })).type.toBe<
          Button<never>
        >()
        expect(tabs.tab({ element: h.a.onMount(NeedsClock()), value: "b" }))
          .type.toBe<Anchor<Clock>>()
        expect(tabs.panel({ element: h.section, value: "a" })).type.toBe<
          Section<never> | undefined
        >()
        expect(tabs.indicator(h.span)).type.toBe<Span<never> | undefined>()
        expect(tabs.value).type.toBe<string | null>()
        expect(tabs.orientation).type.toBe<"horizontal" | "vertical">()
        expect(tabs.activationDirection).type.toBe<TabsActivationDirection>()
        return tabs.root(h.div).children(
          tabs.list(h.div).children(
            tabs.tab({ element: h.button.onMount(NeedsClock()), value: "a" })
          )
        )
      }
    })
    expect<View.Requirements<typeof child>>().type.toBe<Clock>()
  })

  it("requires a value and the tabs, and a tab is a button or a link", () => {
    expect(Tabs).type.not.toBeCallableWith(h, {
      props: { tabs },
      view: () => h.div
    })
    expect(Tabs).type.not.toBeCallableWith(h, {
      props: { value: "a" },
      view: () => h.div
    })
    expect(Tabs).type.not.toBeCallableWith(h, {
      props: { value: "a", tabs, orientation: "diagonal" },
      view: () => h.div
    })
    Tabs(h, {
      props: { value: null, tabs },
      view: (tabs) => {
        expect(tabs.tab).type.not.toBeCallableWith({
          element: h.div,
          value: "a"
        })
        expect(tabs.tab).type.not.toBeCallableWith({ element: h.button })
        expect(tabs.tab).type.not.toBeCallableWith(h.button)
        expect(tabs.panel).type.not.toBeCallableWith(h.div)
        return tabs.root(h.div)
      }
    })
  })

  it("makeTabs types the tabs and Selected with its schema", () => {
    const Section = Schema.Literals(["general", "billing"])
    const SectionMsg = UiSchema.TaggedEnum({ Opened: { section: Section } })
    const h = View.makeHelper<typeof SectionMsg.Type, {}, Html.Elements>(
      {},
      Html
    )
    const SectionTabs = makeTabs({ value: Section })
    const tabs = Section.literals.map((value) => ({ value }))
    SectionTabs(h, {
      props: { value: "general", tabs },
      onEmit: {
        Selected: ({ value }) => SectionMsg.Opened({ section: value })
      },
      view: (tabs) => tabs.root(h.div)
    })
    expect(SectionTabs).type.not.toBeCallableWith(h, {
      props: { value: null, tabs: [{ value: "other" }] },
      view: () => h.div
    })
  })
})
