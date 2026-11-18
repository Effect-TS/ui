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
    reports: Schema.Boolean,
    onReports: (reports) => ProviderMessage.make({ _tag: "ChangedOpen", open: reports.includes(true) })
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
          // @ts-expect-error  This owner takes no reports
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

describe("reported", () => {
  it("takes the owner's reports in a scene of the owner", () => {
    Effect.gen(function*() {
      const s = yield* Scene.make(Provider, {}, { elements: Html, view: (_, h) => h.div })
      expect(s.reported).type.toBeCallableWith([true, false])
      expect(s.reported).type.not.toBeCallableWith(["open"])
    })
  })
})
