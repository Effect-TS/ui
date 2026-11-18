import { Component } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Scene } from "@effect/ui/testing"
import { Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"

const ProviderMessage = Schema.TaggedUnion({
  ChangedOpen: { open: Schema.Boolean },
  Completed: {}
})

const Provider = Component.define({
  name: "Provider",
  props: Schema.Struct({ timeout: Schema.optional(Schema.Number) }),
  model: Schema.Struct({ open: Schema.Boolean, instant: Schema.Boolean }),
  message: ProviderMessage,
  receives: ["Completed"],
  shares: {
    value: (model) => ({ open: model.open, instant: model.instant }),
    collects: {
      schema: Schema.Boolean,
      onChange: (collected) => ProviderMessage.make({ _tag: "ChangedOpen", open: collected.includes(true) })
    }
  }
}).make({
  init: () => ({ open: false, instant: false }),
  update: (model) => model,
  parts: () => ({})
})

const Plain = Component.define({
  name: "Plain",
  model: Schema.Null,
  message: Schema.Never,
  shares: (model) => ({ model })
}).make({
  init: () => null,
  update: (model) => model,
  parts: () => ({})
})

const TipMessage = Schema.TaggedUnion({ Entered: {}, Completed: {} })

const Tip = Component.define({
  name: "Tip",
  props: Schema.Struct({ open: Schema.Boolean }),
  model: Schema.Struct({ hovered: Schema.Boolean }),
  message: TipMessage,
  shared: {
    provider: {
      owner: Provider,
      optional: true,
      report: (model, props) => {
        expect(model).type.toBe<{ readonly hovered: boolean }>()
        return props.open
      },
      onChange: (value) => {
        expect(value).type.toBe<{ open: boolean; instant: boolean }>()
        return TipMessage.make({ _tag: "Entered" })
      }
    }
  },
  elements: Html
}).make({
  init: () => ({ hovered: false }),
  update: (model, _, $) => $.set(model).send(Provider, { _tag: "Completed" }),
  view: (_, h) => {
    expect(h.shared.provider).type.toBe<{ open: boolean; instant: boolean } | undefined>()
    return h.span()
  }
})

const Required = Component.define({
  name: "Required",
  model: Schema.Null,
  message: Schema.Never,
  shared: { provider: { owner: Provider, report: () => true }, plain: Plain }
}).make({
  init: () => null,
  update: (model) => model,
  parts: (_, p) => {
    expect(p.shared.provider).type.toBe<{ open: boolean; instant: boolean }>()
    expect(p.shared.plain).type.toBe<{ model: null }>()
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
      Component.Shared<typeof Provider> | Component.Shared<typeof Plain>
    >()
  })
  it("keeps a supplied map with a string index", () => {
    const reads: Readonly<Record<string, typeof Provider>> = { provider: Provider }
    const Indexed = Component.define({ name: "Indexed", model: Schema.Null, message: Schema.Never, shared: reads })
      .make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => {
          // `| undefined` from the index signature, as for any record.
          expect(h.shared["provider"]).type.toBe<{ open: boolean; instant: boolean } | undefined>()
          return h.text("")
        }
      })
    expect<Component.Requirements<typeof Indexed>>().type.toBe<Component.Shared<typeof Provider>>()
  })
  it("keeps the required owner of a child below an optional read", () => {
    const Child = Component.define({
      name: "Child",
      model: Schema.Null,
      message: Schema.Never,
      shared: { p: Provider }
    })
      .make({ init: () => null, update: (model) => model, view: (_, h) => h.text("") })
    const Wrapper = Component.define({
      name: "Wrapper",
      model: Schema.Null,
      message: TipMessage,
      shared: { p: { owner: Provider, optional: true } }
    }).make({
      init: () => null,
      update: (model, _, $) => $.set(model).send(Provider, { _tag: "Completed" }),
      view: (_, h) => Child(h, { key: "c" })
    })
    expect<Component.Requirements<typeof Wrapper>>().type.toBe<Component.Shared<typeof Provider>>()
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
      shared: {
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
      shared: {
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
      shared: {
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
      // @ts-expect-error  A component in shared must be a headless component with shares
      shared: { plain: { owner: Tip } }
    })
  })
})

describe("collected", () => {
  it("takes the owner's reports in a scene of the owner", () => {
    Effect.gen(function*() {
      const s = yield* Scene.make(Provider, {}, { elements: Html, view: (_, h) => h.div })
      expect(s.collected).type.toBeCallableWith([true, false])
      expect(s.collected).type.not.toBeCallableWith(["open"])
    })
  })
})
