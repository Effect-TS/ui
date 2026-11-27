// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { NavigationMenu } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
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
  Settled: { open: Schema.Boolean }
})

const Page = Html.component({
  name: "Page",
  model: Schema.Struct({
    value: Schema.NullOr(Schema.String),
    log: Schema.Array(Schema.String)
  }),
  message: Message
}).make({
  init: () => ({ value: null, log: [] }),
  update: {
    RequestedOpen: ($, { reason, value }) => ({
      value,
      log: [...$.model.log, `RequestedOpen ${value} ${reason}`]
    }),
    RequestedClose: ($, { reason }) => ({
      value: null,
      log: [...$.model.log, `RequestedClose ${reason}`]
    }),
    Settled: ($) => $.model
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
                  value: "products"
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
              )
            ),
            navigationMenu.portal(h.div)?.children(
              navigationMenu.positioner(h.div).children(
                navigationMenu.popup(h.div).children(
                  navigationMenu.viewport(h.div).children(
                    navigationMenu.value === null ? null : h.div(
                      h.a.attr("id", `${navigationMenu.value}-first`)
                        .attr("href", "/first").children("First"),
                      h.a.attr("id", `${navigationMenu.value}-last`)
                        .attr("href", "/last").children("Last")
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

const mountPage = Effect.fnUntraced(function*() {
  yield* popovers
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(Page, {}, app)
  yield* tick
  return { log: () => root.model()!.log }
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
      const first = byId("products-first")
      assert.isTrue(
        byId(byId("products").getAttribute("aria-controls")!).contains(first)
      )
      assert.isNull(first.getAttribute("role"))

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
      assert.strictEqual(focused(), "solutions")
      assert.isTrue(key("ArrowRight"))
      assert.strictEqual(focused(), "docs")
      key("ArrowLeft")
      key("ArrowLeft")
      assert.strictEqual(focused(), "products")

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
})
