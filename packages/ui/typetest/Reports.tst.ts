import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Scene } from "@effect/ui/testing"
import { Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"

const ProviderMessage = UiSchema.TaggedEnum({
  ChangedOpen: { open: Schema.Boolean },
  Completed: {}
})

const Provider = Component.define({
  name: "Provider",
  props: Schema.Struct({ timeout: Schema.optional(Schema.Number) }),
  model: Schema.Struct({ open: Schema.Boolean, instant: Schema.Boolean }),
  message: ProviderMessage,
  shares: {
    value: (model) => ({ open: model.open, instant: model.instant }),
    receives: ["Completed"],
    collects: {
      schema: Schema.Boolean,
      onChange: (collected) =>
        ProviderMessage.ChangedOpen({ open: collected.includes(true) })
    }
  }
}).make({
  init: () => ({ open: false, instant: false }),
  update: ($) => $.model,
  parts: () => ({})
})

const Plain = Component.define({
  name: "Plain",
  model: Schema.Null,
  message: Schema.Never,
  shares: (model) => ({ model })
}).make({
  init: () => null,
  update: ($) => $.model,
  parts: () => ({})
})

const TipMessage = UiSchema.TaggedEnum({ Entered: {}, Completed: {} })

const Tip = Component.define({
  name: "Tip",
  props: Schema.Struct({ open: Schema.Boolean }),
  model: Schema.Struct({ hovered: Schema.Boolean }),
  message: TipMessage,
  reads: {
    provider: {
      owner: Provider,
      optional: true,
      report: (model, props) => {
        expect(model).type.toBe<{ readonly hovered: boolean }>()
        return props.open
      },
      onChange: (value) => {
        expect(value).type.toBe<{ open: boolean; instant: boolean }>()
        return TipMessage.Entered()
      }
    }
  },
  elements: Html
}).make({
  init: () => ({ hovered: false }),
  update: ($) => $.send(Provider, { _tag: "Completed" }),
  view: (h) => {
    expect(h.reads.provider).type.toBe<
      { open: boolean; instant: boolean } | undefined
    >()
    return h.span()
  }
})

const Required = Component.define({
  name: "Required",
  model: Schema.Null,
  message: Schema.Never,
  reads: { provider: { owner: Provider, report: () => true }, plain: Plain }
}).make({
  init: () => null,
  update: ($) => $.model,
  parts: (p) => {
    expect(p.reads.provider).type.toBe<{ open: boolean; instant: boolean }>()
    expect(p.reads.plain).type.toBe<{ model: null }>()
    return {}
  }
})

describe("reports", () => {
  it("types the owner", () => {
    expect<Component.Shared.Report<typeof Provider>>().type.toBe<boolean>()
    expect<Component.Shared.Report<typeof Plain>>().type.toBe<never>()
  })
  it("drops optional requirements", () => {
    expect<Component.Requirements<typeof Tip>>().type.toBe<never>()
    expect<Component.Headless.Requirements<typeof Required>>().type.toBe<
      Component.Shared.Of<typeof Provider> | Component.Shared.Of<typeof Plain>
    >()
  })
  it("only makes sends to the optional owner optional", () => {
    const B = Component.define({
      name: "Provider",
      model: Schema.Null,
      message: TipMessage,
      shares: { value: () => 1, receives: ["Entered"] }
    }).make({ init: () => null, update: ($) => $.model, parts: () => ({}) })
    const sender = Component.define({
      name: "Sender",
      model: Schema.Null,
      message: TipMessage,
      reads: { a: { owner: Provider, optional: true } }
    })
    const sendsB = sender.make({
      init: () => null,
      update: ($) => $.send(B, { _tag: "Entered" }),
      parts: () => ({})
    })
    const widened = sender.make({
      init: () => null,
      update: (
        $
      ): Component.Step<
        null,
        typeof TipMessage.Type,
        never,
        Component.Shared<"Provider">
      > => $.send(Provider, { _tag: "Completed" }),
      view: (h) => h.text("")
    })
    expect<Component.Requirements<typeof widened>>().type.toBe<
      Component.Shared<"Provider">
    >()
    expect<Component.Headless.Requirements<typeof sendsB>>().type.toBe<
      Component.Shared<"Provider">
    >()
  })
  it("keeps a supplied map with a string index", () => {
    const reads: Readonly<Record<string, typeof Provider>> = {
      provider: Provider
    }
    const Indexed = Component.define({
      name: "Indexed",
      model: Schema.Null,
      message: Schema.Never,
      reads
    })
      .make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => {
          // `| undefined` from the index signature, as for any record.
          expect(h.reads["provider"]).type.toBe<
            { open: boolean; instant: boolean } | undefined
          >()
          return h.text("")
        }
      })
    expect<Component.Requirements<typeof Indexed>>().type.toBe<
      Component.Shared.Of<typeof Provider>
    >()
  })
  it("keeps the required owner of a child below an optional read", () => {
    const Child = Component.define({
      name: "Child",
      model: Schema.Null,
      message: Schema.Never,
      reads: { p: Provider }
    })
      .make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.text("")
      })
    const Wrapper = Component.define({
      name: "Wrapper",
      model: Schema.Null,
      message: TipMessage,
      reads: { p: { owner: Provider, optional: true } }
    }).make({
      init: () => null,
      update: ($) => $.send(Provider, { _tag: "Completed" }),
      view: (h) => Child(h, { key: "c" })
    })
    expect<Component.Requirements<typeof Wrapper>>().type.toBe<
      Component.Shared.Of<typeof Provider>
    >()
  })
  it("rejects collects without its onChange", () => {
    Component.define({
      name: "Bad",
      model: Schema.Null,
      message: ProviderMessage,
      shares: {
        value: () => null,
        // @ts-expect-error  Property 'onChange' is missing
        collects: { schema: Schema.Boolean }
      }
    })
  })
  it("rejects a bad report", () => {
    Component.define({
      name: "Bad",
      model: Schema.Null,
      message: Schema.Never,
      reads: {
        provider: {
          owner: Provider,
          // @ts-expect-error  Type 'string' is not assignable to type 'boolean'
          report: () => "x"
        }
      }
    })
    Component.define({
      name: "Bad",
      model: Schema.Null,
      message: Schema.Never,
      reads: {
        plain: {
          owner: Plain,
          // @ts-expect-error  This owner collects no reports
          report: () => true
        }
      }
    })
    Component.define({
      name: "Bad",
      model: Schema.Null,
      message: TipMessage,
      reads: {
        provider: {
          owner: Provider,
          // @ts-expect-error  is not assignable to type '{ readonly _tag: "Completed"; } | { readonly _tag: "Entered"; }'
          onChange: () => ({ _tag: "Other" })
        }
      }
    })
    Component.define({
      name: "Bad",
      model: Schema.Null,
      message: TipMessage,
      // @ts-expect-error  A component in reads must be a headless component with shares
      reads: { plain: { owner: Tip } }
    })
  })
})

describe("collected", () => {
  it("takes the owner's reports in a scene of the owner", () => {
    Effect.gen(function*() {
      const scene = yield* Scene.make(Provider, {}, {
        elements: Html,
        view: (_, h) => h.div
      })
      expect(scene.collected).type.toBeCallableWith([true, false])
      expect(scene.collected).type.not.toBeCallableWith(["open"])
    })
  })
})
