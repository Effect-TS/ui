import { Component, UiSchema, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

const NoteId = Schema.String.pipe(Schema.brand("NoteId"))
type NoteId = typeof NoteId.Type

const EditorMessage = UiSchema.TaggedEnum({
  Focus: {},
  Typed: { text: Schema.String }
})
const EditorEvents = UiSchema.TaggedEnum({ Saved: { id: Schema.String } })

const NoteEditor = Component.define({
  name: "NoteEditor",
  props: Schema.Struct({ noteId: Schema.String }),
  model: Schema.String,
  message: EditorMessage,
  events: EditorEvents,
  elements: Html
}).make({
  init: () => "",
  update: ($, message) => message._tag === "Typed" ? message.text : $.model,
  view: (h, text) => h.textarea([]).value(text)
})

const ProfileForm = Component.define({
  name: "ProfileForm",
  model: Schema.String,
  message: Schema.Never
})
  .make({
    init: () => "",
    update: ($) => $.model,
    view: (h, text) => h.el("p", [text])
  })

const Tooltip = Component.define({
  name: "Tooltip",
  model: Schema.Null,
  message: Schema.Never
})
  .make({ init: () => null, update: ($) => $.model, view: (h) => h.el("span") })

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

describe("keepAlive", () => {
  it("writes keep-alive children inside h.keepAlive, and returns what the content returns", () => {
    expect(h.keepAlive((s) => ProfileForm(s, {}))).type.toBe<
      View.Child<Message, never>
    >()
    expect(
      h.keepAlive((s) =>
        h.div([
          ProfileForm(s, { key: "billing" }),
          ProfileForm(s, { key: "shipping" }),
          NoteEditor(s, { key: "draft", props: { noteId: "a" } }),
          Tooltip(s, {})
        ])
      )
    ).type.not.toRaiseError()
    expect(
      h.keepAlive(
        ({ model, key }) => key in model.notes,
        (s) =>
          model.selected !== undefined &&
          NoteEditor(s, {
            key: model.selected,
            props: { noteId: model.selected },
            onEmit: { Saved: (e) => Message.Saved({ id: e.id }) }
          })
      )
    ).type.toBe<false | View.Child<Message, never>>()
    expect(
      h.keepAlive(
        ($) =>
          $.queries !== undefined && $.props.projectId !== "" &&
          $.key in $.model.notes,
        (s) =>
          model.order.map((id) =>
            NoteEditor(s, { key: `note-${id}`, props: { noteId: id } })
          )
      )
    ).type.not.toRaiseError()
  })

  it("types the predicate from the Model, props and queries of the component that writes the block", () => {
    h.keepAlive(($) => {
      expect($).type.toBe<
        Component.Alive<typeof Model.Type, { readonly projectId: string }, {}>
      >()
      return true
    }, (s) => ProfileForm(s, {}))
    // @ts-expect-error Property 'nope' does not exist
    h.keepAlive(({ model }) => model.nope, (s) => ProfileForm(s, {}))
  })

  it("calls any component with h, whose key isn't checked", () => {
    expect(ProfileForm(h, {})).type.toBe<View.Child<Message, never>>()
    expect(NoteEditor(h, { key: id, props: { noteId: id } })).type.not
      .toRaiseError()
  })

  it("needs a predicate for a key that isn't a literal", () => {
    h.keepAlive((s) =>
      // @ts-expect-error A keep-alive child whose key isn't a literal needs a predicate
      model.order.map((id) => NoteEditor(s, { key: id, props: { noteId: id } }))
    )
    h.keepAlive((s) =>
      // @ts-expect-error A keep-alive child whose key isn't a literal needs a predicate
      NoteEditor(s, { key: model.selected!, props: { noteId: "a" } })
    )
    h.keepAlive((s) =>
      // @ts-expect-error A keep-alive child whose key isn't a literal needs a predicate
      NoteEditor(s, { key: `note-${id}`, props: { noteId: id } })
    )
    const mixed = id as "a" | (string & {})
    // @ts-expect-error A keep-alive child whose key isn't a literal needs a predicate
    h.keepAlive((s) => NoteEditor(s, { key: mixed, props: { noteId: id } }))
    h.keepAlive((s) =>
      NoteEditor(s, {
        // @ts-expect-error A keep-alive child whose key isn't a literal needs a predicate
        key: id as "pinned" | `row-${string}`,
        props: { noteId: id }
      })
    )
    const literal = id as "a" | "b"
    expect(
      h.keepAlive((s) => NoteEditor(s, { key: literal, props: { noteId: id } }))
    ).type.not.toRaiseError()
  })

  it("checks props", () => {
    // @ts-expect-error Argument of type '{}' is not assignable
    h.keepAlive((s) => NoteEditor(s, {}))
  })

  it("types a function that takes s by the block it needs", () => {
    const row = (s: View.KeepAlive<Message, true>, id: string) =>
      NoteEditor(s, { key: id, props: { noteId: id } })
    const one = (s: View.KeepAlive<Message>) => ProfileForm(s, {})
    expect(
      h.keepAlive(({ model, key }) => key in model.notes, (s) => [
        model.order.map((id) => row(s, id)),
        one(s)
      ])
    )
      .type.not.toRaiseError()
    expect(h.keepAlive((s) => one(s))).type.not.toRaiseError()
    // @ts-expect-error Type 'false' is not assignable to type 'true'
    h.keepAlive((s) => row(s, "a"))
    const unchecked = (s: View.KeepAlive<Message>) =>
      // @ts-expect-error A keep-alive child whose key isn't a literal needs a predicate
      NoteEditor(s, { key: id, props: { noteId: id } })
    expect(unchecked).type.toBeCallableWith(
      h as unknown as View.KeepAlive<Message, false>
    )
  })

  it("gives s no keepAlive, so blocks don't nest", () => {
    expect(h).type.toHaveProperty("keepAlive")
    h.keepAlive((s) => expect(s).type.not.toHaveProperty("keepAlive"))
  })

  it("calls a union of components", () => {
    const either = condition ? ProfileForm : Tooltip
    expect(h.keepAlive((s) => either(s, {}))).type.toBe<
      View.Child<Message, never>
    >()
  })

  it("calls a headless component with s as with h", () => {
    const Headless = Component.define({
      name: "Headless",
      model: Schema.Null,
      message: Schema.Never
    }).make({ init: () => null, update: ($) => $.model, parts: () => ({}) })
    expect(h.keepAlive((s) => Headless(s, { view: () => s.el("p") }))).type.not
      .toRaiseError()
  })
})
