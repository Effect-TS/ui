import { Component, Mount, UiSchema, View } from "@effect/ui"
import { NavigationMenu } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Effect } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make("NeedsClock", { args: {} }, () => Clock.use(() => Effect.succeed(Component.noop)))

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

type Nav<R> = Html.Element<Msg, R, Html.EventsOf<"nav">, HTMLElement, "nav">
type Ul<R> = Html.Element<Msg, R, Html.EventsOf<"ul">, HTMLUListElement, "ul">
type Li<R> = Html.Element<Msg, R, Html.EventsOf<"li">, HTMLLIElement, "li">
type A<R> = Html.Element<Msg, R, Html.EventsOf<"a">, HTMLAnchorElement, "a">

const h = View.makeHelper<Msg, {}, Html.Elements>({}, Html)

describe("NavigationMenu", () => {
  it("preserves the consumer's builders, messages and requirements", () => {
    expect<Component.Headless.Requirements<typeof NavigationMenu>>().type.toBe<never>()
    const child = NavigationMenu(h, {
      props: { orientation: "vertical" },
      view: (navigationMenu) => {
        expect(navigationMenu.root(h.nav)).type.toBe<Nav<never>>()
        expect(navigationMenu.list(h.ul)).type.toBe<Ul<never>>()
        expect(navigationMenu.item(h.li)).type.toBe<Li<never>>()
        expect(navigationMenu.link({ element: h.a })).type.toBe<A<never>>()
        const link = navigationMenu.link({ element: h.a.onClick(Msg.Clicked()).onMount(NeedsClock()), active: true })
        expect(link).type.toBe<A<Clock>>()
        return navigationMenu.root(h.nav).children(
          navigationMenu.list(h.ul).children(navigationMenu.item(h.li).children(link))
        )
      }
    })
    expect<View.Requirements<typeof child>>().type.toBe<Clock>()
  })

  it("requires each part's native element and a known orientation", () => {
    expect(NavigationMenu).type.not.toBeCallableWith(h, { props: { orientation: "both" }, view: () => h.nav })
    NavigationMenu(h, {
      view: (navigationMenu) => {
        expect(navigationMenu.root).type.not.toBeCallableWith(h.div)
        expect(navigationMenu.list).type.not.toBeCallableWith(h.ol)
        expect(navigationMenu.item).type.not.toBeCallableWith(h.div)
        expect(navigationMenu.link).type.not.toBeCallableWith({ element: h.button })
        expect(navigationMenu.link).type.not.toBeCallableWith({ active: true })
        expect(navigationMenu.link).type.not.toBeCallableWith(h.a)
        return navigationMenu.root(h.nav)
      }
    })
  })
})
