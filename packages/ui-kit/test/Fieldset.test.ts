// @vitest-environment happy-dom
import { Component, UiSchema, View } from "@effect/ui"
import { Field, Fieldset, type FieldsetProps } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, fieldsetDisabled, tick } from "./utils/document.ts"

const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const parts = (props: FieldsetProps) =>
  Story.parts(Fieldset, { model: {}, props })
const attrsOf = (builder: View.ElementBuilder<never, never, any, any>) =>
  View.build(builder, []).attrs

const Message = UiSchema.TaggedEnum({ ToggledLock: {} })

const Billing = Component.define({
  name: "Billing",
  scoped: false,
  model: Schema.Struct({ locked: Schema.Boolean }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ locked: false }),
  update: { ToggledLock: ($) => ({ locked: !$.model.locked }) },
  view: (h, model) => {
    const formField = (name: string) =>
      Field(h, {
        key: name,
        props: { invalid: true },
        view: (field) =>
          field.root(h.div.class(name)).children(
            field.label(h.label).children(name),
            field.control(h.input).attrs({ name, value: name }),
            field.error(h.span)?.children("Required")
          )
      })
    return h.form(
      Fieldset(h, {
        key: "billing",
        props: { disabled: model.locked },
        view: (outerFieldset) =>
          outerFieldset.root(h.fieldset.class("billing")).children(
            outerFieldset.legend(h.div).children("Billing details"),
            formField("company"),
            Fieldset(h, {
              key: "address",
              props: { disabled: outerFieldset.disabled },
              view: (innerFieldset) =>
                innerFieldset.root(h.fieldset.class("address")).children(
                  innerFieldset.legend(h.div.class("address-legend")).children(
                    "Address"
                  ),
                  formField("city")
                )
            })
          )
      }),
      h.button.class("lock").attr("type", "button").onClick(
        Message.ToggledLock()
      ).children("Lock")
    )
  }
})

const toggleLock = (app: Element) =>
  Effect.sync(() => app.querySelector<HTMLButtonElement>(".lock")!.click())
    .pipe(Effect.andThen(tick))

// Chromium blurs the focused control as a fieldset around it is disabled, before the render that disables
// it has finished. happy-dom doesn't.
const blurOnDisable = (fieldset: HTMLFieldSetElement) => {
  const setAttribute = fieldset.setAttribute
  fieldset.setAttribute = function(name, value) {
    setAttribute.call(this, name, value)
    const focused = document.activeElement as HTMLElement | null
    if (name === "disabled" && focused !== null && fieldset.contains(focused)) {
      focused.blur()
    }
  }
}

describe("Fieldset", { concurrent: false }, () => {
  it("the root is a fieldset named by the legend, and both parts follow disabled over the consumer's values", () => {
    const enabled = parts({})
    const legendAttrs = attrsOf(
      enabled.legend(h.div.attrs({ id: "mine", "data-disabled": "stale" }))
    )
    const legendId = legendAttrs.id
    assert.isString(legendId)
    assert.notStrictEqual(legendId, "mine")
    assert.deepStrictEqual(legendAttrs, { id: legendId })
    assert.deepStrictEqual(
      attrsOf(
        enabled.root(
          h.fieldset.class("mine").attrs({
            "aria-labelledby": "heading",
            "aria-disabled": "true",
            "data-disabled": "stale"
          }).disabled(true)
        )
      ),
      { class: "mine", "aria-labelledby": `heading ${legendId}` }
    )
    assert.isFalse(enabled.disabled)

    const disabled = parts({ disabled: true })
    assert.deepStrictEqual(attrsOf(disabled.root(h.fieldset.disabled(false))), {
      "aria-labelledby": legendId,
      "data-disabled": "",
      disabled: ""
    })
    assert.deepStrictEqual(attrsOf(disabled.legend(h.div)), {
      id: legendId,
      "data-disabled": ""
    })
    assert.isTrue(disabled.disabled)

    assert.throws(
      () => enabled.root(h.div as any),
      /a part for <fieldset> was given <div>/
    )
  })

  it.effect("a disabled fieldset disables the fields inside it, drops their focus and leaves them untouched", () =>
    Effect.gen(function*() {
      const app = yield* container
      yield* BrowserHost.mountEffect(Billing, {}, app)
      yield* tick
      const form = app.querySelector("form")!
      const company = app.querySelector<HTMLInputElement>(
        "input[name=company]"
      )!
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

      yield* toggleLock(app)
      assert.isTrue(
        app.querySelector<HTMLFieldSetElement>(".billing")!.disabled
      )
      assert.isTrue(
        app.querySelector<HTMLFieldSetElement>(".address")!.disabled
      )
      assert.isTrue(
        app.querySelector(".address-legend")!.hasAttribute("data-disabled")
      )
      assert.deepStrictEqual(state("company"), ["data-disabled"])
      assert.deepStrictEqual(state("city"), ["data-disabled"])
      for (const input of app.querySelectorAll("input")) {
        assert.isTrue(input.hasAttribute("disabled"))
        assert.isTrue(input.hasAttribute("data-disabled"))
        assert.isFalse(input.hasAttribute("aria-invalid"))
      }
      assert.strictEqual(app.querySelectorAll("span").length, 0)
      assert.deepStrictEqual(submitted(), [])

      yield* toggleLock(app)
      assert.deepStrictEqual(state("company"), [])
    }).pipe(Effect.scoped))

  it.effect("a blur sent while an outer fieldset is being disabled leaves a nested field's touched state alone", () =>
    Effect.gen(function*() {
      const app = yield* container
      yield* BrowserHost.mountEffect(Billing, {}, app)
      yield* tick
      const city = app.querySelector<HTMLInputElement>("input[name=city]")!
      const field = app.querySelector(".city")!
      const lockWhileFocused = Effect.gen(function*() {
        city.focus()
        yield* tick
        yield* toggleLock(app)
        assert.notStrictEqual(document.activeElement, city)
        yield* toggleLock(app)
        assert.isFalse(field.hasAttribute("data-focused"))
      })
      yield* fieldsetDisabled
      blurOnDisable(app.querySelector<HTMLFieldSetElement>(".billing")!)

      yield* lockWhileFocused
      assert.isFalse(field.hasAttribute("data-touched"))

      city.focus()
      city.blur()
      yield* lockWhileFocused
      assert.isTrue(field.hasAttribute("data-touched"))
    }).pipe(Effect.scoped))
})
