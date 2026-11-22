// @vitest-environment happy-dom
import { Component, UiSchema, View } from "@effect/ui"
import { Checkbox, CheckboxGroup, Field } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, tick } from "./utils/document.ts"

const h = View.makeHelper<never, {}, Html.Elements>({}, Html)
const attrsOf = (builder: View.ElementBuilder<never, never, any, any>) => View.build(builder, []).attrs

const fruits = ["apple", "pear", "plum", "fig"]

const Message = UiSchema.TaggedEnum({ ChangedFruits: { value: Schema.Array(Schema.String) }, ToggledLock: {} })

const Basket = Component.define({
  name: "Basket",
  scoped: false,
  model: Schema.Struct({ fruits: Schema.Array(Schema.String), locked: Schema.Boolean }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ fruits: ["apple", "fig"], locked: false }),
  update: {
    ChangedFruits: (model, { value }) => ({ ...model, fruits: value }),
    ToggledLock: (model) => ({ ...model, locked: !model.locked })
  },
  view: (model, h) =>
    h.form(
      Field(h, {
        props: { disabled: model.locked },
        view: (field) =>
          field.root(h.div).children(
            field.legend(h.div.class("legend")).children("Fruit"),
            CheckboxGroup(h, {
              props: { value: model.fruits, allValues: fruits, name: "fruit", disabled: field.disabled },
              onEmit: { Updated: ({ value }) => Message.ChangedFruits({ value }) },
              view: (group) =>
                group.root(field.group(h.div.class("group"))).children(
                  h.label.children(
                    Checkbox(h, {
                      props: { parent: true },
                      view: (checkbox) => checkbox.root(field.member(h.button.class("parent")))
                    }),
                    "All"
                  ),
                  ...fruits.map((fruit) =>
                    h.label.children(
                      Checkbox(h, {
                        key: fruit,
                        props: { value: fruit, disabled: fruit === "fig" },
                        view: (checkbox) => checkbox.root(field.member(h.button.class(fruit)))
                      }),
                      fruit
                    )
                  )
                )
            })
          )
      }),
      h.button.class("lock").attr("type", "button").onClick(Message.ToggledLock()).children("Lock")
    )
})

const mount = Effect.gen(function*() {
  const app = yield* container
  yield* BrowserHost.mountEffect(Basket, {}, app)
  yield* tick
  const button = (name: string) => app.querySelector<HTMLButtonElement>(`.${name}`)!
  return {
    app,
    button,
    click: (name: string) => Effect.sync(() => button(name).click()).pipe(Effect.andThen(tick)),
    ticked: () => fruits.filter((fruit) => button(fruit).getAttribute("aria-checked") === "true"),
    submitted: () => new FormData(app.querySelector("form")!).getAll("fruit")
  }
})

describe("CheckboxGroup", { concurrent: false }, () => {
  it.effect("members tick the group's value, and the parent cycles mix, all, none and back, leaving a disabled member alone", () =>
    Effect.gen(function*() {
      const { app, button, click, submitted, ticked } = yield* mount
      const parent = button("parent")
      const group = app.querySelector(".group")!
      assert.strictEqual(group.getAttribute("role"), "group")
      assert.strictEqual(group.getAttribute("aria-labelledby"), app.querySelector(".legend")!.id)
      assert.strictEqual(parent.getAttribute("aria-checked"), "mixed")
      assert.isTrue(parent.hasAttribute("data-parent"))
      const ids = fruits.map((fruit) => button(fruit).id)
      assert.strictEqual(new Set(ids.filter((id) => id !== "")).size, fruits.length)
      assert.strictEqual(parent.getAttribute("aria-controls"), ids.join(" "))
      assert.deepStrictEqual(submitted(), ["apple"])

      yield* click("pear")
      assert.deepStrictEqual(ticked(), ["apple", "pear", "fig"])
      yield* click("parent")
      assert.deepStrictEqual(ticked(), fruits)
      assert.strictEqual(parent.getAttribute("aria-checked"), "true")
      assert.deepStrictEqual(submitted(), ["apple", "pear", "plum"])
      yield* click("parent")
      assert.deepStrictEqual(ticked(), ["fig"])
      yield* click("parent")
      assert.deepStrictEqual(ticked(), ["apple", "pear", "fig"])

      yield* click("apple")
      yield* click("pear")
      assert.deepStrictEqual(ticked(), ["fig"])
      yield* click("parent")
      assert.deepStrictEqual(ticked(), fruits)
    }).pipe(Effect.scoped))

  it.effect("a disabled group disables every checkbox, submits nothing and ignores clicks", () =>
    Effect.gen(function*() {
      const { app, button, click, submitted, ticked } = yield* mount
      yield* click("lock")
      assert.isTrue(app.querySelector(".group")!.hasAttribute("data-disabled"))
      for (const name of ["parent", ...fruits]) assert.isTrue(button(name).disabled)
      assert.deepStrictEqual(submitted(), [])
      yield* Effect.sync(() => {
        button("parent").dispatchEvent(new MouseEvent("click", { bubbles: true }))
        button("pear").dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })
      yield* tick
      assert.deepStrictEqual(ticked(), ["apple", "fig"])
    }).pipe(Effect.scoped))

  it("the root is any element, and its role and data-disabled win over the consumer's", () => {
    const parts = (disabled: boolean) =>
      Story.parts(CheckboxGroup, { model: { remembered: [], items: [] }, props: { value: [], disabled } })
    assert.deepStrictEqual(
      attrsOf(parts(false).root(h.div.class("mine").attr("role", "list").attr("data-disabled", ""))),
      { class: "mine", role: "group" }
    )
    assert.deepStrictEqual(attrsOf(parts(true).root(h.fieldset)), { role: "group", "data-disabled": "" })
  })

  it.effect("a member follows the group's value, name and disabled state, and its id and the parent's attributes win", () =>
    Effect.gen(function*() {
      const view = {
        elements: Html,
        view: (checkbox: Component.Headless.Parts<typeof Checkbox>, h: View.Tags<Html.Elements, never>) =>
          checkbox.root(h.button.attr("id", "mine").attr("data-parent", "").attr("aria-controls", "panel"))
      }
      const member = yield* Scene.make(Checkbox, { value: "pear", checked: false, uncheckedValue: "no" }, view)
      member.shared(CheckboxGroup, { value: ["pear"], disabled: false, name: "fruit", parent: null })
      const root = member.get(Locator.tag("button"))
      const id = root.attrs?.id
      assert.notStrictEqual(id, "mine")
      assert.deepStrictEqual(member.current.reports, { group: { value: "pear", disabled: false, id } })
      assert.strictEqual(root.attrs?.["aria-checked"], "true")
      assert.isUndefined(root.attrs?.["data-parent"])
      assert.strictEqual(root.attrs?.["aria-controls"], "panel")
      assert.deepStrictEqual(member.get(Locator.tag("input")).attrs, { type: "hidden", name: "fruit", value: "pear" })
      member.click(Locator.tag("button"))
        .emitted({ _tag: "Toggled", checked: false })
        .sent(CheckboxGroup, { _tag: "ToggledItem", value: "pear", checked: false })

      const parent = yield* Scene.make(Checkbox, { parent: true, name: "all", checked: true }, view)
      parent.shared(CheckboxGroup, {
        value: [],
        disabled: true,
        name: "fruit",
        parent: { checked: false, indeterminate: true, controls: "a b" }
      })
      const parentRoot = parent.get(Locator.tag("button"))
      assert.strictEqual(parentRoot.attrs?.id, "mine")
      assert.strictEqual(parentRoot.attrs?.["aria-checked"], "mixed")
      assert.strictEqual(parentRoot.attrs?.["data-parent"], "")
      assert.strictEqual(parentRoot.attrs?.["aria-controls"], "panel a b")
      assert.strictEqual(parentRoot.attrs?.disabled, "")
      assert.isUndefined(parent.query(Locator.tag("input")))
      assert.deepStrictEqual(parent.current.reports, { group: null })
      parent.click(Locator.tag("button"))
      assert.deepStrictEqual(parent.current.emitted, [])
      assert.deepStrictEqual(parent.current.sent, [])
    }))
})
