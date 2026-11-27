import { View } from "@effect/ui"
import { NavigationMenu } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"

const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const model = {
  hover: null,
  touched: false,
  away: true,
  request: null,
  reason: null,
  patient: false,
  closeReason: null,
  value: null,
  mounted: false,
  started: false,
  transition: null,
  placement: null
}

const partsFor = (value: string | null) =>
  Story.parts(NavigationMenu, { model, props: { value } })

describe("NavigationMenu", () => {
  it("the trigger keeps the consumer's attributes, but its own win, present or absent", () => {
    const consumer = h.button.class("trigger").attr("aria-label", "Products")
      .attr("type", "submit").attr("aria-expanded", "mixed")
      .attr("aria-controls", "elsewhere").attr("aria-disabled", "true")
      .attr("data-popup-open", "").attr("data-disabled", "")
      .attr("data-navigation-menu-trigger", "x")
    const closed = View.build(
      partsFor(null).trigger({ element: consumer, value: "products" }),
      []
    ).attrs
    const scope = closed["data-navigation-item"]
    assert.isString(scope)
    assert.deepStrictEqual(closed, {
      class: "trigger",
      "aria-label": "Products",
      "aria-controls": "elsewhere",
      type: "button",
      "aria-expanded": "false",
      "data-navigation-item": scope,
      "data-navigation-menu-trigger": "products"
    })
    const parts = partsFor("products")
    const built = View.build(
      parts.trigger({ element: consumer, value: "products", disabled: true }),
      []
    )
    const open = built.attrs
    assert.strictEqual(open["aria-expanded"], "true")
    assert.strictEqual(
      open["aria-controls"],
      `elsewhere ${View.build(parts.popup(h.div), []).attrs.id}`
    )
    assert.strictEqual(open["data-popup-open"], "")
    assert.strictEqual(open["data-disabled"], "")
    assert.strictEqual(open.disabled, "")
    assert.isUndefined(open["aria-disabled"])
  })

  it("panel links are plain links, and the portal draws nothing while no panel shows", () => {
    const parts = partsFor(null)
    const link = View.build(
      parts.link({
        element: h.a.attr("href", "/ui").attr("role", "menuitem"),
        active: true,
        closeOnClick: true
      }),
      []
    ).attrs
    assert.strictEqual(link["aria-current"], "page")
    assert.strictEqual(link.role, "menuitem")
    assert.isUndefined(parts.portal(h.div))
    assert.isDefined(partsFor("products").portal(h.div))
  })
})
