import { Component, Feature, Router, UiSchema, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Scene } from "@effect/ui/testing"
import { Layer, Schema } from "effect"
import { describe, expect, it } from "tstyche"

const NoteId = Schema.String.pipe(Schema.brand("NoteId"))
type NoteId = typeof NoteId.Type

const EditorMessage = UiSchema.TaggedEnum({ Focus: {}, Typed: { text: Schema.String } })
const EditorEvents = UiSchema.TaggedEnum({ Saved: { id: Schema.String } })

const NoteEditor = Component.define({
  name: "NoteEditor",
  scoped: true,
  props: Schema.Struct({ noteId: Schema.String }),
  model: Schema.String,
  message: EditorMessage,
  events: EditorEvents,
  receives: ["Focus"],
  elements: Html
}).make({
  init: () => "",
  update: (text, message) => message._tag === "Typed" ? message.text : text,
  view: (text, h) => h.textarea().value(text)
})

const ProfileForm = Component.define({ name: "ProfileForm", scoped: true, model: Schema.String, message: Schema.Never })
  .make({ init: () => "", update: (model) => model, view: (text, h) => h.el("p", text) })

const BillingForm = Component.define({ name: "BillingForm", scoped: true, model: Schema.String, message: Schema.Never })
  .make({ init: () => "", update: (model) => model, view: (text, h) => h.el("p", text) })

const Tooltip = Component.define({ name: "Tooltip", scoped: false, model: Schema.Null, message: Schema.Never })
  .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("span") })

const Message = UiSchema.TaggedEnum({ Saved: { id: Schema.String } })
type Message = typeof Message.Type

const Model = Schema.Struct({
  tab: Schema.Literals(["profile", "notes"]),
  notes: Schema.Record(Schema.String, Schema.Struct({ title: Schema.String })),
  selected: Schema.UndefinedOr(NoteId),
  order: Schema.Array(Schema.String)
})

const AppDef = Component.define({
  name: "App",
  scoped: false,
  props: Schema.Struct({ projectId: Schema.String }),
  model: Model,
  message: Message,
  elements: Html
})
type H = Component.Helper<typeof AppDef>

declare const h: H
declare const model: typeof Model.Type
declare const id: string
declare const condition: boolean

describe("scoped", () => {
  it("defines a ScopedComponent with scoped: true and a Component with scoped: false", () => {
    expect(NoteEditor).type.toBeAssignableTo<
      Component.Scoped<
        { readonly noteId: string },
        typeof EditorEvents.Type,
        never,
        Extract<typeof EditorMessage.Type, { readonly _tag: "Focus" }>
      >
    >()
    expect(Tooltip).type.toBeAssignableTo<Component.Any>()
    expect(NoteEditor).type.not.toBeAssignableTo<Component.Any>()
    expect(NoteEditor).type.toBeAssignableTo<Component.Scoped.Any>()
    expect<Component.Props<typeof NoteEditor>>().type.toBe<{ readonly noteId: string }>()
    expect<Component.Model<typeof NoteEditor>>().type.toBe<string>()
  })

  it("keeps a provided component scoped or unscoped", () => {
    const erasedScoped: Component.Scoped.Any = ProfileForm
    const erased: Component.Any = Tooltip
    expect(Component.provide(erasedScoped, Layer.empty)).type.toBe<Component.Scoped.Any>()
    expect(Component.provide(erased, Layer.empty)).type.toBe<Component.Any>()
    expect(Component.provide(ProfileForm, Layer.empty)).type.toBe<typeof ProfileForm>()
  })

  it("needs scoped on every definition", () => {
    // @ts-expect-error Property 'scoped' is missing
    Component.define({ name: "Bare", model: Schema.Null, message: Schema.Never })
  })

  it("writes scoped children inside h.scoped, and returns what the content returns", () => {
    expect(h.scoped((s) => ProfileForm(s, {}))).type.toBe<View.Child<Message, never>>()
    expect(
      h.scoped((s) =>
        h.div(
          ProfileForm(s, { key: "billing" }),
          ProfileForm(s, { key: "shipping" }),
          NoteEditor(s, { key: "draft", props: { noteId: "a" } }),
          Tooltip(s, {})
        )
      )
    ).type.not.toRaiseError()
    expect(
      h.scoped(({ model, key }) => key in model.notes, (s) =>
        model.selected !== undefined &&
        NoteEditor(s, {
          key: model.selected,
          props: { noteId: model.selected },
          onEmit: { Saved: (e) => Message.Saved({ id: e.id }) }
        }))
    ).type.toBe<false | View.Child<Message, never>>()
    expect(
      h.scoped(
        ($) => $.queries !== undefined && $.props.projectId !== "" && $.key in $.model.notes,
        (s) => model.order.map((id) => NoteEditor(s, { key: `note-${id}`, props: { noteId: id } }))
      )
    ).type.not.toRaiseError()
  })

  it("types the predicate from the Model, props and queries of the component that writes the scope", () => {
    h.scoped(($) => {
      expect($).type.toBe<Component.Alive<typeof Model.Type, { readonly projectId: string }, {}>>()
      return true
    }, (s) => ProfileForm(s, {}))
    // @ts-expect-error Property 'nope' does not exist
    h.scoped(({ model }) => model.nope, (s) => ProfileForm(s, {}))
  })

  it("takes refs, and refs at a key that isn't a literal only in a scope with a predicate", () => {
    const Editors = NoteEditor.ref("Editors")
    expect(h.scoped((s) => NoteEditor(s, { ref: Editors, props: { noteId: "a" } }))).type.not.toRaiseError()
    expect(h.scoped((s) => NoteEditor(s, { ref: Editors.at("main"), props: { noteId: "a" } }))).type.not
      .toRaiseError()
    expect(h.scoped((s) => NoteEditor(s, { ref: Editors.at(1), props: { noteId: "a" } }))).type.not.toRaiseError()
    expect(h.scoped(({ key }) => key !== "", (s) => NoteEditor(s, { ref: Editors.at(id), props: { noteId: id } })))
      .type.not.toRaiseError()
    expect(Editors.at("main")).type.toBe<
      Component.Ref<Extract<typeof EditorMessage.Type, { readonly _tag: "Focus" }>, false>
    >()
    expect(Editors.at(id)).type.toBe<
      Component.Ref<Extract<typeof EditorMessage.Type, { readonly _tag: "Focus" }>, boolean>
    >()
    expect(Editors.at(id).at("a")).type.toBe<
      Component.Ref<Extract<typeof EditorMessage.Type, { readonly _tag: "Focus" }>, boolean>
    >()
    // @ts-expect-error "~dynamicKey"
    h.scoped((s) => NoteEditor(s, { ref: Editors.at(id), props: { noteId: id } }))
    // @ts-expect-error "~dynamicKey"
    h.scoped((s) => NoteEditor(s, { ref: Editors.at(model.order.length), props: { noteId: id } }))
    // @ts-expect-error "~dynamicKey"
    h.scoped((s) => NoteEditor(s, { ref: Editors.at(id as "pinned" | `row-${string}`), props: { noteId: id } }))
    // @ts-expect-error "~dynamicKey"
    h.scoped((s) => NoteEditor(s, { ref: NoteEditor.ref(id), props: { noteId: id } }))
    type Focus = Extract<typeof EditorMessage.Type, { readonly _tag: "Focus" }>
    const forwarded = (ref: Component.Ref.Within<Focus>) =>
      // @ts-expect-error "~dynamicKey"
      h.scoped((s) => NoteEditor(s, { ref, props: { noteId: id } }))
    const bounded = (ref: Component.Ref.Within<Focus, false>) =>
      h.scoped((s) => NoteEditor(s, { ref, props: { noteId: id } }))
    expect(bounded).type.toBeCallableWith(Editors.at("main"))
    expect(bounded).type.not.toBeCallableWith(Editors.at(id))
    expect(forwarded).type.toBeCallableWith(Editors.at(id))
  })

  it("rejects a scoped component called with h", () => {
    // @ts-expect-error "written inside h.scoped((s) => ...)"
    ProfileForm(h, {})
  })

  it("needs a predicate for a key that isn't a literal", () => {
    // @ts-expect-error A scoped child whose key isn't a literal needs a predicate
    h.scoped((s) => model.order.map((id) => NoteEditor(s, { key: id, props: { noteId: id } })))
    // @ts-expect-error A scoped child whose key isn't a literal needs a predicate
    h.scoped((s) => NoteEditor(s, { key: model.selected!, props: { noteId: "a" } }))
    // @ts-expect-error A scoped child whose key isn't a literal needs a predicate
    h.scoped((s) => NoteEditor(s, { key: `note-${id}`, props: { noteId: id } }))
    const mixed = id as "a" | (string & {})
    // @ts-expect-error A scoped child whose key isn't a literal needs a predicate
    h.scoped((s) => NoteEditor(s, { key: mixed, props: { noteId: id } }))
    // @ts-expect-error A scoped child whose key isn't a literal needs a predicate
    h.scoped((s) => NoteEditor(s, { key: id as "pinned" | `row-${string}`, props: { noteId: id } }))
    const literal = id as "a" | "b"
    expect(h.scoped((s) => NoteEditor(s, { key: literal, props: { noteId: id } }))).type.not.toRaiseError()
  })

  it("checks props", () => {
    // @ts-expect-error Argument of type '{}' is not assignable
    h.scoped((s) => NoteEditor(s, {}))
  })

  it("types a function that takes s by the scope it needs", () => {
    const row = (s: View.Scope<Message, true>, id: string) => NoteEditor(s, { key: id, props: { noteId: id } })
    const one = (s: View.Scope<Message>) => ProfileForm(s, {})
    expect(h.scoped(({ model, key }) => key in model.notes, (s) => [model.order.map((id) => row(s, id)), one(s)]))
      .type.not.toRaiseError()
    expect(h.scoped((s) => one(s))).type.not.toRaiseError()
    // @ts-expect-error Type 'false' is not assignable to type 'true'
    h.scoped((s) => row(s, "a"))
    const unchecked = (s: View.Scope<Message>) =>
      // @ts-expect-error A scoped child whose key isn't a literal needs a predicate
      NoteEditor(s, { key: id, props: { noteId: id } })
    expect(unchecked).type.toBeCallableWith(h as unknown as View.Scope<Message, false>)
  })

  it("gives s no scoped, so scopes don't nest", () => {
    expect(h).type.toHaveProperty("scoped")
    h.scoped((s) => expect(s).type.not.toHaveProperty("scoped"))
  })

  it("calls a union of scoped components", () => {
    const either = condition ? ProfileForm : BillingForm
    expect(h.scoped((s) => either(s, {}))).type.toBe<View.Child<Message, never>>()
  })

  it("mounts a scoped component as a root, in a Scene or as a route's page", () => {
    expect(Scene.start(ProfileForm, {})).type.not.toRaiseError()
    expect(Router.page(NoteEditor, { noteId: "a" })).type.not.toRaiseError()
  })

  it("types a component whose scoped flag isn't known to be false as scoped", () => {
    const options = { name: "Wide" as const, scoped: true, model: Schema.Null, message: Schema.Never }
    const Wide = Component.define(options).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => h.el("p")
    })
    // @ts-expect-error "written inside h.scoped((s) => ...)"
    Wide(h, {})
    expect(h.scoped((s) => Wide(s, {}))).type.not.toRaiseError()
    class Notes extends Feature.Service<Notes>()("Notes", { props: Schema.Struct({}) }) {}
    // @ts-expect-error "written inside h.scoped((s) => ...)"
    Notes.toLayer(Wide)
  })

  it("rejects scoped: true on a headless component", () => {
    const Def = Component.define({ name: "Headless", scoped: true, model: Schema.Null, message: Schema.Never })
    // @ts-expect-error No overload matches this call
    Def.make({ init: () => null, update: (model) => model, parts: () => ({}) })
  })

  it("rejects a scoped implementation of a feature", () => {
    class Notes extends Feature.Service<Notes>()("Notes", { props: Schema.Struct({}) }) {}
    // @ts-expect-error "written inside h.scoped((s) => ...)"
    Notes.toLayer(ProfileForm)
  })
})
