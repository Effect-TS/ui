import { Component, Mount, UiSchema, View } from "@effect/ui"
import { VirtualList, type VirtualListScrollTo } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make("NeedsClock", { args: {} }, () => Clock.use(() => Effect.succeed(Component.noop)))

const Msg = UiSchema.TaggedEnum({ Clicked: {}, Scrolled: { first: Schema.Number, last: Schema.Number } })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Div<R> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">
type Ul<R> = Html.Element<Msg, R, Html.EventsOf<"ul">, HTMLUListElement, "ul">
type Li<R> = Html.Element<Msg, R, Html.EventsOf<"li">, HTMLLIElement, "li">

const h = View.makeHelper<Msg, {}, Html.Elements>({}, Html)

describe("VirtualList", () => {
  it("preserves builders, state values, and item requirements", () => {
    expect<Component.Headless.Requirements<typeof VirtualList>>().type.toBe<never>()
    const child = VirtualList(h, {
      props: { count: 100, itemSize: 32, keys: [], followEnd: { threshold: 8 }, contentAlignment: "end" },
      onEmit: { Scrolled: ({ first, last }) => Msg.Scrolled({ first, last }) },
      view: (virtualList) => {
        expect(virtualList.items).type.toBe<Array<number>>()
        expect(virtualList.count).type.toBe<number>()
        expect(virtualList.atEnd).type.toBe<boolean>()

        expect(virtualList.viewport(h.div).children(needsClock)).type.toBe<Div<Clock>>()
        expect(virtualList.list(h.ul)).type.toBe<Ul<never>>()
        expect(virtualList.item({ element: h.li.onClick(Msg.Clicked()), index: 0 })).type.toBe<Li<never>>()

        const item = virtualList.item({ element: h.div.onMount(NeedsClock()), index: 0 })
        expect(item).type.toBe<Div<Clock>>()

        return virtualList.viewport(h.div).children(virtualList.list(h.div).children(item))
      }
    })
    expect<View.Requirements<typeof child>>().type.toBe<Clock>()
  })

  it("takes every scroll target", () => {
    expect<VirtualListScrollTo>().type.toBeAssignableFrom({ target: { _tag: "Index" as const, index: 3 } })
    expect<VirtualListScrollTo>().type.toBeAssignableFrom({
      target: { _tag: "Key" as const, key: "a" },
      align: "nearest" as const,
      id: 2
    })
    expect<VirtualListScrollTo>().type.toBeAssignableFrom({ target: { _tag: "Offset" as const, offset: 40 } })
    expect<VirtualListScrollTo>().type.toBeAssignableFrom({ target: { _tag: "End" as const } })
    expect<VirtualListScrollTo>().type.not.toBeAssignableFrom({ target: { _tag: "Top" as const } })
  })

  it("rejects wrong tags and invalid props", () => {
    expect(VirtualList).type.not.toBeCallableWith(h, { props: { count: 1 }, view: () => h.div })
    expect(VirtualList).type.not.toBeCallableWith(h, {
      props: { count: 1, itemSize: 20, contentAlignment: "middle" },
      view: () => h.div
    })
    VirtualList(h, {
      props: { count: 1, itemSize: 20 },
      view: (virtualList) => {
        expect(virtualList.viewport).type.not.toBeCallableWith(h.span)
        expect(virtualList.list).type.not.toBeCallableWith(h.span)
        expect(virtualList.item).type.not.toBeCallableWith({ element: h.span, index: 0 })
        expect(virtualList.item).type.not.toBeCallableWith({ element: h.li })
        return virtualList.list(h.div)
      }
    })
  })
})
