// @vitest-environment happy-dom
import { Component, UiSchema, View } from "@effect/ui"
import { Field, Fieldset, type FieldsetProps } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, tick } from "./utils/document.ts"

const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const parts = (props: FieldsetProps) => Story.parts(Fieldset, { model: {}, props })
const attrsOf = (builder: View.ElementBuilder<never, never, any, any>) => View.build(builder, []).attrs

const Message = UiSchema.TaggedEnum({ ToggledLock: {} })

const Billing = Component.define({
  name: "Billing",
  model: Schema.Struct({ locked: Schema.Boolean }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ locked: false }),
  update: { ToggledLock: (model) => ({ locked: !model.locked }) },
  view: (model, h) => {
    const formField = (name: string) =>
      Field(h, {
        key: name,
        props: { invalid: true },
        view: (field) =>
          field.root(h.div.class(name)).children(
            field.label(h.label).children(name),
            field.control(h.input).attr("name", name).attr("value", name),
            field.error(h.span)?.children("Required")
          )
      })
    return h.form(
      Fieldset(h, {
        key: "billing",
        props: { disabled: model.locked },
        view: (outer) =>
          outer.root(h.fieldset.class("billing")).children(
            outer.legend(h.div).children("Billing details"),
            formField("company"),
            Fieldset(h, {
              key: "address",
              props: { disabled: outer.disabled },
              view: (inner) =>
                inner.root(h.fieldset.class("address")).children(
                  inner.legend(h.div.class("address-legend")).children("Address"),
                  formField("city")
                )
            })
          )
      }),
      h.button.class("lock").attr("type", "button").onClick(Message.ToggledLock()).children("Lock")
    )
  }
})

describe("Fieldset", () => {
  it("the root is a fieldset named by the legend, and both parts follow disabled over the consumer's values", () => {
    const enabled = parts({})
    const legendId = attrsOf(enabled.legend(h.div.attr("id", "mine").attr("data-disabled", "stale"))).id
    assert.isString(legendId)
    assert.notStrictEqual(legendId, "mine")
    assert.deepStrictEqual(
      attrsOf(
        enabled.root(
          h.fieldset.class("mine").attr("aria-labelledby", "heading").attr("aria-disabled", "true")
            .attr("data-disabled", "stale").disabled(true)
        )
      ),
      { class: "mine", "aria-labelledby": `heading ${legendId}` }
    )
    assert.deepStrictEqual(attrsOf(enabled.legend(h.div.attr("data-disabled", "stale"))), { id: legendId })
    assert.isFalse(enabled.disabled)

    const disabled = parts({ disabled: true })
    assert.deepStrictEqual(attrsOf(disabled.root(h.fieldset.disabled(false))), {
      "aria-labelledby": legendId,
      "data-disabled": "",
      disabled: ""
    })
    assert.deepStrictEqual(attrsOf(disabled.legend(h.div)), { id: legendId, "data-disabled": "" })
    assert.isTrue(disabled.disabled)

    assert.throws(() => enabled.root(h.div as any), /a part for <fieldset> was given <div>/)
  })

  it.effect("a disabled fieldset disables the fields inside it, drops their focus and leaves them untouched", () =>
    Effect.gen(function*() {
      const app = yield* container
      yield* BrowserHost.mountEffect(Billing, {}, app)
      yield* tick
      const form = app.querySelector("form")!
      const company = app.querySelector<HTMLInputElement>("input[name=company]")!
      const toggleLock = Effect.gen(function*() {
        app.querySelector<HTMLButtonElement>(".lock")!.click()
        yield* tick
      })
      const state = (name: string) =>
        ["data-disabled", "data-focused", "data-touched"].filter((attr) =>
          app.querySelector(`.${name}`)!.hasAttribute(attr)
        )
      const submitted = () => [...new FormData(form).keys()]

      company.focus()
      yield* tick
      assert.deepStrictEqual(state("company"), ["data-focused"])
      assert.deepStrictEqual(submitted(), ["company", "city"])
      assert.strictEqual(app.querySelectorAll("span").length, 2)

      yield* toggleLock
      assert.isTrue(app.querySelector<HTMLFieldSetElement>(".billing")!.disabled)
      assert.isTrue(app.querySelector<HTMLFieldSetElement>(".address")!.disabled)
      assert.isTrue(app.querySelector(".address-legend")!.hasAttribute("data-disabled"))
      assert.deepStrictEqual(state("company"), ["data-disabled"])
      assert.deepStrictEqual(state("city"), ["data-disabled"])
      for (const input of app.querySelectorAll("input")) {
        assert.isTrue(input.hasAttribute("disabled"))
        assert.isTrue(input.hasAttribute("data-disabled"))
        assert.isFalse(input.hasAttribute("aria-invalid"))
      }
      assert.strictEqual(app.querySelectorAll("span").length, 0)
      assert.deepStrictEqual(submitted(), [])

      yield* toggleLock
      assert.deepStrictEqual(state("company"), [])

      yield* toggleLock
      company.dispatchEvent(new FocusEvent("blur"))
      yield* toggleLock
      assert.deepStrictEqual(state("company"), [])
    }).pipe(Effect.scoped))
})
