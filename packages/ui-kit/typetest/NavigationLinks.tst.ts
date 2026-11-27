import { Component, Mount, UiSchema, View } from "@effect/ui"
import { NavigationLinks } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Effect } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make(
  "NeedsClock",
  { args: {} },
  () => Clock.use(() => Effect.succeed(Component.noop))
)

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

type Nav<R> = Html.Element<Msg, R, Html.EventsOf<"nav">, HTMLElement, "nav">
type Ul<R> = Html.Element<Msg, R, Html.EventsOf<"ul">, HTMLUListElement, "ul">
type Li<R> = Html.Element<Msg, R, Html.EventsOf<"li">, HTMLLIElement, "li">
type A<R> = Html.Element<Msg, R, Html.EventsOf<"a">, HTMLAnchorElement, "a">

const h = View.makeHelper<Msg, {}, Html.Elements>({}, Html)

describe("NavigationLinks", () => {
  it("preserves the consumer's builders, messages and requirements", () => {
    expect<Component.Headless.Requirements<typeof NavigationLinks>>().type.toBe<
      never
    >()
    const child = NavigationLinks(h, {
      props: { orientation: "vertical" },
      view: (navigationLinks) => {
        expect(navigationLinks.root(h.nav)).type.toBe<Nav<never>>()
        expect(navigationLinks.list(h.ul)).type.toBe<Ul<never>>()
        expect(navigationLinks.item(h.li)).type.toBe<Li<never>>()
        expect(navigationLinks.link({ element: h.a })).type.toBe<A<never>>()
        const link = navigationLinks.link({
          element: h.a.on("click", Msg.Clicked()).onMount(NeedsClock()),
          active: true
        })
        expect(link).type.toBe<A<Clock>>()
        return navigationLinks.root(h.nav).children(
          navigationLinks.list(h.ul).children(
            navigationLinks.item(h.li).children(link)
          )
        )
      }
    })
    expect<View.Requirements<typeof child>>().type.toBe<Clock>()
  })

  it("requires each part's native element and a known orientation", () => {
    expect(NavigationLinks).type.not.toBeCallableWith(h, {
      props: { orientation: "both" },
      view: () => h.nav
    })
    NavigationLinks(h, {
      view: (navigationLinks) => {
        expect(navigationLinks.root).type.not.toBeCallableWith(h.div)
        expect(navigationLinks.list).type.not.toBeCallableWith(h.ol)
        expect(navigationLinks.item).type.not.toBeCallableWith(h.div)
        expect(navigationLinks.link).type.not.toBeCallableWith({
          element: h.button
        })
        expect(navigationLinks.link).type.not.toBeCallableWith({ active: true })
        expect(navigationLinks.link).type.not.toBeCallableWith(h.a)
        return navigationLinks.root(h.nav)
      }
    })
  })
})
