import { Child, Component, Router, UiSchema, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Scene } from "@effect/ui/testing"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, { readonly now: number }>()("typetest/children/Clock") {}

const FormMessage = UiSchema.TaggedEnum({ Typed: { value: Schema.String } })
const FormEvents = UiSchema.TaggedEnum({ Saved: { id: Schema.String } })
const FormDef = Component.define({
  name: "ProfileForm",
  lifetime: "model",
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.String,
  message: FormMessage,
  events: FormEvents,
  elements: Html
})
const ProfileForm = FormDef.make({
  init: () => "",
  update: (_, message) => message.value,
  view: (draft, h) => h.p(draft)
})
const Tooltip = Component.define({
  name: "Tooltip",
  lifetime: "view",
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.String,
  message: FormMessage,
  elements: Html
}).make({ init: () => "", update: (_, message) => message.value, view: (text, h) => h.p(text) })
const Panel = Component.define({
  name: "Panel",
  lifetime: "model",
  model: Schema.Null,
  message: Schema.Never,
  slots: ["body"]
})
  .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("section", h.slots.body) })
declare const Ticker: Component.Component<"Ticker", {}, null, never, never, Clock, never, {}, never, never, "model">

const PageMessage = UiSchema.TaggedEnum({ Saved: { id: Schema.String } })
type PageMessage = typeof PageMessage.Type
declare const h: View.Helper<PageMessage, unknown>
const Kit = { ProfileForm, Tooltip }

const PageDef = Component.define({
  name: "Page",
  lifetime: "view",
  model: Schema.Struct({ selected: Schema.NullOr(Schema.String), order: Schema.Array(Schema.String) }),
  message: PageMessage,
  elements: Html
})

describe("lifetime", () => {
  it("is required", () => {
    // @ts-expect-error Property 'lifetime' is missing
    Component.define({ name: "Bare", model: Schema.Null, message: Schema.Never })
  })

  it("rejects a direct call of a model component, with the rule", () => {
    // @ts-expect-error A component with lifetime 'model' is declared in `children` and placed with h.children
    ProfileForm(h, { props: { id: "a" } })
    // @ts-expect-error A component with lifetime 'model' is declared in `children` and placed with h.children
    Kit.ProfileForm(h, { props: { id: "a" } })
    // The rule is reported when the props are wrong too.
    // @ts-expect-error A component with lifetime 'model' is declared in `children` and placed with h.children
    ProfileForm(h, { props: { id: 1 } })
    const either = Math.random() > 0.5 ? ProfileForm : Tooltip
    // @ts-expect-error A component with lifetime 'model' is declared in `children` and placed with h.children
    either(h, { props: { id: "a" } })
  })

  it("calls a view component and an erased one", () => {
    expect(Tooltip(h, { props: { id: "a" } })).type.toBe<View.Child<PageMessage, never>>()
    expect(Kit.Tooltip(h, { props: { id: "a" } })).type.toBe<View.Child<PageMessage, never>>()
    // Not caught by the types: the full change checks it at runtime.
    const erased: Component.Any = ProfileForm
    expect(erased(h, { props: {} })).type.not.toRaiseError()
  })

  it("passes a model component as a value", () => {
    expect(Router.page(ProfileForm, { id: "a" })).type.not.toRaiseError()
    expect(Scene.make(ProfileForm, { id: "a" })).type.not.toRaiseError()
    expect<Component.LifetimeOf<typeof ProfileForm>>().type.toBe<"model">()
  })

  it("rejects a model headless component", () => {
    Component.define({ name: "Listbox", lifetime: "model", model: Schema.Null, message: Schema.Never }).make({
      init: () => null,
      update: (model) => model,
      // @ts-expect-error A headless component is written where it is placed, so its lifetime is 'view'
      parts: () => ({})
    })
  })
})

describe("children", () => {
  it("types props and onEmit from the parent's Model and message, and h.children from the entries", () => {
    const Page = PageDef.make({
      children: {
        profile: Child.one(ProfileForm, {
          props: (model) => ({ id: model.selected ?? "none" }),
          onEmit: { Saved: (event) => PageMessage.Saved({ id: event.id }) }
        }),
        editor: Child.optional(ProfileForm, { props: (model) => model.selected !== null && { id: model.selected } }),
        rows: Child.keyed(ProfileForm, { props: (model) => model.order.map((id) => [id, { id }]) }),
        ticker: Ticker,
        panel: Panel
      },
      init: () => ({ selected: null, order: [] }),
      update: (model) => model,
      view: (model, h) => {
        expect(h.children.profile).type.toBe<() => View.Child<PageMessage, never>>()
        expect(h.children.editor).type.toBe<(() => View.Child<PageMessage, never>) | undefined>()
        expect(h.children.rows).type.toBe<(key: string) => View.Child<PageMessage, never>>()
        expect(h.children.panel({ slots: { body: "text" } })).type.toBe<View.Child<PageMessage, never>>()
        return h.main(
          model.order.map((id) => h.children.rows(id)),
          model.selected === null ? h.children.profile() : h.children.editor?.()
        )
      }
    })
    // A listed child lives whether or not it's shown, so its requirements are the parent's.
    expect<Component.Requirements<typeof Page>>().type.toBe<Clock>()
  })

  it("rejects a view component and wrong props", () => {
    // @ts-expect-error A component with lifetime 'view' is called in a view, not listed in `children`
    Child.one(Tooltip, { props: () => ({ id: "a" }) })
    // Listed bare, the error is on the whole `make`, so its callbacks are annotated here.
    const init = () => ({ selected: null, order: [] })
    const view = (_: unknown, h: Component.Helper<typeof PageDef>) => h.main()
    // @ts-expect-error A component with lifetime 'view' is called in a view, not listed in `children`
    PageDef.make({ children: { tip: Tooltip }, init, update: (model: typeof PageDef.model.Type) => model, view })
    // @ts-expect-error Type 'number' is not assignable to type 'string'
    Child.one(ProfileForm, { props: () => ({ id: 1 }) })
  })
})
