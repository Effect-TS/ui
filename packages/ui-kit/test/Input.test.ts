import { Component, UiSchema, View } from "@effect/ui"
import { Input, type InputElement } from "@effect/ui-kit"
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
  update: {
    UpdatedName: (model, { value }) => ({ ...model, name: value })
  },
  view: (model, h) =>
    Input(h, {
      props: { value: model.name, ...h.props },
      onUpdate: ({ value }) => ProfileMessage.UpdatedName({ value })
    })
})

const input = Locator.tag("input")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const build = (input: InputElement<never>) => View.build(input, [])

describe("Input", () => {
  it.effect("an edit reports the value the user left, and a disabled input reports nothing", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Profile, {})
      s.fire(input, "input", { value: "Grace", checked: false })
      assert.strictEqual(s.get(input).props?.value, "Grace")

      s.props({ disabled: true })
      assert.throws(() => s.fire(input, "input", { value: "Linus", checked: false }), /nothing handles/i)
    }))

  it("the caller's attributes stay, but the input's own win, present or absent, before the call or after it", () => {
    const element = h.input
      .attr("type", "email")
      .attr("aria-disabled", "true")
      .attr("data-disabled", "x")
      .value("caller")
    const enabled = build(Input(h, { props: { value: "Ada" }, element: element.disabled(true) }))
    assert.deepStrictEqual(enabled.attrs, { type: "email" })
    assert.strictEqual(enabled.props.value, "Ada")

    const disabled = build(
      Input(h, { props: { value: "Ada", disabled: true }, element })
        .attr("aria-label", "Name")
        .disabled(false)
        .attr("data-disabled", undefined)
        .value("after")
    )
    assert.deepStrictEqual(disabled.attrs, { "aria-label": "Name", type: "email", "data-disabled": "", disabled: "" })
    assert.strictEqual(disabled.props.value, "Ada")
  })

  it("the input keeps a caller's input handler without onUpdate, and refuses it with one in every state", () => {
    const handler = () => undefined
    const own = h.input.onInput(handler)
    const clash = /Input: the element already handles input/
    assert.strictEqual(build(Input(h, { props: { value: "" }, element: own })).handlers.input, handler)
    assert.throws(() => build(Input(h, { props: { value: "" }, element: own, onUpdate: handler })), clash)
    assert.throws(() => build(Input(h, { props: { value: "" }, onUpdate: handler }).onInput(handler)), clash)
    // A disabled input sets no handler, but it would once it's enabled.
    assert.throws(
      () => build(Input(h, { props: { value: "", disabled: true }, onUpdate: handler }).onInput(handler)),
      clash
    )
  })
})
