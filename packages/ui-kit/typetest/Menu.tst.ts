import { Component, Mount, UiSchema, type View } from "@effect/ui"
import {
  Menu,
  type MenuEvents,
  MenuTrigger,
  type MenuTriggerPress
} from "@effect/ui-kit"
import type { Html } from "@effect/ui/html"
import { Context, Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make(
  "NeedsClock",
  { args: {} },
  () => Clock.use(() => Effect.succeed(Component.noop))
)

const Msg = UiSchema.TaggedEnum({
  Clicked: {},
  Picked: { value: Schema.String }
})
type Msg = typeof Msg.Type

type Button<R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>
type Div<R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"div">,
  HTMLDivElement,
  "div"
>
type A = Html.Element<Msg, never, Html.EventsOf<"a">, HTMLAnchorElement, "a">
type Span<R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"span">,
  HTMLSpanElement,
  "span"
>
type Input = Html.VoidElement<
  Msg,
  never,
  Html.EventsOf<"input">,
  HTMLInputElement,
  "input"
>
type Picked = Extract<MenuEvents, { readonly _tag: "Picked" }>

declare const h: View.Helper<Msg, unknown> & View.Tags<Html.Elements, Msg>

const items = [{ value: "copy", label: "Copy" }]

const onEmit = {
  RequestedOpen: () => Msg.Clicked(),
  RequestedClose: () => undefined,
  Picked: ({ value }: Picked) => Msg.Picked({ value }),
  Highlighted: () => undefined,
  RequestedQuery: () => undefined,
  Settled: () => undefined
}

describe("Menu", () => {
  it("needs no service", () => {
    expect<Component.Headless.Requirements<typeof Menu>>().type.toBe<never>()
  })

  it("Picked carries the item's value, and a checked state only for checkbox and radio items", () => {
    expect<Picked["value"]>().type.toBe<string>()
    expect<Picked["checked"]>().type.toBe<boolean | undefined>()
    expect<{ readonly _tag: "Picked"; readonly value: string }>().type
      .toBeAssignableTo<Picked>()
  })

  it("requires open and items, and an onEmit that handles every event", () => {
    const view = () => h.div
    Menu(h, { props: { open: false, items }, onEmit, view })
    expect(Menu).type.not.toBeCallableWith(h, {
      props: { open: false },
      onEmit,
      view
    })
    const { Settled: _, ...partial } = onEmit
    expect(Menu).type.not.toBeCallableWith(h, {
      props: { open: false, items },
      onEmit: partial,
      view
    })
  })

  it("each part returns the builder it was given, and rejects other tags", () => {
    const child = Menu(h, {
      props: { open: false, items },
      onEmit,
      view: (menu) => {
        const trigger = menu.trigger({
          element: h.button.onClick(Msg.Clicked()).onMount(NeedsClock())
        })
        expect(trigger).type.toBe<Button<Clock>>()
        expect(
          menu.trigger({
            element: h.button,
            openOnHover: true,
            delay: 0,
            closeDelay: 300
          })
        ).type.toBe<Button>()
        expect(menu.contextTrigger(h.div)).type.toBe<Div>()
        expect(menu.submenuTrigger(h.div)).type.toBe<Div>()
        expect(menu.backdrop(h.div)).type.toBe<Div>()
        expect(menu.positioner(h.div)).type.toBe<Div>()
        expect(menu.popup(h.div)).type.toBe<Div>()
        expect(menu.list(h.div)).type.toBe<Div>()
        expect(menu.arrow(h.div)).type.toBe<Div>()
        expect(menu.viewport(h.div)).type.toBe<Div>()
        expect(
          menu.item({ element: h.div.onMount(NeedsClock()), value: "copy" })
        ).type.toBe<Div<Clock>>()
        expect(
          menu.item({ element: h.div, value: "copy", closeOnClick: false })
        ).type.toBe<Div>()
        expect(
          menu.linkItem({ element: h.a.attr("href", "/copy"), value: "copy" })
        ).type.toBe<A>()
        expect(
          menu.checkboxItem({ element: h.div, value: "copy", checked: true })
        ).type.toBe<Div>()
        expect(menu.checkboxItemIndicator({ element: h.span, value: "copy" }))
          .type.toBe<Span | undefined>()
        expect(
          menu.checkboxItemIndicator({
            element: h.span.onMount(NeedsClock()),
            value: "copy",
            keepMounted: true
          })
        )
          .type.toBe<
          Span<Clock> | undefined
        >()
        expect(menu.radioGroup({ element: h.div, value: "copy" })).type.toBe<
          Div
        >()
        expect(menu.radioGroup({ element: h.div, value: null })).type.toBe<
          Div
        >()
        expect(menu.radioItem({ element: h.div, value: "copy" })).type.toBe<
          Div
        >()
        expect(menu.radioItemIndicator).type.toBe<
          typeof menu.checkboxItemIndicator
        >()
        expect(menu.group({ element: h.div, group: "edit" })).type.toBe<Div>()
        expect(menu.groupLabel({ element: h.div, group: "edit" })).type.toBe<
          Div
        >()
        expect(menu.separator(h.div)).type.toBe<Div>()
        expect(menu.input(h.input)).type.toBe<Input>()
        expect(menu.clear(h.button.onMount(NeedsClock()))).type.toBe<
          Button<Clock> | undefined
        >()
        expect(menu.empty(h.div.onMount(NeedsClock()))).type.toBe<
          Div<Clock> | undefined
        >()
        expect(menu.finalFocus(h.button)).type.toBe<Button>()
        expect(menu.highlighted).type.toBe<string | null>()
        expect(menu.nothingMatches).type.toBe<boolean>()

        expect(menu.trigger).type.not.toBeCallableWith({ element: h.div })
        expect(menu.trigger).type.not.toBeCallableWith({
          element: h.button,
          delay: "0"
        })
        expect(menu.trigger).type.not.toBeCallableWith(h.button)
        expect(menu.contextTrigger).type.not.toBeCallableWith(h.span)
        expect(menu.submenuTrigger).type.not.toBeCallableWith(h.button)
        expect(menu.backdrop).type.not.toBeCallableWith(h.span)
        expect(menu.positioner).type.not.toBeCallableWith(h.span)
        expect(menu.popup).type.not.toBeCallableWith(h.span)
        expect(menu.list).type.not.toBeCallableWith(h.ul)
        expect(menu.arrow).type.not.toBeCallableWith(h.span)
        expect(menu.viewport).type.not.toBeCallableWith(h.span)
        expect(menu.item).type.not.toBeCallableWith({
          element: h.span,
          value: "copy"
        })
        expect(menu.item).type.not.toBeCallableWith({
          element: h.a,
          value: "copy"
        })
        expect(menu.item).type.not.toBeCallableWith({ element: h.div })
        expect(menu.item).type.not.toBeCallableWith(h.div, "copy")
        expect(menu.linkItem).type.not.toBeCallableWith({
          element: h.div,
          value: "copy"
        })
        expect(menu.checkboxItem).type.not.toBeCallableWith({
          element: h.span,
          value: "copy",
          checked: true
        })
        expect(menu.checkboxItem).type.not.toBeCallableWith({
          element: h.div,
          value: "copy"
        })
        expect(menu.checkboxItemIndicator).type.not.toBeCallableWith({
          element: h.div,
          value: "copy"
        })
        expect(menu.radioGroup).type.not.toBeCallableWith({
          element: h.span,
          value: "copy"
        })
        expect(menu.radioItem).type.not.toBeCallableWith({
          element: h.span,
          value: "copy"
        })
        expect(menu.radioItemIndicator).type.not.toBeCallableWith({
          element: h.div,
          value: "copy"
        })
        expect(menu.group).type.not.toBeCallableWith({
          element: h.span,
          group: "edit"
        })
        expect(menu.groupLabel).type.not.toBeCallableWith({
          element: h.span,
          group: "edit"
        })
        expect(menu.separator).type.not.toBeCallableWith(h.hr)
        expect(menu.input).type.not.toBeCallableWith(h.div)
        expect(menu.input).type.not.toBeCallableWith(h.textarea)
        expect(menu.clear).type.not.toBeCallableWith(h.div)
        expect(menu.empty).type.not.toBeCallableWith(h.span)
        return trigger
      }
    })
    expect<View.Requirements<typeof child>>().type.toBe<Clock>()
  })
})

describe("MenuTrigger", () => {
  it("returns the button it was given, and its press is the caller's message or a function of the press", () => {
    expect(
      MenuTrigger(h, {
        props: { open: false, popupId: "menu" },
        onPress: Msg.Clicked()
      })
    ).type.toBe<Button>()
    MenuTrigger(h, {
      props: { open: false, popupId: "menu" },
      onHover: (press) => {
        expect(press).type.toBe<MenuTriggerPress>()
        return Msg.Clicked()
      }
    })
    expect(MenuTrigger).type.not.toBeCallableWith(h, {
      props: { open: false, popupId: "menu" },
      onPress: "other"
    })
    expect(MenuTrigger).type.not.toBeCallableWith(h, {
      element: h.div,
      props: { open: false, popupId: "menu" }
    })
    expect(MenuTrigger).type.not.toBeCallableWith(h, { props: { open: false } })
  })
})
