import { Component } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Scene } from "@effect/ui/testing"
import { Layer, Schema } from "effect"
import { describe, expect, it } from "tstyche"

const TipsMessage = Schema.TaggedUnion({ Enter: { id: Schema.String }, Elapsed: {} })

const Tips = Component.define({
  name: "Tips",
  props: Schema.Struct({ delay: Schema.optional(Schema.Number) }),
  model: Schema.Struct({ open: Schema.NullOr(Schema.String) }),
  message: TipsMessage,
  receives: ["Enter"],
  shares: (model) => ({ open: model.open })
}).make({
  init: () => ({ open: null }),
  update: (model) => model,
  parts: () => ({})
})

// Not an owner: it shares nothing.
const Plain = Component.define({ name: "Plain", model: Schema.Null, message: TipsMessage }).make({
  init: () => null,
  update: (model) => model,
  parts: () => ({})
})

const TipMessage = Schema.TaggedUnion({ Enter: { id: Schema.String } })

const Tip = Component.define({
  name: "Tip",
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Null,
  message: TipMessage,
  shared: { tips: Tips },
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => {
    expect(h.shared.tips).type.toBe<{ open: string | null }>()
    return h.span()
  }
})

// Sends to the owner with no `shared` declaration.
const Sender = Component.define({ name: "Sender", model: Schema.Null, message: TipMessage }).make({
  init: () => null,
  update: (model, message, $) => $.set(model).send(Tips, message),
  view: (_, h) => h.el("p")
})

type TipsShared = Component.Shared.Of<"Tips", { open: string | null }, typeof TipMessage.Type>

describe("shared state", () => {
  it("names an owner's requirement, which the owner itself doesn't carry", () => {
    expect<Component.Shared<typeof Tips>>().type.toBe<TipsShared>()
    expect<Component.Requirements<typeof Tips>>().type.toBe<never>()
    // Owners and other headless components alike.
    expect(Tips).type.toBeAssignableTo<Component.Headless.Any>()
    expect(Plain).type.toBeAssignableTo<Component.Headless.Any>()
  })

  it("puts the owner's requirement in a reader's and a sender's R", () => {
    expect<Component.Requirements<typeof Tip>>().type.toBe<TipsShared>()
    expect<Component.Requirements<typeof Sender>>().type.toBe<TipsShared>()
  })

  it("removes the requirement in the owner's closure only, and never with provide", () => {
    const def = Component.define({ name: "Host", model: Schema.Null, message: TipMessage, elements: Html })
    const Inside = def.make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => Tips(h, { key: "tips", view: () => Tip(h, { key: "a", props: { id: "a" } }) })
    })
    const Outside = def.make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => Tip(h, { key: "a", props: { id: "a" } })
    })
    expect<Component.Requirements<typeof Inside>>().type.toBe<never>()
    expect<Component.Requirements<typeof Outside>>().type.toBe<TipsShared>()
    const provided = Component.provide(Tip, Layer.empty as unknown as Layer.Layer<TipsShared>)
    expect<Component.Requirements<typeof provided>>().type.toBe<TipsShared>()
  })

  it("checks a send against the owner's receives", () => {
    Component.define({ name: "S", model: Schema.Null, message: TipMessage }).update((model, _msg, $) => {
      expect($.send(Tips, { _tag: "Enter", id: "a" })).type.not.toRaiseError()
      expect($.send).type.not.toBeCallableWith(Tips, { _tag: "Elapsed" })
      expect($.send).type.not.toBeCallableWith(Plain, { _tag: "Enter", id: "a" })
      return model
    })
  })

  it("rejects an owner that isn't headless, and a component in shared that isn't an owner", () => {
    const options = { init: () => null, update: (model: null) => model, view: (_: null, h: any) => h.el("p") }
    const NotOwner = Component.define({ name: "NotOwner", model: Schema.Null, message: TipMessage })
    expect(NotOwner.make).type.toBeCallableWith(options)
    const Drawn = Component.define({ name: "Drawn", model: Schema.Null, message: TipMessage, shares: () => 1 })
    expect(Drawn.make).type.not.toBeCallableWith(options)
    expect(Component.define).type.not.toBeCallableWith({
      name: "Bad",
      model: Schema.Null,
      message: TipMessage,
      shared: { plain: Plain }
    })
  })

  it("checks a scene's shared values against their owner", () => {
    const steps = Scene.start(Tip, { id: "a" })
    expect(steps.shared(Tips, { open: "a" })).type.not.toRaiseError()
    expect(steps.given(null, {}, [[Tips, { open: "a" }]])).type.not.toRaiseError()
    expect(steps.shared).type.not.toBeCallableWith(Tips, { open: 1 })
    expect(steps.shared).type.not.toBeCallableWith(Plain, null)
    expect(steps.given).type.not.toBeCallableWith(null, {}, [[Tips, { open: 1 }]])
  })

  it("takes an owner as a scene's component", () => {
    expect(Scene.make(Tips, {}, { elements: Html, view: (_, h) => h.span() }, () => {})).type.not.toRaiseError()
  })
})
