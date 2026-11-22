import { Component, Mount, UiSchema, View } from "@effect/ui"
import { ScrollArea } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Effect } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make("NeedsClock", { args: {} }, () => Clock.use(() => Effect.succeed(Component.noop)))

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Div<R> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">

const h = View.makeHelper<Msg, {}, Html.Elements>({}, Html)

describe("ScrollArea", () => {
  it("preserves builders, state values, and thumb requirements", () => {
    expect<Component.Headless.Requirements<typeof ScrollArea>>().type.toBe<never>()
    const child = ScrollArea(h, {
      props: { overflowEdgeThreshold: { yStart: 8, yEnd: 8 } },
      view: (scrollArea) => {
        expect(scrollArea.scrolling).type.toBe<boolean>()
        expect(scrollArea.scrollingX).type.toBe<boolean>()
        expect(scrollArea.scrollingY).type.toBe<boolean>()
        expect(scrollArea.hovering).type.toBe<boolean>()
        expect(scrollArea.hasOverflowX).type.toBe<boolean>()
        expect(scrollArea.hasOverflowY).type.toBe<boolean>()
        expect(scrollArea.overflowXStart).type.toBe<boolean>()
        expect(scrollArea.overflowXEnd).type.toBe<boolean>()
        expect(scrollArea.overflowYStart).type.toBe<boolean>()
        expect(scrollArea.overflowYEnd).type.toBe<boolean>()
        expect(scrollArea.cornerHidden).type.toBe<boolean>()

        expect(scrollArea.root(h.div)).type.toBe<Div<never>>()
        expect(scrollArea.viewport(h.div).children(needsClock)).type.toBe<Div<Clock>>()
        expect(scrollArea.content(h.div)).type.toBe<Div<never>>()
        expect(scrollArea.corner(h.div)).type.toBe<Div<never> | undefined>()
        expect(scrollArea.scrollbar({ element: h.div, thumb: h.div })).type.toBe<Div<never> | undefined>()

        const bar = scrollArea.scrollbar({
          element: h.div.onClick(Msg.Clicked()),
          thumb: h.div.onMount(NeedsClock()),
          orientation: "horizontal",
          keepMounted: true
        })
        expect(bar).type.toBe<Div<Clock> | undefined>()

        return scrollArea.root(h.div).children(
          scrollArea.viewport(h.div).children(scrollArea.content(h.div)),
          bar,
          scrollArea.corner(h.div)
        )
      }
    })
    expect<View.Requirements<typeof child>>().type.toBe<Clock>()
  })

  it("rejects wrong tags and invalid options", () => {
    expect(ScrollArea).type.not.toBeCallableWith(h, { props: { overflowEdgeThreshold: "8px" }, view: () => h.div })
    ScrollArea(h, {
      view: (scrollArea) => {
        expect(scrollArea.root).type.not.toBeCallableWith(h.span)
        expect(scrollArea.viewport).type.not.toBeCallableWith(h.span)
        expect(scrollArea.content).type.not.toBeCallableWith(h.span)
        expect(scrollArea.corner).type.not.toBeCallableWith(h.span)
        expect(scrollArea.scrollbar).type.not.toBeCallableWith({ element: h.span, thumb: h.div })
        expect(scrollArea.scrollbar).type.not.toBeCallableWith({ element: h.div, thumb: h.span })
        expect(scrollArea.scrollbar).type.not.toBeCallableWith({ element: h.div })
        expect(scrollArea.scrollbar).type.not.toBeCallableWith({
          element: h.div,
          thumb: h.div,
          orientation: "diagonal"
        })
        return scrollArea.root(h.div)
      }
    })
  })
})
