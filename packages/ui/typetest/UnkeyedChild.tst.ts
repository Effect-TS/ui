// PROTOTYPE (EFF-3930): what the types accept once `key` is optional.
import { Component, Feature, type View } from "@effect/ui"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

const Plain = Component.define({ name: "Plain", model: Schema.Null, message: Schema.Never }).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.el("p")
})

const Row = Component.define({
  name: "Row",
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Null,
  message: Schema.Never
}).make({ init: () => null, update: (model) => model, view: (_, h) => h.el("li", h.props.id) })

const Listbox = Component.define({ name: "Listbox", model: Schema.Null, message: Schema.Never }).make({
  init: () => null,
  update: (model) => model,
  parts: (_, p) => ({ id: p.id("list") })
})

class Todos extends Feature.Service<Todos>()("Todos", { props: Schema.Struct({}) }) {}

const ParentMessage = Schema.TaggedUnion({ Go: {} })
const ParentDef = Component.define({ name: "Parent", model: Schema.Null, message: ParentMessage })

describe("a child call without a key", () => {
  it("is accepted for a component, a headless component and a feature", () => {
    ParentDef.view((_, h) => {
      expect(Plain(h, {})).type.toBe<View.Child<typeof ParentMessage.Type, never>>()
      expect(Row(h, { props: { id: "a" } })).type.not.toRaiseError()
      expect(Listbox(h, { view: (parts) => h.el("ul").attr("id", parts.id) })).type.not.toRaiseError()
      expect(Todos.render(h, { fallback: () => h.el("p") })).type.toBe<View.Child<typeof ParentMessage.Type, Todos>>()
      return h.el("p")
    })
  })

  it("still needs the props the component requires, and the options object", () => {
    ParentDef.view((_, h) => {
      expect(Row).type.not.toBeCallableWith(h, {})
      expect(Plain).type.not.toBeCallableWith(h)
      return h.el("p")
    })
  })

  it("still rejects a key together with a ref", () => {
    ParentDef.view((_, h) => {
      expect(Plain).type.not.toBeCallableWith(h, { key: "a", ref: Plain.ref("p") })
      expect(Todos.render).type.not.toBeCallableWith(h, { key: "a", ref: Todos.ref("t"), fallback: () => h.el("p") })
      return h.el("p")
    })
  })

  it("gives rows of a list no type error, where a missing key was one before", () => {
    ParentDef.view((_, h) => {
      const ids: ReadonlyArray<string> = ["a", "b"]
      expect(h.el("ul", ids.map((id) => Row(h, { props: { id } })))).type.not.toRaiseError()
      return h.el("p")
    })
  })
})
