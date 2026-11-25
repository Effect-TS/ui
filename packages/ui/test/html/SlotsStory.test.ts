import { UiSchema, View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Locator, Scene } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const Note = Html.component({
  name: "Note",
  model: Schema.Number,
  message: Schema.Never,
  events: UiSchema.TaggedEnum({ Saved: { text: Schema.String } })
}).make({
  init: () => 0,
  update: ($) => $.model,
  view: (h, n) => h.span("note " + n)
})

const Panel = Html.component({
  name: "Panel",
  model: Schema.Null,
  message: Schema.Never,
  slots: ["title", "body"]
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.section(h.h2(h.slots.title), h.p("panel's own"), h.slots.body)
})

const PageMsg = UiSchema.TaggedEnum({
  Bump: {},
  Saved: { text: Schema.String }
})
const Page = Html.component({
  name: "Page",
  model: Schema.Struct({ bumps: Schema.Number, saved: Schema.String }),
  message: PageMsg
}).make({
  init: () => ({ bumps: 0, saved: "" }),
  update: ($, msg) =>
    msg._tag === "Bump"
      ? { ...$.model, bumps: $.model.bumps + 1 }
      : { ...$.model, saved: msg.text },
  // An element around the child: a query sees through the child to the content under it.
  view: (h, model) =>
    h.main(
      Panel(h, {
        key: "p",
        slots: {
          title: "bumps " + model.bumps,
          body: [
            h.button.on("click", PageMsg.Bump()).children("bump"),
            Note(h, {
              key: "n",
              onEmit: (event) => PageMsg.Saved({ text: event.text })
            })
          ]
        }
      }),
      h.output(model.saved)
    )
})

describe("slots in a story", () => {
  it.effect("a parent's story shows its content, handles its events and finds its children", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Page, {})
      scene.click("bump")
        .childEmit(Note, "n", { _tag: "Saved", text: "hi" })
        .expect(Locator.tag("output")).toHaveText("hi")
      // The child's own view isn't run: only what the parent passed shows.
      assert.strictEqual(
        Locator.textOf(scene.view as Locator.Node),
        "bumps 1bumphi"
      )
      assert.deepStrictEqual(
        scene.all(Locator.text("bump")).map((node) => node.tag),
        ["button"]
      )
      assert.deepStrictEqual(
        Scene.children(scene.view, Note).map((child) => child.key),
        ["n"]
      )
    }))

  it.effect("a slotted component's story shows what it was passed where the view places each slot", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Panel, {}, {
        slots: (h) => ({
          title: "hello",
          body: [h.em("the body"), Note(h, { key: "n" })]
        })
      })
      assert.strictEqual(Locator.textOf(scene.get(Locator.tag("h2"))), "hello")
      assert.strictEqual(
        Locator.textOf(scene.get(Locator.tag("section"))),
        "hellopanel's ownthe body"
      )
      assert.deepStrictEqual(
        Scene.children(scene.view, Note).map((child) => child.key),
        ["n"]
      )
    }))
})

describe("View queries", () => {
  it("textOf and nodes walk a child's slot content in the order it was passed", () => {
    const h = View.makeHelper({}, Html)
    const node = View.toNode(
      h.div(
        "a",
        Panel(h, { key: "p", slots: { body: h.b("c"), title: "b" } }),
        "d"
      )
    )
    assert.strictEqual(View.textOf(node), "acbd")
    const tags = [...View.nodes(node)].map((n) =>
      n._tag === "Element" ? n.tag : n._tag === "Text" ? n.text : n._tag
    )
    assert.deepStrictEqual(tags, ["div", "a", "Child", "b", "c", "b", "d"])
  })
})

describe("headless closures in slot content", () => {
  const Headless = Html.component({
    name: "Headless",
    model: Schema.Null,
    message: Schema.Never
  })
    .make({ init: () => null, update: ($) => $.model, parts: () => ({}) })

  it.effect("childEmit finds a child a headless closure renders in content the story's component passes", () =>
    Effect.gen(function*() {
      const Parent = Html.component({
        name: "Parent",
        model: Schema.String,
        message: Schema.String
      })
        .make({
          init: () => "",
          update: (_, text) => text,
          view: (h, text) =>
            Panel(h, {
              key: "p",
              slots: {
                title: h.output(text),
                body: Headless(h, {
                  key: "h",
                  view: () =>
                    Note(h, { key: "n", onEmit: (event) => event.text })
                })
              }
            })
        })
      const scene = yield* Scene.make(Parent, {})
      scene.childEmit(Note, "n", { _tag: "Saved", text: "hi" })
        .expect(Locator.tag("output")).toHaveText("hi")
    }))

  it.effect("keys in content a parent passed don't clash with the receiver's own", () =>
    Effect.gen(function*() {
      const Receiver = Html.component({
        name: "Receiver",
        model: Schema.Null,
        message: Schema.Never,
        slots: ["body"]
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.div(Note(h, { key: "N" }), h.slots.body)
      })
      const scene = yield* Scene.make(Receiver, {}, {
        slots: (h) => ({
          body: Headless(h, { key: "ext", view: () => Note(h, { key: "N" }) })
        })
      })
      assert.strictEqual(Scene.children(scene.view, Note).length, 2)
    }))
})
