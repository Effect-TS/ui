import { Component, Feature, UiSchema, View } from "@effect/ui"
import { assert, describe, it } from "@effect/vitest"
import { Layer, Schema } from "effect"

const RowMessage = UiSchema.TaggedEnum({ Clear: {}, Typed: { text: Schema.String } })
const RowEvents = UiSchema.TaggedEnum({ Changed: { text: Schema.String } })

const RowDef = Component.define({
  name: "Row",
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.String,
  message: RowMessage,
  events: RowEvents,
  receives: ["Clear"]
})

const Row = RowDef.make({
  init: () => "",
  update: (text) => text,
  view: (text, h) => h.el("li", text)
})

const ListboxDef = Component.define({ name: "Listbox", model: Schema.Null, message: Schema.Never })

const Listbox = ListboxDef.make({
  init: () => null,
  update: (model) => model,
  parts: (_, p) => ({ id: p.id("list") })
})

class Todos extends Feature.Service<Todos>()("Todos", { props: Schema.Struct({}), events: RowEvents }) {}

const ParentMessage = UiSchema.TaggedEnum({ Changed: { text: Schema.String } })
const h = View.makeHelper<typeof ParentMessage.Type, {}>({}, undefined)

describe("a component call", () => {
  it("is a function that keeps the component's fields", () => {
    assert.strictEqual(typeof Row, "function")
    assert.strictEqual(Row.definition, RowDef)
    assert.strictEqual(Row.definition.name, "Row")
    // The function's own name isn't the component's.
    assert.notStrictEqual(Row.name, "Row")
    assert.isTrue(Component.isComponent(Row))
    assert.isFalse(Component.isHeadless(Row))
    assert.strictEqual(Row.pipe((c) => c.definition.name), "Row")
    assert.strictEqual(Row.ref("Draft").key, "Draft")
    // `call`, `apply` and `bind` are Function.prototype's.
    assert.strictEqual(Row.call, Function.prototype.call)
    assert.strictEqual(Row.apply, Function.prototype.apply)
    assert.strictEqual(Row.bind, Function.prototype.bind)
  })

  it("keeps its fields enumerable, so a copy keeps them", () => {
    const copy = { ...Row }
    assert.strictEqual(copy.definition, RowDef)
    assert.strictEqual(copy.update, Row.update)
    assert.includeMembers(Object.keys(Row), ["definition", "props", "model", "message", "init", "update", "view"])
    assert.includeMembers(Object.keys(Listbox), ["definition", "parts"])
  })

  it("builds a child with a key", () => {
    const onEmit = (events: typeof RowEvents.Type) => ParentMessage.Changed({ text: events.text })
    const child = Row(h, { key: "a", props: { id: "a" }, onEmit })
    assert.strictEqual(child._tag, "Child")
    assert.strictEqual(child.component, Row)
    assert.strictEqual(child.key, "a")
    assert.isUndefined(child.ref)
    assert.deepStrictEqual(child.props, { id: "a" })
    assert.strictEqual(child.onEmit, onEmit)
    assert.isUndefined(child.fallback)
    assert.isUndefined(child.onFailure)
    assert.isUndefined(child.view)
  })

  it("takes the ref's key with a ref, and defaults props and onEmit", () => {
    const Draft = Row.ref("Draft").at(1)
    const child = Listbox(h, { ref: Listbox.ref("Menu"), view: () => h.el("ul") })
    assert.strictEqual(child.key, "Menu")
    assert.deepStrictEqual(child.props, {})
    assert.isUndefined(child.onEmit({}))
    const row = Row(h, { ref: Draft, props: { id: "a" } })
    assert.strictEqual(row.key, "Draft[1]")
    assert.strictEqual(row.ref, Draft)
  })

  it("rejects both a key and a ref, and has the empty key with neither", () => {
    const Draft = Row.ref("Draft")
    assert.throws(() => Row(h, { key: "a", ref: Draft, props: { id: "a" } } as any), /a key or a ref, not both/)
    assert.strictEqual(Row(h, { props: { id: "a" } }).key, "")
  })

  it("keeps a headless component's view", () => {
    const view = () => h.el("ul")
    const child = Listbox(h, { key: "l", view })
    assert.isTrue(Component.isHeadless(Listbox))
    assert.strictEqual(typeof Listbox, "function")
    assert.strictEqual(Listbox.definition, ListboxDef)
    assert.strictEqual(Listbox.definition.name, "Listbox")
    assert.strictEqual(child.component, Listbox as unknown)
    assert.strictEqual(child.view, view)
  })

  it("works on a provided component, which is a new callable component", () => {
    const Provided = Component.provide(Row, Layer.empty)
    assert.notStrictEqual<unknown>(Provided, Row)
    assert.strictEqual(typeof Provided, "function")
    // `provide` keeps the definition, so nested provides do too.
    assert.strictEqual(Provided.definition, RowDef)
    assert.strictEqual(Component.provide(Provided, Layer.empty).definition, RowDef)
    assert.includeMembers(Object.keys(Provided), ["definition", "layer", "update"])
    assert.isTrue(Component.isComponent(Provided))
    assert.isDefined(Provided.layer)
    assert.strictEqual(Provided.update, Row.update)
    assert.strictEqual(Provided(h, { key: "p", props: { id: "p" } }).component, Provided)
  })
})

describe("a feature's render", () => {
  it("reports the missing event tag instead of calling an inherited handler", () => {
    class Text extends Feature.Service<Text>()("Text", {
      props: Schema.Struct({}),
      events: Schema.TaggedStruct("toString", {})
    }) {}
    const h = View.makeHelper<string, {}>({}, undefined)
    const fallback = () => h.text("")
    const event = { _tag: "toString" } as const
    const missingHandler = Text.render(h, { fallback, onEmit: Object.create(Object.prototype) })
    assert.throws(() => missingHandler.onEmit(event), /Missing onEmit handler.*toString/)
  })

  it("builds a child for the service", () => {
    const fallback = () => h.el("p", "loading")
    const child = Todos.render(h, { key: "t", fallback })
    assert.strictEqual(child.component, Todos)
    assert.strictEqual(child.key, "t")
    assert.strictEqual(child.fallback, fallback)
    const Main = Todos.ref("Main")
    assert.strictEqual(Todos.render(h, { ref: Main, fallback }).key, "Main")
    assert.strictEqual(Todos.render(h, { fallback }).key, "")
    // Detached, it still builds a child for the feature.
    const render = Todos.render
    assert.strictEqual(render(h, { key: "d", fallback }).key, "d")
  })
})
