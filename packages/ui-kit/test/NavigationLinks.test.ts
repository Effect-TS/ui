// @vitest-environment happy-dom
import { UiSchema, View } from "@effect/ui"
import { DirectionProvider, NavigationLinks } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, tick } from "./utils/document.ts"

const Message = UiSchema.TaggedEnum({ ClickedTurn: {}, PressedRight: {} })

const Page = Html.component({
  name: "Page",
  props: Schema.Struct({ rtl: Schema.Boolean, claimsRight: Schema.Boolean }),
  model: Schema.Struct({ vertical: Schema.Boolean }),
  message: Message
}).make({
  init: () => ({ vertical: false }),
  update: {
    ClickedTurn: () => ({ vertical: true }),
    PressedRight: ($) => $.model
  },
  view: (h, model) =>
    h.div(
      NavigationLinks(h, {
        key: "outer",
        props: { orientation: model.vertical ? "vertical" : "horizontal" },
        view: (navigationLinks) =>
          navigationLinks.root(h.nav).children(
            navigationLinks.list(
              h.ul.attr("style", h.props.rtl ? "direction:rtl" : undefined)
            ).children(
              navigationLinks.item(h.li).children(
                navigationLinks.link({
                  element: h.a.attr("href", "/").on("keydown", ({ key }) =>
                    h.props.claimsRight && key === "ArrowRight"
                      ? Message.PressedRight()
                      : undefined, { preventDefault: true }),
                  active: true
                }).children("Home")
              ),
              navigationLinks.item(h.li).children(
                navigationLinks.link({ element: h.a.attr("href", "/people") })
                  .children("People")
              ),
              navigationLinks.item(h.li).children(
                navigationLinks.link({
                  element: h.a.attr("href", "/files").attr(
                    "aria-disabled",
                    "true"
                  )
                })
                  .children("Files")
              ),
              navigationLinks.item(h.li).children(
                navigationLinks.link({ element: h.a.attr("href", "/nested") })
                  .children("Nested"),
                NavigationLinks(h, {
                  key: "inner",
                  view: (inner) =>
                    inner.root(h.nav).children(
                      inner.list(h.ul).children(
                        inner.item(h.li).children(
                          inner.link({
                            element: h.a.attr("href", "/nested/inner")
                          }).children("Inner")
                        )
                      )
                    )
                })
              )
            )
          )
      }),
      h.button.on("click", Message.ClickedTurn()).children("Turn")
    )
})

// A left-to-right provider over a right-to-left list.
const Provided = Html.component({
  name: "Provided",
  model: Schema.Struct({}),
  message: Schema.Never
}).make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) =>
    DirectionProvider(h, {
      props: { direction: "ltr" },
      view: () => Page(h, { props: { rtl: true, claimsRight: false } })
    })
})

const mount = Effect.fn(
  function*(
    props: {
      readonly rtl?: boolean
      readonly claimsRight?: boolean
      readonly provided?: boolean
    } = {}
  ) {
    const app = yield* container
    if (props.provided) {
      yield* BrowserHost.mountEffect(Provided, {}, app)
    } else {
      yield* BrowserHost.mountEffect(Page, {
        rtl: false,
        claimsRight: false,
        ...props
      }, app)
    }
    yield* tick
    const links = Array.from(app.querySelectorAll("a"))
    links[0]!.focus()
    return { app, links }
  }
)

const focused = () => document.activeElement?.textContent

const press = (key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init
  })
  document.activeElement!.dispatchEvent(event)
  return event.defaultPrevented
}

describe("NavigationLinks", () => {
  it.effect("marks only the active link, keeps links in the Tab order, and moves focus with arrow keys past disabled and nested links", () =>
    Effect.gen(function*() {
      const { app, links } = yield* mount()
      assert.deepStrictEqual(
        links.map((link) => link.getAttribute("aria-current")),
        ["page", null, null, null, null]
      )
      assert.deepStrictEqual(
        links.map((link) => link.getAttribute("data-active")),
        ["", null, null, null, null]
      )
      assert.isTrue(links.every((link) => !link.hasAttribute("tabindex")))

      assert.isFalse(press("ArrowRight", { shiftKey: true }))
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

      app.querySelector("button")!.click()
      yield* tick
      links[0]!.focus()
      assert.isFalse(press("ArrowRight"))
      assert.isTrue(press("ArrowDown"))
      assert.strictEqual(focused(), "People")
      assert.isTrue(press("ArrowUp"))
      assert.strictEqual(focused(), "Home")
    }).pipe(Effect.scoped))

  it.effect("an arrow key passes over a link that can't take focus, and is left alone when no link can", () =>
    Effect.gen(function*() {
      const { links } = yield* mount()
      links[1]!.parentElement!.setAttribute("inert", "")
      assert.isTrue(press("ArrowRight"))
      assert.strictEqual(focused(), "Nested")
      links[0]!.parentElement!.setAttribute("inert", "")
      assert.isFalse(press("ArrowLeft"))
      assert.strictEqual(focused(), "Nested")
    }).pipe(Effect.scoped))

  it.effect("an arrow key the consumer's own handler cancelled leaves focus where it is", () =>
    Effect.gen(function*() {
      yield* mount({ claimsRight: true })
      assert.isTrue(press("ArrowRight"))
      assert.strictEqual(focused(), "Home")
    }).pipe(Effect.scoped))

  it.effect("in a right-to-left list, Left moves to the next link, and a DirectionProvider wins over CSS", () =>
    Effect.gen(function*() {
      yield* Effect.scoped(Effect.gen(function*() {
        yield* mount({ rtl: true })
        assert.isFalse(press("ArrowRight"))
        assert.isTrue(press("ArrowLeft"))
        assert.strictEqual(focused(), "People")
      }))
      yield* mount({ provided: true })
      assert.isTrue(press("ArrowRight"))
      assert.strictEqual(focused(), "People")
    }).pipe(Effect.scoped))

  it("the link keeps the consumer's attributes, but its own win, present or absent", () => {
    const h = View.makeHelper<never, {}, Html.Elements>({}, Html)
    const navigationLinks = Story.parts(NavigationLinks, {
      model: {},
      props: {}
    })
    const element = h.a.class("link").attr("href", "/").attr("tabindex", "-1")
      .attr("aria-label", "Home")
    const scope = View.build(navigationLinks.link({ element: h.a }), [])
      .attrs["data-navigation-item"]
    assert.isString(scope)
    assert.deepStrictEqual(
      View.build(
        navigationLinks.link({
          element: element.attr("aria-current", "step").attr("data-active", "")
            .attr("data-navigation-item", "x")
        }),
        []
      ).attrs,
      {
        class: "link",
        href: "/",
        tabindex: "-1",
        "aria-label": "Home",
        "data-navigation-item": scope
      }
    )
    assert.deepStrictEqual(
      View.build(
        navigationLinks.link({
          element: element.attr("aria-current", "step"),
          active: true
        }),
        []
      ).attrs,
      {
        class: "link",
        href: "/",
        tabindex: "-1",
        "aria-label": "Home",
        "aria-current": "page",
        "data-active": "",
        "data-navigation-item": scope
      }
    )
  })
})
