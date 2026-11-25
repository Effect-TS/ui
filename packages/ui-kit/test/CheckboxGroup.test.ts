// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Checkbox, CheckboxGroup, Field } from "@effect/ui-kit"
import { BrowserHost, Html, HtmlServer } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, tick } from "./utils/document.ts"

const fruits = ["apple", "pear", "plum", "fig"]

const BasketMessage = UiSchema.TaggedEnum({
  ChangedFruits: { value: Schema.Array(Schema.String) },
  ToggledPear: { checked: Schema.Boolean },
  ToggledLock: {},
  ToggledFreeze: {}
})

const SenderMessage = UiSchema.TaggedEnum({ Clicked: {} })

const Sender = Html.component({
  name: "Sender",
  model: Schema.Struct({}),
  message: SenderMessage,
  reads: { group: { owner: CheckboxGroup } }
}).make({
  init: () => ({}),
  update: {
    Clicked: ($) =>
      $.send(CheckboxGroup, { _tag: "ToggledItem", value: "pear" })
  },
  view: (h) =>
    h.button.class("sender").attr("type", "button").on(
      "click",
      SenderMessage.Clicked()
    )
})

const Basket = Html.component({
  name: "Basket",
  model: Schema.Struct({
    fruits: Schema.Array(Schema.String),
    pearToggled: Schema.NullOr(Schema.Boolean),
    locked: Schema.Boolean,
    frozen: Schema.Boolean
  }),
  message: BasketMessage
}).make({
  init: () => ({
    fruits: ["apple", "fig"],
    pearToggled: null,
    locked: false,
    frozen: false
  }),
  update: {
    ChangedFruits: ($, { value }) => ({ ...$.model, fruits: value }),
    ToggledPear: ($, { checked }) => ({ ...$.model, pearToggled: checked }),
    ToggledLock: ($) => ({ ...$.model, locked: !$.model.locked }),
    ToggledFreeze: ($) => ({ ...$.model, frozen: !$.model.frozen })
  },
  view: (h, model) =>
    h.form.attr(
      "data-pear-toggled",
      model.pearToggled === null ? undefined : String(model.pearToggled)
    ).children(
      Field(h, {
        props: { disabled: model.locked },
        view: (field) =>
          field.root(h.div).children(
            field.legend(h.div.class("legend")).children("Fruit"),
            CheckboxGroup(h, {
              props: {
                value: model.fruits,
                allValues: fruits,
                name: "fruit",
                disabled: field.disabled
              },
              onEmit: {
                Updated: ({ value }) => BasketMessage.ChangedFruits({ value })
              },
              view: (checkboxGroup) =>
                checkboxGroup.root(
                  field.group(
                    h.div.class("group").attrs({
                      role: "list",
                      "data-disabled": ""
                    })
                  )
                )
                  .children(
                    h.label.children(
                      Checkbox(h, {
                        props: { parent: true, name: "all" },
                        view: (checkbox) =>
                          checkbox.root(
                            field.member(
                              h.button.class("parent").attrs({
                                id: "all-fruit",
                                "aria-controls": "panel"
                              })
                            )
                          )
                      }),
                      "All"
                    ),
                    h.label.children(
                      Checkbox(h, {
                        key: "extra",
                        props: { name: "extra", uncheckedValue: "no" },
                        view: (checkbox) =>
                          checkbox.root(h.button.class("extra"))
                      }),
                      "Extra"
                    ),
                    Sender(h, { key: "sender" }),
                    ...fruits.map((fruit) =>
                      h.label.children(
                        Checkbox(h, {
                          key: fruit,
                          props: {
                            value: fruit,
                            id: fruit === "apple" ? "apple-id" : undefined,
                            disabled: fruit === "fig" ||
                              (fruit === "plum" && model.frozen),
                            uncheckedValue: fruit === "pear" ? "no" : undefined
                          },
                          onEmit: fruit === "pear"
                            ? {
                              Toggled: ({ checked }) =>
                                BasketMessage.ToggledPear({ checked })
                            }
                            : undefined,
                          view: (checkbox) =>
                            checkbox.root(field.member(
                              fruit === "pear"
                                ? h.button.class(fruit).attr("data-parent", "")
                                : h.button.class(fruit)
                            ))
                        }),
                        fruit
                      )
                    )
                  )
            })
          )
      }),
      h.button.class("lock").attr("type", "button").on(
        "click",
        BasketMessage.ToggledLock()
      ).children("Lock"),
      h.button.class("freeze").attr("type", "button").on(
        "click",
        BasketMessage.ToggledFreeze()
      ).children("Freeze plum")
    )
})

const mount = Effect.gen(function*() {
  const app = yield* container
  yield* BrowserHost.mountEffect(Basket, {}, app)
  yield* tick
  const button = (name: string) =>
    app.querySelector<HTMLButtonElement>(`.${name}`)!
  return {
    app,
    button,
    click: (name: string) =>
      Effect.sync(() => button(name).click()).pipe(Effect.andThen(tick)),
    ticked: () =>
      fruits.filter((fruit) =>
        button(fruit).getAttribute("aria-checked") === "true"
      ),
    submitted: (name = "fruit") =>
      new FormData(app.querySelector("form")!).getAll(name)
  }
})

describe("CheckboxGroup", { concurrent: false }, () => {
  it.effect("a member drawn on field.control keeps the id its label points at", () =>
    Effect.gen(function*() {
      const Terms = Html.component({
        name: "Terms",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          CheckboxGroup(h, {
            props: { value: [] },
            view: (checkboxGroup) =>
              checkboxGroup.root(h.div).children(
                Field(h, {
                  view: (field) =>
                    field.root(h.div).children(
                      field.label(h.label).children("Apple"),
                      Checkbox(h, {
                        props: { value: "apple" },
                        view: (checkbox) =>
                          checkbox.root(field.control(h.button))
                      })
                    )
                })
              )
          })
      })
      const { html } = yield* HtmlServer.renderToHtml(Terms, {})
      const id = /<label [^>]*for="([^"]+)"/.exec(html)?.[1]
      assert.match(html, new RegExp(`<button [^>]*id="${id}"`))
    }))

  it.effect("members tick the group's value, and the parent cycles mix, all, none and back, leaving a disabled member alone", () =>
    Effect.gen(function*() {
      const { app, button, click, submitted, ticked } = yield* mount
      const parent = button("parent")
      const group = app.querySelector(".group")!
      assert.strictEqual(group.getAttribute("role"), "group")
      assert.isFalse(group.hasAttribute("data-disabled"))
      assert.strictEqual(
        group.getAttribute("aria-labelledby"),
        app.querySelector(".legend")!.id
      )
      assert.strictEqual(parent.id, "all-fruit")
      assert.strictEqual(parent.getAttribute("aria-checked"), "mixed")
      assert.isTrue(parent.hasAttribute("data-parent"))
      assert.isFalse(button("pear").hasAttribute("data-parent"))
      const ids = fruits.map((fruit) => button(fruit).id)
      assert.strictEqual(ids[0], "apple-id")
      assert.strictEqual(
        new Set(ids.filter((id) => id !== "")).size,
        fruits.length
      )
      assert.strictEqual(
        parent.getAttribute("aria-controls"),
        `panel ${ids.join(" ")}`
      )
      assert.deepStrictEqual(submitted(), ["apple"])
      assert.deepStrictEqual(submitted("extra"), [])

      yield* click("pear")
      assert.deepStrictEqual(ticked(), ["apple", "pear", "fig"])
      assert.strictEqual(
        app.querySelector("form")!.getAttribute("data-pear-toggled"),
        "true"
      )
      yield* click("parent")
      assert.deepStrictEqual(ticked(), fruits)
      assert.strictEqual(parent.getAttribute("aria-checked"), "true")
      assert.deepStrictEqual(submitted(), ["apple", "pear", "plum"])
      assert.deepStrictEqual(submitted("all"), [])
      yield* click("parent")
      assert.deepStrictEqual(ticked(), ["fig"])
      yield* click("parent")
      assert.deepStrictEqual(ticked(), ["apple", "pear", "fig"])

      yield* click("apple")
      yield* click("pear")
      assert.deepStrictEqual(ticked(), ["fig"])
      yield* click("freeze")
      yield* click("parent")
      assert.deepStrictEqual(ticked(), ["apple", "pear", "fig"])
      assert.strictEqual(parent.getAttribute("aria-checked"), "mixed")
      yield* click("pear")
      yield* click("parent")
      assert.deepStrictEqual(ticked(), ["apple", "pear", "fig"])
    }).pipe(Effect.scoped))

  it.effect("a disabled group disables every checkbox, submits nothing and ignores clicks", () =>
    Effect.gen(function*() {
      const { app, button, click, submitted, ticked } = yield* mount
      yield* click("lock")
      assert.isTrue(app.querySelector(".group")!.hasAttribute("data-disabled"))
      for (const name of ["parent", ...fruits]) {
        assert.isTrue(button(name).disabled)
      }
      assert.deepStrictEqual(submitted(), [])
      yield* Effect.sync(() => {
        button("parent").dispatchEvent(
          new MouseEvent("click", { bubbles: true })
        )
        button("pear").dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })
      yield* tick
      assert.deepStrictEqual(ticked(), ["apple", "fig"])
    }).pipe(Effect.scoped))

  it.effect("a disabled group ignores a toggle sent to it", () =>
    Effect.gen(function*() {
      const { click, ticked } = yield* mount
      yield* click("lock")
      yield* click("sender")
      assert.deepStrictEqual(ticked(), ["apple", "fig"])
    }).pipe(Effect.scoped))
})
