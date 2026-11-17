import { Component, View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Locator, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"

const Note = Component.define({
  name: "Note",
  model: Schema.Number,
  message: Schema.Never,
  events: Schema.TaggedUnion({ Saved: { text: Schema.String } }),
  elements: Html
}).make({ init: () => 0, update: (n) => n, view: (n, h) => h.span("note " + n) })

const Panel = Component.define({
  name: "Panel",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html,
  slots: ["title", "body"]
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.section(h.h2(h.slots.title), h.p("panel's own"), h.slots.body)
})

const PageMsg = Schema.TaggedUnion({ Bump: {}, Saved: { text: Schema.String } })
const Page = Component.define({
  name: "Page",
  model: Schema.Struct({ bumps: Schema.Number, saved: Schema.String }),
  message: PageMsg,
  elements: Html
}).make({
  init: () => ({ bumps: 0, saved: "" }),
  update: (model, msg) => msg._tag === "Bump" ? { ...model, bumps: model.bumps + 1 } : { ...model, saved: msg.text },
  // An element around the child: a query sees through the child to the content under it.
  view: (model, h) =>
    h.main(Panel(h, {
      key: "p",
      slots: {
        title: "bumps " + model.bumps,
        body: [
          h.button.onClick(PageMsg.make({ _tag: "Bump" })).children("bump"),
          Note(h, { key: "n", onEmit: (event) => PageMsg.make({ _tag: "Saved", text: event.text }) })
        ]
      }
    }))
})

describe("slots in a story", () => {
  it("a parent's story shows its content, handles its events and finds its children", () => {
    const story = Story.make(Page, {}, (s) =>
      s.click("bump")
        .childEmit("n", { _tag: "Saved", text: "hi" }))
    assert.deepStrictEqual(story.model, { bumps: 1, saved: "hi" })
    // The child's own view isn't run: only what the parent passed shows.
    assert.strictEqual(Locator.textOf(story.view() as Locator.Node), "bumps 1bump")
    assert.deepStrictEqual(story.all(Locator.text("bump")).map((node) => node.tag), ["button"])
    assert.deepStrictEqual(Story.children(story.view(), Note).map((child) => child.key), ["n"])
  })

  it("a slotted component's story shows what it was passed where the view places each slot", () => {
    const story = Story.make(Panel, {}, {
      slots: (h) => ({ title: "hello", body: [h.em("the body"), Note(h, { key: "n" })] })
    }, () => {})
    assert.strictEqual(Locator.textOf(story.get(Locator.tag("h2"))), "hello")
    assert.strictEqual(Locator.textOf(story.get(Locator.tag("section"))), "hellopanel's ownthe body")
    assert.deepStrictEqual(Story.children(story.view(), Note).map((child) => child.key), ["n"])
  })

  it("a ref key in the view and in content fails the story, as it fails the parent", () => {
    const Twice = Component.define({ name: "Twice", model: Schema.Null, message: Schema.Never, elements: Html })
      .make({
        init: () => null,
        update: (model) => model,
        view: (_, h) =>
          h.div(
            Note(h, { ref: Note.ref("N") }),
            Panel(h, { key: "p", slots: { body: Note(h, { ref: Note.ref("N") }) } })
          )
      })
    assert.throws(() => Story.make(Twice, {}, () => {}).view(), /N/)
  })
})

describe("View queries", () => {
  it("textOf and nodes walk a child's slot content in the order it was passed", () => {
    const h = View.makeHelper({}, Html)
    const node = View.toNode(h.div("a", Panel(h, { key: "p", slots: { body: h.b("c"), title: "b" } }), "d"))
    assert.strictEqual(View.textOf(node), "acbd")
    const tags = [...View.nodes(node)].map((n) => n._tag === "Element" ? n.tag : n._tag === "Text" ? n.text : n._tag)
    assert.deepStrictEqual(tags, ["div", "a", "Child", "b", "c", "b", "d"])
  })
})

describe("headless closures in slot content", () => {
  const Headless = Component.define({ name: "Headless", model: Schema.Null, message: Schema.Never, elements: Html })
    .make({ init: () => null, update: (model) => model, parts: () => ({}) })

  it("childEmit finds a child a headless closure renders in content the story's component passes", () => {
    const Parent = Component.define({ name: "Parent", model: Schema.String, message: Schema.String, elements: Html })
      .make({
        init: () => "",
        update: (_, text) => text,
        view: (_, h) =>
          Panel(h, {
            key: "p",
            slots: { body: Headless(h, { key: "h", view: () => Note(h, { key: "n", onEmit: (event) => event.text }) }) }
          })
      })
    const story = Story.make(Parent, {}, (s) => s.childEmit("n", { _tag: "Saved", text: "hi" }))
    assert.strictEqual(story.model, "hi")
  })

  it("refs in content a parent passed don't clash with the receiver's own", () => {
    const Receiver = Component.define({
      name: "Receiver",
      model: Schema.Null,
      message: Schema.Never,
      elements: Html,
      slots: ["body"]
    }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => h.div(Note(h, { ref: Note.ref("N") }), h.slots.body)
    })
    const story = Story.make(Receiver, {}, {
      slots: (h) => ({ body: Headless(h, { key: "ext", view: () => Note(h, { ref: Note.ref("N") }) }) })
    }, () => {})
    assert.strictEqual(Story.children(story.view(), Note).length, 2)
  })
})
