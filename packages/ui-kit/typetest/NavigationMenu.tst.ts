import { Component, Mount, UiSchema, View } from "@effect/ui"
import {
  NavigationMenu,
  type NavigationMenuDismissReason,
  type NavigationMenuOpenReason,
  type NavigationMenuTransitionStatus
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

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

type Nav = Html.Element<Msg, never, Html.EventsOf<"nav">, HTMLElement, "nav">
type Ul = Html.Element<Msg, never, Html.EventsOf<"ul">, HTMLUListElement, "ul">
type Li = Html.Element<Msg, never, Html.EventsOf<"li">, HTMLLIElement, "li">
type Button<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>
type A = Html.Element<Msg, never, Html.EventsOf<"a">, HTMLAnchorElement, "a">
type Div = Html.Element<Msg, never, Html.EventsOf<"div">, HTMLDivElement, "div">

const h = View.makeHelper<Msg, {}, Html.Elements>({}, Html)

describe("NavigationMenu", () => {
  it("each part returns the builder it was given, keeping its requirements, and the portal may be absent", () => {
    expect<Component.Headless.Requirements<typeof NavigationMenu>>().type.toBe<
      never
    >()
    const child = NavigationMenu(h, {
      props: { value: null },
      view: (navigationMenu) => {
        expect(navigationMenu.root(h.nav)).type.toBe<Nav>()
        expect(navigationMenu.list(h.ul)).type.toBe<Ul>()
        expect(navigationMenu.item(h.li)).type.toBe<Li>()
        const trigger = navigationMenu.trigger({
          element: h.button.on("click", Msg.Clicked()).onMount(NeedsClock()),
          value: "products"
        })
        expect(trigger).type.toBe<Button<Clock>>()
        expect(
          navigationMenu.link({
            element: h.a,
            active: true,
            closeOnClick: true
          })
        ).type.toBe<A>()
        expect(navigationMenu.portal(h.div)).type.toBe<Div | undefined>()
        expect(navigationMenu.positioner(h.div)).type.toBe<Div>()
        expect(navigationMenu.popup(h.div)).type.toBe<Div>()
        expect(navigationMenu.viewport(h.div)).type.toBe<Div>()
        expect(navigationMenu.arrow(h.div)).type.toBe<Div>()
        expect(navigationMenu.value).type.toBe<string | null>()
        expect(navigationMenu.openReason).type.toBe<
          NavigationMenuOpenReason | null
        >()
        expect(navigationMenu.transitionStatus).type.toBe<
          NavigationMenuTransitionStatus
        >()
        return navigationMenu.root(h.nav).children(
          navigationMenu.list(h.ul).children(
            navigationMenu.item(h.li).children(trigger)
          )
        )
      }
    })
    expect<View.Requirements<typeof child>>().type.toBe<Clock>()
  })

  it("the events report the item and why, and the parts take only their native elements", () => {
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        NavigationMenu(h, {
          props: { value: null },
          onEmit: {
            RequestedOpen: ({ reason, value }) => {
              expect(reason).type.toBe<NavigationMenuOpenReason>()
              expect(value).type.toBe<string>()
              return Msg.Clicked()
            },
            RequestedClose: ({ reason }) => {
              expect(reason).type.toBe<NavigationMenuDismissReason>()
              return undefined
            },
            Settled: ({ open }) => {
              expect(open).type.toBe<boolean>()
              return undefined
            }
          },
          view: (navigationMenu) => {
            expect(navigationMenu.root).type.not.toBeCallableWith(h.div)
            expect(navigationMenu.list).type.not.toBeCallableWith(h.ol)
            expect(navigationMenu.trigger).type.not.toBeCallableWith({
              element: h.a,
              value: "products"
            })
            expect(navigationMenu.trigger).type.not.toBeCallableWith({
              element: h.button
            })
            expect(navigationMenu.link).type.not.toBeCallableWith({
              element: h.button
            })
            expect(navigationMenu.positioner).type.not.toBeCallableWith(h.span)
            return navigationMenu.root(h.nav)
          }
        })
    })
    expect(NavigationMenu).type.not.toBeCallableWith(h, {
      props: {},
      view: () => h.nav
    })
    expect(NavigationMenu).type.not.toBeCallableWith(h, {
      props: { value: null, orientation: "both" },
      view: () => h.nav
    })
  })
})
