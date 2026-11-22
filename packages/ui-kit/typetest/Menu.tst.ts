import { type Component, UiSchema, type View } from "@effect/ui"
import { Menu, type MenuEvents, MenuTrigger, type MenuTriggerPress } from "@effect/ui-kit"
import type { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

const Msg = UiSchema.TaggedEnum({ Clicked: {}, Picked: { value: Schema.String } })
type Msg = typeof Msg.Type

type Button = Html.Element<Msg, never, Html.EventsOf<"button">, HTMLButtonElement, "button">
type Div = Html.Element<Msg, never, Html.EventsOf<"div">, HTMLDivElement, "div">
type A = Html.Element<Msg, never, Html.EventsOf<"a">, HTMLAnchorElement, "a">
type Span = Html.Element<Msg, never, Html.EventsOf<"span">, HTMLSpanElement, "span">
type Input = Html.VoidElement<Msg, never, Html.EventsOf<"input">, HTMLInputElement, "input">
type Picked = Extract<MenuEvents, { readonly _tag: "Picked" }>

declare const h: View.Helper<Msg, unknown> & View.Tags<Html.Elements, Msg>

const items = [{ value: "copy", label: "Copy" }]

const onEmit = {
  Opened: () => Msg.Clicked(),
  Dismissed: () => undefined,
  Picked: ({ value }: Picked) => Msg.Picked({ value }),
  Highlighted: () => undefined,
  ChangedQuery: () => undefined,
  Settled: () => undefined
}

describe("Menu", () => {
  it("needs no service", () => {
    expect<Component.Headless.Requirements<typeof Menu>>().type.toBe<never>()
  })

  it("Picked carries the item's value, and a checked state only for checkbox and radio items", () => {
    expect<Picked["value"]>().type.toBe<string>()
    expect<Picked["checked"]>().type.toBe<boolean | undefined>()
    expect<{ readonly _tag: "Picked"; readonly value: string }>().type.toBeAssignableTo<Picked>()
  })

  it("requires open and items, and an onEmit that handles every event", () => {
    const view = () => h.div
    Menu(h, { props: { open: false, items }, onEmit, view })
    expect(Menu).type.not.toBeCallableWith(h, { props: { open: false }, onEmit, view })
    const { Settled: _, ...partial } = onEmit
    expect(Menu).type.not.toBeCallableWith(h, { props: { open: false, items }, onEmit: partial, view })
  })

  it("each part returns the builder it was given, and rejects other tags", () => {
    Menu(h, {
      props: { open: false, items },
      onEmit,
      view: (menu) => {
        expect(menu.trigger(h.button.onClick(Msg.Clicked()))).type.toBe<Button>()
        expect(menu.trigger(h.button, { openOnHover: true, delay: 0, closeDelay: 300 })).type.toBe<Button>()
        expect(menu.positioner(h.div)).type.toBe<Div>()
        expect(menu.popup(h.div)).type.toBe<Div>()
        expect(menu.item(h.div, "copy")).type.toBe<Div>()
        expect(menu.item(h.div, "copy", false)).type.toBe<Div>()
        expect(menu.linkItem(h.a.attr("href", "/copy"), "copy")).type.toBe<A>()
        expect(menu.checkboxItem(h.div, "copy", true)).type.toBe<Div>()
        expect(menu.checkboxItemIndicator(h.span, "copy")).type.toBe<Span | undefined>()
        expect(menu.input(h.input)).type.toBe<Input>()
        expect(menu.clear(h.button)).type.toBe<Button | undefined>()
        expect(menu.empty(h.div)).type.toBe<Div | undefined>()
        expect(menu.highlighted).type.toBe<string | null>()
        expect(menu.nothingMatches).type.toBe<boolean>()

        expect(menu.trigger).type.not.toBeCallableWith(h.div)
        expect(menu.trigger).type.not.toBeCallableWith(h.button, { delay: "0" })
        expect(menu.item).type.not.toBeCallableWith(h.span, "copy")
        expect(menu.item).type.not.toBeCallableWith(h.a, "copy")
        expect(menu.item).type.not.toBeCallableWith(h.div)
        expect(menu.linkItem).type.not.toBeCallableWith(h.div, "copy")
        expect(menu.input).type.not.toBeCallableWith(h.div)
        expect(menu.input).type.not.toBeCallableWith(h.textarea)
        return menu.trigger(h.button)
      }
    })
  })
})

describe("MenuTrigger", () => {
  it("returns the button it was given, and its press is the caller's message or a function of the press", () => {
    expect(MenuTrigger(h, { props: { open: false, popupId: "menu" }, onPress: Msg.Clicked() })).type.toBe<Button>()
    MenuTrigger(h, {
      props: { open: false, popupId: "menu" },
      onHover: (press) => {
        expect(press).type.toBe<MenuTriggerPress>()
        return Msg.Clicked()
      }
    })
    expect(MenuTrigger).type.not.toBeCallableWith(h, { props: { open: false, popupId: "menu" }, onPress: "other" })
    expect(MenuTrigger).type.not.toBeCallableWith(h, { element: h.div, props: { open: false, popupId: "menu" } })
    expect(MenuTrigger).type.not.toBeCallableWith(h, { props: { open: false } })
  })
})
