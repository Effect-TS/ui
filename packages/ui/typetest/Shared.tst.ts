import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Scene } from "@effect/ui/testing"
import { Layer, Schema } from "effect"
import { describe, expect, it } from "tstyche"

const TipsMessage = UiSchema.TaggedEnum({
  Enter: { id: Schema.String },
  Elapsed: {}
})

const TipsProvider = Component.define({
  name: "TipsProvider",
  props: Schema.Struct({ delay: Schema.optional(Schema.Number) }),
  model: Schema.Struct({ open: Schema.NullOr(Schema.String) }),
  message: TipsMessage,
  shares: { value: (model) => ({ open: model.open }), receives: ["Enter"] }
}).make({
  init: () => ({ open: null }),
  update: ($) => $.model
})

// Not an owner: it shares nothing.
const Plain = Component.define({
  name: "Plain",
  model: Schema.Null,
  message: TipsMessage
}).make({
  init: () => null,
  update: ($) => $.model,
  parts: () => ({})
})

const TipMessage = UiSchema.TaggedEnum({ Enter: { id: Schema.String } })

const Tip = Component.define({
  name: "Tip",
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Null,
  message: TipMessage,
  shared: { provider: TipsProvider },
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => {
    expect(h.shared.provider).type.toBe<{ open: string | null }>()
    return h.span()
  }
})

// Sends to the owner with no `shared` declaration.
const Sender = Component.define({
  name: "Sender",
  model: Schema.Null,
  message: TipMessage
}).make({
  init: () => null,
  update: ($, message) => $.send(TipsProvider, message),
  view: (h) => h.el("p")
})

type TipsShared = Component.Shared<"TipsProvider">

describe("shared state", () => {
  it("names an owner's requirement, which the owner itself doesn't carry", () => {
    expect<Component.Shared.Of<typeof TipsProvider>>().type.toBe<TipsShared>()
    expect<Component.Requirements<typeof TipsProvider>>().type.toBe<never>()
    // Owners and other headless components alike.
    expect(TipsProvider).type.toBeAssignableTo<Component.Headless.Any>()
    expect(Plain).type.toBeAssignableTo<Component.Headless.Any>()
  })

  it("puts the owner's requirement in a reader's and a sender's R", () => {
    expect<Component.Requirements<typeof Tip>>().type.toBe<TipsShared>()
    expect<Component.Requirements<typeof Sender>>().type.toBe<TipsShared>()
  })

  it("removes the requirement in the owner's closure only, and never with provide", () => {
    const def = Component.define({
      name: "Host",
      model: Schema.Null,
      message: TipMessage,
      elements: Html
    })
    const Inside = def.make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        TipsProvider(h, {
          key: "tips",
          view: (parts) => {
            expect(parts).type.toBe<{}>()
            return Tip(h, { key: "a", props: { id: "a" } })
          }
        })
    })
    const Outside = def.make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => Tip(h, { key: "a", props: { id: "a" } })
    })
    expect<Component.Requirements<typeof Inside>>().type.toBe<never>()
    expect<Component.Requirements<typeof Outside>>().type.toBe<TipsShared>()
    const provided = Component.provide(
      Tip,
      Layer.empty as unknown as Layer.Layer<TipsShared>
    )
    expect<Component.Requirements<typeof provided>>().type.toBe<TipsShared>()
  })

  it("types $.shared in update by the entries of shared, undefined for an optional owner", () => {
    const def = Component.define({
      name: "Reads",
      model: Schema.Null,
      message: TipMessage,
      shared: {
        provider: TipsProvider,
        maybe: { owner: TipsProvider, optional: true }
      }
    })
    def.update(($) => {
      expect($.shared).type.toBe<{
        readonly provider: { open: string | null }
        readonly maybe: { open: string | null } | undefined
      }>()
      return $.model
    })
    def.update("Enter", ($) => {
      expect($.shared.maybe).type.toBe<{ open: string | null } | undefined>()
      return $.model
    })
  })

  it("checks the schema of shares against its value", () => {
    const options = {
      name: "Owner",
      model: Schema.Struct({ n: Schema.Number }),
      message: TipMessage
    }
    expect(Component.define).type.toBeCallableWith({
      ...options,
      shares: {
        value: (model: { readonly n: number }) => model.n,
        schema: Schema.Number
      }
    })
    expect(Component.define).type.not.toBeCallableWith({
      ...options,
      shares: {
        value: (model: { readonly n: number }) => model.n,
        schema: Schema.String
      }
    })
  })

  it("checks a send against the owner's receives", () => {
    Component.define({
      name: "S",
      model: Schema.Null,
      message: TipMessage
    }).update(($) => {
      expect($.send(TipsProvider, { _tag: "Enter", id: "a" })).type.not
        .toRaiseError()
      expect($.send).type.not.toBeCallableWith(TipsProvider, {
        _tag: "Elapsed"
      })
      expect($.send).type.not.toBeCallableWith(Plain, {
        _tag: "Enter",
        id: "a"
      })
      return $.model
    })
  })

  it("rejects an owner that isn't headless, and a component in shared that isn't an owner", () => {
    const options = {
      init: () => null,
      update: ($: { readonly model: null }) => $.model,
      view: (h: any) => h.el("p")
    }
    const NotOwner = Component.define({
      name: "NotOwner",
      model: Schema.Null,
      message: TipMessage
    })
    expect(NotOwner.make).type.toBeCallableWith(options)
    const DrawnProvider = Component.define({
      name: "DrawnProvider",
      model: Schema.Null,
      message: TipMessage,
      shares: () => 1
    })
    expect(DrawnProvider.make).type.not.toBeCallableWith(options)
    expect(Component.define).type.not.toBeCallableWith({
      name: "Bad",
      model: Schema.Null,
      message: TipMessage,
      shared: { plain: Plain }
    })
  })

  it("checks a scene's shared values against their owner", () => {
    const steps = Scene.start(Tip, { id: "a" })
    expect(steps.shared(TipsProvider, { open: "a" })).type.not.toRaiseError()
    expect(steps.given(null, {}, [[TipsProvider, { open: "a" }]])).type.not
      .toRaiseError()
    expect(steps.shared).type.not.toBeCallableWith(TipsProvider, { open: 1 })
    expect(steps.shared).type.not.toBeCallableWith(Plain, null)
    expect(steps.given).type.not.toBeCallableWith(null, {}, [[TipsProvider, {
      open: 1
    }]])
  })

  it("takes an owner as a scene's component", () => {
    expect(
      Scene.make(TipsProvider, {}, { elements: Html, view: (_, h) => h.span() })
    ).type.not.toRaiseError()
  })

  it("allows omitting parts when shares is defined, and rejects omitting both view and parts otherwise", () => {
    expect<Component.Headless.Parts<typeof TipsProvider>>().type.toBe<{}>()

    const handlers = {
      init: () => null,
      update: ($: { readonly model: null }) => $.model
    }
    const PlainDef = Component.define({
      name: "PlainDef",
      model: Schema.Null,
      message: TipMessage
    })
    expect(PlainDef.make).type.not.toBeCallableWith(handlers)

    const SlottedProvider = Component.define({
      name: "SlottedProvider",
      model: Schema.Null,
      message: TipMessage,
      slots: ["body"],
      shares: () => 1
    })
    expect(SlottedProvider.make).type.not.toBeCallableWith(handlers)

    const enabled = Math.random() > 0.5
    const OwnerDef = Component.define({
      name: "OwnerDef",
      model: Schema.Null,
      message: TipMessage,
      shares: () => 1
    })
    expect(OwnerDef.make).type.not.toBeCallableWith({
      ...handlers,
      parts: enabled ? () => ({ label: "ok" }) : undefined
    })
    // @ts-expect-error Property 'parts' is missing
    OwnerDef.make<{ label: string }>(handlers)
  })
})

describe("a component that reads its own kind", () => {
  const NestMessage = UiSchema.TaggedEnum({
    ChangedBelow: { open: Schema.Number },
    ChangedAbove: {}
  })

  it("reads its own shares and reports its own collects, with no requirement", () => {
    const Nest = Component.define({
      name: "Nest",
      props: Schema.Struct({ open: Schema.Boolean }),
      model: Schema.Number,
      message: NestMessage,
      shares: {
        value: (_, props) => ({ open: props.open }),
        collects: {
          schema: Schema.Number,
          onChange: (counts) =>
            NestMessage.ChangedBelow({ open: counts.length })
        }
      },
      shared: {
        parent: {
          owner: "self",
          optional: true,
          report: (below, props) => {
            expect(below).type.toBe<number>()
            return props.open ? below + 1 : 0
          },
          onChange: (value) => {
            expect(value).type.toBe<{ open: boolean }>()
            return NestMessage.ChangedAbove()
          }
        }
      }
    }).make({
      init: () => 0,
      update: ($) => $.model,
      parts: (p) => {
        expect(p.shared.parent).type.toBe<{ open: boolean } | undefined>()
        return {}
      }
    })
    expect<Component.Requirements<typeof Nest>>().type.toBe<never>()
  })

  it("rejects a read of its own kind that isn't optional, reports what it doesn't collect, or shares nothing", () => {
    expect(Component.define).type.not.toBeCallableWith({
      name: "Required",
      model: Schema.Null,
      message: NestMessage,
      shares: () => ({ open: true }),
      shared: { parent: { owner: "self" as const } }
    })
    expect(Component.define).type.not.toBeCallableWith({
      name: "Uncollected",
      model: Schema.Null,
      message: NestMessage,
      shares: () => ({ open: true }),
      shared: {
        parent: {
          owner: "self" as const,
          optional: true as const,
          report: () => 1
        }
      }
    })
    const Bare = Component.define({
      name: "Bare",
      model: Schema.Null,
      message: NestMessage,
      shared: { parent: { owner: "self", optional: true } }
    })
    expect(Bare.make).type.not.toBeCallableWith({
      init: () => null,
      update: ($: { readonly model: null }) => $.model,
      parts: () => ({})
    })
  })
})
