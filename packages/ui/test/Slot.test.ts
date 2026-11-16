import { Component, Feature, View } from "@effect/ui"
import { assert, describe, it } from "@effect/vitest"
import { Layer, Schema } from "effect"

const RowMessage = Schema.TaggedUnion({ Clear: {}, Typed: { text: Schema.String } })
const RowEvents = Schema.TaggedUnion({ Changed: { text: Schema.String } })

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

const ParentMessage = Schema.TaggedUnion({ Changed: { text: Schema.String } })
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

  it("builds a slot with a key", () => {
    const onEmit = (events: typeof RowEvents.Type) => ParentMessage.make({ _tag: "Changed", text: events.text })
    const slot = Row(h, { key: "a", props: { id: "a" }, onEmit })
    assert.strictEqual(slot._tag, "Child")
    assert.strictEqual(slot.component, Row)
    assert.strictEqual(slot.key, "a")
    assert.isUndefined(slot.ref)
    assert.deepStrictEqual(slot.props, { id: "a" })
    assert.strictEqual(slot.onEmit, onEmit)
    assert.isUndefined(slot.fallback)
    assert.isUndefined(slot.onFailure)
    assert.isUndefined(slot.view)
  })

  it("takes the ref's key with a ref, and defaults props and onEmit", () => {
    const Draft = Row.ref("Draft").at(1)
    const slot = Listbox(h, { ref: Listbox.ref("Menu"), view: () => h.el("ul") })
    assert.strictEqual(slot.key, "Menu")
    assert.deepStrictEqual(slot.props, {})
    assert.isUndefined(slot.onEmit({}))
    const row = Row(h, { ref: Draft, props: { id: "a" } })
    assert.strictEqual(row.key, "Draft[1]")
    assert.strictEqual(row.ref, Draft)
  })

  it("rejects both a key and a ref, or neither", () => {
    const Draft = Row.ref("Draft")
    assert.throws(() => Row(h, { key: "a", ref: Draft, props: { id: "a" } } as any), /exactly one of key and ref/)
    assert.throws(() => Row(h, { props: { id: "a" } } as any), /exactly one of key and ref/)
  })

  it("keeps a headless component's view", () => {
    const view = () => h.el("ul")
    const slot = Listbox(h, { key: "l", view })
    assert.isTrue(Component.isHeadless(Listbox))
    assert.strictEqual(typeof Listbox, "function")
    assert.strictEqual(Listbox.definition, ListboxDef)
    assert.strictEqual(Listbox.definition.name, "Listbox")
    assert.strictEqual(slot.component, Listbox as unknown)
    assert.strictEqual(slot.view, view)
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
  it("builds a slot for the service", () => {
    const fallback = () => h.el("p", "loading")
    const slot = Todos.render(h, { key: "t", fallback })
    assert.strictEqual(slot.component, Todos)
    assert.strictEqual(slot.key, "t")
    assert.strictEqual(slot.fallback, fallback)
    const Main = Todos.ref("Main")
    assert.strictEqual(Todos.render(h, { ref: Main, fallback }).key, "Main")
    assert.throws(() => Todos.render(h, { fallback } as any), /exactly one of key and ref/)
    // Detached, it still builds a slot for the feature.
    const render = Todos.render
    assert.strictEqual(render(h, { key: "d", fallback }).key, "d")
  })
})
