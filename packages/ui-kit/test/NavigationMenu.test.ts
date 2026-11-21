// @vitest-environment happy-dom
import { Component, UiSchema, View } from "@effect/ui"
import { NavigationMenu, type NavigationMenuProps } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, tick } from "./utils/document.ts"

const Message = UiSchema.TaggedEnum({ ClickedTurn: {}, PressedRight: {} })

const Page = Component.define({
  name: "Page",
  props: Schema.Struct({ rtl: Schema.Boolean, claimsRight: Schema.Boolean }),
  model: Schema.Struct({ vertical: Schema.Boolean }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ vertical: false }),
  update: { ClickedTurn: () => ({ vertical: true }), PressedRight: (model) => model },
  view: (model, h) =>
    h.div(
      NavigationMenu(h, {
        key: "outer",
        props: { orientation: model.vertical ? "vertical" : "horizontal" },
        view: (navigationMenu) =>
          navigationMenu.root(h.nav).children(
            navigationMenu.list(h.ul.attr("style", h.props.rtl ? "direction:rtl" : undefined)).children(
              navigationMenu.item(h.li).children(
                navigationMenu.link({
                  element: h.a.attr("href", "/").onKeyDown(
                    ({ key }) => h.props.claimsRight && key === "ArrowRight" ? Message.PressedRight() : undefined,
                    { preventDefault: true }
                  ),
                  active: true
                }).children("Home")
              ),
              navigationMenu.item(h.li).children(
                navigationMenu.link({ element: h.a.attr("href", "/people") }).children("People")
              ),
              navigationMenu.item(h.li).children(
                navigationMenu.link({ element: h.a.attr("href", "/files").attr("aria-disabled", "true") })
                  .children("Files")
              ),
              navigationMenu.item(h.li).children(
                navigationMenu.link({ element: h.a.attr("href", "/nested") }).children("Nested"),
                NavigationMenu(h, {
                  key: "inner",
                  view: (inner) =>
                    inner.root(h.nav).children(
                      inner.list(h.ul).children(
                        inner.item(h.li).children(
                          inner.link({ element: h.a.attr("href", "/nested/inner") }).children("Inner")
                        )
                      )
                    )
                })
              )
            )
          )
      }),
      h.button.onClick(Message.ClickedTurn()).children("Turn")
    )
})

const mount = Effect.fn(function*(props: { readonly rtl?: boolean; readonly claimsRight?: boolean } = {}) {
  const app = yield* container
  yield* BrowserHost.mountEffect(Page, { rtl: false, claimsRight: false, ...props }, app)
  yield* tick
  const links = Array.from(app.querySelectorAll("a"))
  links[0]!.focus()
  return { app, links }
})

const focused = () => document.activeElement?.textContent

const press = (key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })
  document.activeElement!.dispatchEvent(event)
  return event.defaultPrevented
}

describe("NavigationMenu", () => {
  it.effect("only the active link is the current page, and every link stays in the Tab order", () =>
    Effect.gen(function*() {
      const { links } = yield* mount()
      assert.deepStrictEqual(links.map((link) => link.getAttribute("aria-current")), ["page", null, null, null, null])
      assert.deepStrictEqual(links.map((link) => link.getAttribute("data-active")), ["", null, null, null, null])
      assert.isTrue(links.every((link) => !link.hasAttribute("tabindex")))
    }).pipe(Effect.scoped))

  it.effect("Right and Left alone move focus between a menu's own links, past a disabled one, and stop at the ends", () =>
    Effect.gen(function*() {
      yield* mount()
      assert.isFalse(press("ArrowRight", { shiftKey: true }))
      assert.isFalse(press("ArrowRight", { metaKey: true }))
      assert.isFalse(press("ArrowDown"))
      assert.strictEqual(focused(), "Home")
      assert.isTrue(press("ArrowRight"))
      assert.strictEqual(focused(), "People")
      assert.isTrue(press("ArrowRight"))
      assert.strictEqual(focused(), "Nested")
      assert.isFalse(press("ArrowRight"))
      assert.strictEqual(focused(), "Nested")
      assert.isTrue(press("ArrowLeft"))
      assert.strictEqual(focused(), "People")
      press("ArrowLeft")
      assert.isFalse(press("ArrowLeft"))
      assert.strictEqual(focused(), "Home")
    }).pipe(Effect.scoped))

  it.effect("an arrow key the consumer's own handler cancelled leaves focus where it is", () =>
    Effect.gen(function*() {
      yield* mount({ claimsRight: true })
      assert.isTrue(press("ArrowRight"))
      assert.strictEqual(focused(), "Home")
    }).pipe(Effect.scoped))

  it.effect("a vertical menu uses Down and Up, as soon as the orientation changes", () =>
    Effect.gen(function*() {
      const { app, links } = yield* mount()
      app.querySelector("button")!.click()
      yield* tick
      links[0]!.focus()
      assert.isFalse(press("ArrowRight"))
      assert.isTrue(press("ArrowDown"))
      assert.strictEqual(focused(), "People")
      assert.isTrue(press("ArrowUp"))
      assert.strictEqual(focused(), "Home")
    }).pipe(Effect.scoped))

  it.effect("in a right-to-left list, Left moves to the next link", () =>
    Effect.gen(function*() {
      yield* mount({ rtl: true })
      assert.isFalse(press("ArrowRight"))
      assert.isTrue(press("ArrowLeft"))
      assert.strictEqual(focused(), "People")
    }).pipe(Effect.scoped))

  it("each part takes only its own tag, and the link's attributes win over the consumer's, present or absent", () => {
    const h = View.makeHelper<never, {}, Html.Elements>({}, Html)
    const parts = (props: NavigationMenuProps = {}) => Story.parts(NavigationMenu, { model: {}, props })
    const navigationMenu = parts()
    assert.throws(() => navigationMenu.root(h.div as any), /a part for <nav> was given <div>/)
    assert.throws(() => navigationMenu.list(h.ol as any), /a part for <ul> was given <ol>/)
    assert.throws(() => navigationMenu.item(h.div as any), /a part for <li> was given <div>/)
    assert.throws(() => navigationMenu.link({ element: h.button as any }), /a part for <a> was given <button>/)

    const element = h.a.class("link").attr("href", "/").attr("tabindex", "-1").attr("aria-label", "Home")
    const scope = View.build(navigationMenu.link({ element: h.a }), []).attrs["data-navigation-menu-link"]
    assert.isString(scope)
    assert.deepStrictEqual(
      View.build(
        navigationMenu.link({
          element: element.attr("aria-current", "step").attr("data-active", "").attr("data-navigation-menu-link", "x")
        }),
        []
      ).attrs,
      { class: "link", href: "/", tabindex: "-1", "aria-label": "Home", "data-navigation-menu-link": scope }
    )
    assert.deepStrictEqual(
      View.build(navigationMenu.link({ element: element.attr("aria-current", "step"), active: true }), []).attrs,
      {
        class: "link",
        href: "/",
        tabindex: "-1",
        "aria-label": "Home",
        "aria-current": "page",
        "data-active": "",
        "data-navigation-menu-link": scope
      }
    )
  })
})
