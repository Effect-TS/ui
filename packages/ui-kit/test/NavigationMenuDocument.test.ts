// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { NavigationMenu } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { TestClock } from "effect/testing"
import {
  byId,
  click,
  container,
  popovers,
  press,
  tick
} from "./utils/document.ts"

const Message = UiSchema.TaggedEnum({
  RequestedOpen: { value: Schema.String, reason: Schema.String },
  RequestedClose: { reason: Schema.String },
  Settled: { open: Schema.Boolean },
  DisabledProducts: {}
})

const Page = Html.component({
  name: "Page",
  props: Schema.Struct({ switches: Schema.Boolean }),
  model: Schema.Struct({
    value: Schema.NullOr(Schema.String),
    productsDisabled: Schema.Boolean,
    log: Schema.Array(Schema.String)
  }),
  message: Message
}).make({
  init: () => ({ value: null, productsDisabled: false, log: [] }),
  update: {
    RequestedOpen: ($, { reason, value }) => ({
      ...$.model,
      value: $.props.switches || $.model.value === null ? value : $.model.value,
      log: [...$.model.log, `RequestedOpen ${value} ${reason}`]
    }),
    RequestedClose: ($, { reason }) => ({
      ...$.model,
      value: null,
      log: [...$.model.log, `RequestedClose ${reason}`]
    }),
    Settled: ($) => $.model,
    DisabledProducts: ($) => $.evolve({ productsDisabled: true })
  },
  view: (h, model) =>
    h.div(
      NavigationMenu(h, {
        props: { value: model.value },
        onEmit: {
          RequestedOpen: ({ reason, value }) =>
            Message.RequestedOpen({ value, reason }),
          RequestedClose: ({ reason }) => Message.RequestedClose({ reason }),
          Settled: ({ open }) => Message.Settled({ open })
        },
        view: (navigationMenu) =>
          navigationMenu.root(h.nav.attr("aria-label", "Main")).children(
            navigationMenu.list(h.ul).children(
              navigationMenu.item(h.li).children(
                navigationMenu.trigger({
                  element: h.button.attr("id", "products"),
                  value: "products",
                  disabled: model.productsDisabled
                }).children("Products")
              ),
              navigationMenu.item(h.li).children(
                navigationMenu.trigger({
                  element: h.button.attr("id", "solutions"),
                  value: "solutions"
                }).children("Solutions")
              ),
              navigationMenu.item(h.li).children(
                navigationMenu.link({
                  element: h.a.attr("id", "docs").attr("href", "/docs")
                }).children("Docs")
              ),
              navigationMenu.item(h.li).children(
                navigationMenu.trigger({
                  element: h.button.attr("id", "pricing"),
                  value: "pricing",
                  disabled: true
                }).children("Pricing")
              )
            ),
            navigationMenu.portal(h.div)?.children(
              navigationMenu.positioner(h.div).children(
                navigationMenu.popup(h.div).children(
                  navigationMenu.viewport(h.div).children(
                    navigationMenu.value === null ? null : h.div(
                      h.a.attr("id", `${navigationMenu.value}-first`)
                        .attr("href", "/first").children("First"),
                      navigationMenu.link({
                        element: h.a.attr("id", `${navigationMenu.value}-last`)
                          .attr("href", "#last"),
                        closeOnClick: true
                      }).children("Last")
                    )
                  )
                )
              )
            )
          )
      }),
      h.button.attr("id", "outside").children("Outside")
    )
})

const mountPage = Effect.fnUntraced(function*(props = { switches: true }) {
  yield* popovers
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(Page, props, app)
  yield* tick
  return { log: () => root.model()!.log, send: root.send }
})

const key = (key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init
  })
  document.activeElement!.dispatchEvent(event)
  return event.defaultPrevented
}

const mouse = (
  target: Element,
  type: "mouseenter" | "mouseleave" | "mousemove"
) =>
  target.dispatchEvent(
    new MouseEvent(type, {
      clientX: 500,
      clientY: 500,
      bubbles: type === "mousemove"
    })
  )

const focused = () => document.activeElement?.id

const expanded = () =>
  ["products", "solutions"].map((id) => byId(id).getAttribute("aria-expanded"))

describe("NavigationMenu panels in a document", { concurrent: false }, () => {
  it.effect("a trigger discloses its panel of plain links: a press toggles it, another trigger switches it, and focus stays on the trigger", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      assert.deepStrictEqual(expanded(), ["false", "false"])
      byId("products").focus()
      click(byId("products"))
      yield* tick
      yield* tick
      assert.deepStrictEqual(log(), ["RequestedOpen products trigger-press"])
      assert.deepStrictEqual(expanded(), ["true", "false"])
      assert.strictEqual(focused(), "products")
      assert.isTrue(
        byId(byId("products").getAttribute("aria-controls")!).contains(
          byId("products-first")
        )
      )

      click(byId("solutions"))
      yield* tick
      yield* tick
      assert.deepStrictEqual(log().slice(1), [
        "RequestedOpen solutions trigger-press"
      ])
      assert.deepStrictEqual(expanded(), ["false", "true"])
      click(byId("solutions"))
      yield* tick
      yield* tick
      assert.deepStrictEqual(log().slice(2), ["RequestedClose trigger-press"])
      assert.deepStrictEqual(expanded(), ["false", "false"])
    }))

  it.effect("arrow keys move across triggers and links, ArrowDown opens a panel, and Tab goes into it and back out after its trigger", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      byId("products").focus()
      assert.isTrue(key("ArrowRight"))
      assert.isTrue(key("ArrowRight"))
      assert.strictEqual(focused(), "docs")
      byId("products").focus()

      assert.isTrue(key("ArrowDown"))
      yield* tick
      yield* tick
      assert.deepStrictEqual(log(), ["RequestedOpen products list-navigation"])
      assert.strictEqual(focused(), "products")

      assert.isTrue(key("Tab"))
      assert.strictEqual(focused(), "products-first")
      assert.isTrue(key("Tab", { shiftKey: true }))
      assert.strictEqual(focused(), "products")
      byId("products-last").focus()
      assert.isTrue(key("Tab"))
      assert.strictEqual(focused(), "solutions")
      yield* tick
      yield* tick
      assert.deepStrictEqual(log().slice(1), ["RequestedClose focus-out"])

      assert.isTrue(key("ArrowDown"))
      yield* tick
      yield* tick
      key("ArrowRight")
      assert.strictEqual(focused(), "docs")
      assert.isTrue(key("Tab"))
      assert.strictEqual(focused(), "outside")
      yield* tick
      assert.deepStrictEqual(log().slice(2), [
        "RequestedOpen solutions list-navigation",
        "RequestedClose focus-out"
      ])

      // With nothing after Docs, Tab leaves the page, skipping the panel the
      // browser would step into next.
      byId("outside").tabIndex = -1
      byId("solutions").focus()
      assert.isTrue(key("ArrowDown"))
      yield* tick
      yield* tick
      key("ArrowRight")
      assert.isFalse(key("Tab"))
      assert.isNotNull(byId("solutions-first").closest("[inert]"))
      yield* tick
      assert.isNull(byId("solutions-first").closest("[inert]"))
    }))

  it.effect("Escape in the panel returns focus to its trigger, and an outside press closes it without moving focus there", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      click(byId("products"))
      yield* tick
      yield* tick
      byId("products-first").focus()
      key("Escape")
      yield* tick
      yield* tick
      assert.deepStrictEqual(log().slice(1), ["RequestedClose escape-key"])
      assert.strictEqual(focused(), "products")

      click(byId("products"))
      yield* tick
      yield* tick
      byId("products-first").focus()
      press(byId("outside"))
      yield* tick
      yield* tick
      assert.deepStrictEqual(log().slice(2), [
        "RequestedOpen products trigger-press",
        "RequestedClose outside-press"
      ])
      assert.notStrictEqual(focused(), "products")
    }))

  it.effect("resting the mouse on a trigger opens its panel, another trigger switches at once, and leaving closes only a panel opened by hover", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      const wait = Effect.andThen(TestClock.adjust("50 millis"), tick)
      mouse(byId("products"), "mouseenter")
      yield* tick
      assert.deepStrictEqual(log(), [])
      yield* wait
      assert.deepStrictEqual(log(), ["RequestedOpen products trigger-hover"])
      mouse(byId("products"), "mouseleave")
      mouse(byId("solutions"), "mouseenter")
      yield* tick
      assert.deepStrictEqual(log().slice(1), [
        "RequestedOpen solutions trigger-hover"
      ])
      mouse(byId("solutions"), "mouseleave")
      mouse(byId("outside"), "mousemove")
      yield* tick
      assert.strictEqual(log().length, 2)
      yield* wait
      assert.deepStrictEqual(log().slice(2), ["RequestedClose trigger-hover"])

      mouse(byId("products"), "mouseenter")
      yield* wait
      click(byId("products"))
      yield* tick
      assert.deepStrictEqual(log().slice(3), [
        "RequestedOpen products trigger-hover",
        "RequestedOpen products trigger-press"
      ])
      mouse(byId("products"), "mouseleave")
      mouse(byId("outside"), "mousemove")
      yield* wait
      assert.strictEqual(log().length, 5)
    }))

  it.effect("a hover switch the consumer turns down leaves the pressed panel as it was", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ switches: false })
      click(byId("products"))
      yield* tick
      mouse(byId("solutions"), "mouseenter")
      yield* tick
      assert.deepStrictEqual(log(), [
        "RequestedOpen products trigger-press",
        "RequestedOpen solutions trigger-hover"
      ])
      mouse(byId("solutions"), "mouseleave")
      mouse(byId("outside"), "mousemove")
      yield* TestClock.adjust("50 millis")
      yield* tick
      assert.strictEqual(log().length, 2)
    }))

  it.effect("a touch never opens a panel by hover, and a trigger disabled before or during the hover delay opens nothing", () =>
    Effect.gen(function*() {
      const { log, send } = yield* mountPage()
      const products = byId("products")
      press(products, "touch")
      mouse(products, "mouseenter")
      yield* TestClock.adjust("50 millis")
      yield* tick
      mouse(products, "mouseleave")
      mouse(products, "mouseenter")
      send(Message.DisabledProducts())
      yield* tick
      yield* TestClock.adjust("50 millis")
      yield* tick
      const pricing = byId("pricing")
      click(pricing)
      mouse(pricing, "mouseenter")
      yield* TestClock.adjust("50 millis")
      yield* tick
      assert.deepStrictEqual(log(), [])
    }))

  it.effect("a link with closeOnClick closes the panel without returning focus to the trigger, and focus leaving the menu closes it", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      click(byId("products"))
      yield* tick
      const last = byId("products-last")
      last.focus()
      click(last)
      yield* tick
      yield* tick
      assert.deepStrictEqual(log().slice(1), ["RequestedClose link-press"])
      assert.notStrictEqual(focused(), "products")

      click(byId("products"))
      yield* tick
      byId("products-first").focus()
      byId("solutions").focus()
      yield* tick
      assert.deepStrictEqual(log().slice(3), [])
      byId("outside").focus()
      yield* tick
      assert.deepStrictEqual(log().slice(2), [
        "RequestedOpen products trigger-press",
        "RequestedClose focus-out"
      ])
    }))
})
