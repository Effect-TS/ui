import { Component, UiSchema, View } from "@effect/ui"
import { Input, type InputElement, type InputProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const ProfileMessage = UiSchema.TaggedEnum({ UpdatedName: { value: Schema.String } })

// A consumer that keeps the value in its Model.
const Profile = Component.define({
  name: "Profile",
  props: Schema.Struct({ disabled: Schema.optional(Schema.Boolean) }),
  model: Schema.Struct({ name: Schema.String }),
  message: ProfileMessage,
  elements: Html
}).make({
  init: () => ({ name: "Ada" }),
  update: (model, message) =>
    ProfileMessage.match(message, {
      UpdatedName: ({ value }) => ({ ...model, name: value })
    }),
  view: (model, h) =>
    Input(h, {
      props: { value: model.name, ...h.props },
      onUpdate: ({ value }) => ProfileMessage.UpdatedName({ value })
    }).attr("aria-label", "Name")
})

const input = Locator.tag("input")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

// The input a caller gets for these props and this element, with what
// `chain` adds after the call.
const inputOf = (
  props: InputProps,
  element: InputElement<never> = h.input,
  chain: (input: InputElement<never>) => InputElement<never> = (input) => input
) => View.build(chain(Input(h, { props, element })), [])

describe("Input", () => {
  it.effect("an edit reports the value the user left, and a disabled input reports nothing", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Profile, {})
      assert.strictEqual(s.get(input).props?.value, "Ada")
      s.fire(input, "input", { value: "Grace", checked: false })
      assert.strictEqual(s.get(input).props?.value, "Grace")
      assert.deepStrictEqual(s.get(input).attrs, { "aria-label": "Name" })

      s.props({ disabled: true })
      assert.deepStrictEqual(s.get(input).attrs, { "aria-label": "Name", disabled: "", "data-disabled": "" })
      assert.throws(() => s.fire(input, "input", { value: "Linus", checked: false }), /nothing handles/i)
    }))

  it("the caller's attributes stay, but the input's own win, present or absent, before the call or after it", () => {
    const element = h.input
      .class("name")
      .attr("type", "email")
      .attr("aria-disabled", "true")
      .attr("data-disabled", "x")
      .value("caller")
    const enabled = inputOf({ value: "Ada" }, element.disabled(true))
    assert.deepStrictEqual(enabled.attrs, { class: "name", type: "email" })
    assert.strictEqual(enabled.props.value, "Ada")

    const disabled = inputOf(
      { value: "Ada", disabled: true },
      element,
      (input) => input.disabled(false).attr("data-disabled", undefined).value("after")
    )
    assert.deepStrictEqual(disabled.attrs, { class: "name", type: "email", "data-disabled": "", disabled: "" })
    assert.strictEqual(disabled.props.value, "Ada")
  })

  it("the input keeps a caller's input handler without onUpdate, and refuses it with one in every state", () => {
    const handler = () => undefined
    assert.strictEqual(inputOf({ value: "" }, h.input.onInput(handler)).handlers.input, handler)
    const updating = (props: InputProps, when: "before" | "after") => () => {
      const call = Input(h, {
        props,
        element: when === "before" ? h.input.onInput(handler) : h.input,
        onUpdate: handler
      })
      return View.build(when === "before" ? call : call.onInput(handler), [])
    }
    assert.throws(updating({ value: "" }, "before"), /Input: the element already handles input/)
    assert.throws(updating({ value: "" }, "after"), /Input: the element already handles input/)
    // A disabled input sets no handler, but it would once it's enabled.
    assert.throws(updating({ value: "", disabled: true }, "after"), /Input: the element already handles input/)
  })
})
