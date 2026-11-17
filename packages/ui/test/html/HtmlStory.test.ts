import { Component, Mount } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { HtmlStory } from "@effect/ui/html/testing"
import { Query, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const Board = Component.define({
  name: "Board",
  model: Schema.Array(Schema.String),
  message: Schema.String,
  elements: Html
}).make({
  init: (): ReadonlyArray<string> => [],
  update: (log, message) => [...log, message],
  view: (_, h) =>
    h.section.onDrop(
      ({ data, files }) => `outer ${data["application/x-todo"] ?? files.map((file) => file.name).join(",")}`,
      { accepts: ["application/x-todo", "Files"] }
    ).children(
      h.div.attr("aria-label", "Inner")
        .onDrop(() => "inner", { accepts: ["text/uri-list"] }).children(h.p("Inner child")),
      h.p("Plain")
    )
})

describe("HtmlStory", () => {
  it("drop goes to the innermost target that accepts the drag, and throws when none does", () => {
    Story.make(Board, {}, (s) => {
      // The inner target doesn't accept a todo, so the outer one takes it.
      s.pipe(HtmlStory.drop(Query.text("Inner child"), { data: { "application/x-todo": "milk" } }))
        .check((story) => assert.isTrue(story.defaultPrevented))
        .pipe(HtmlStory.drop(Query.text("Inner child"), { data: { "text/uri-list": "https://example.com" } }))
        .pipe(HtmlStory.drop(Query.text("Plain"), { files: [new File(["x"], "a.txt")] }))
        .model((log) => assert.deepStrictEqual(log, ["outer milk", "inner", "outer a.txt"]))
      assert.throws(
        () => s.pipe(HtmlStory.drop(Query.text("Plain"), { data: { "text/plain": "hello" } })),
        /HtmlStory\.drop: nothing at text "Plain" accepts "text\/plain"/
      )
    })
  })

  it("a story names a mount by its definition, checks its args and ends it with the definition's result", () => {
    const Message = Schema.TaggedUnion({ Add: { point: Schema.Number }, Drawn: { width: Schema.Number } })
    const DrawChart = Mount.make(
      "DrawChart",
      { args: { points: Schema.Array(Schema.Number) } },
      (canvas: HTMLCanvasElement) => Effect.sync(() => canvas.width)
    )
    const Chart = Component.define({
      name: "Chart",
      model: Schema.Struct({ points: Schema.Array(Schema.Number), width: Schema.Number }),
      message: Message,
      elements: Html
    }).make({
      init: () => ({ points: [1, 2], width: 0 }),
      update: (model, message) =>
        Message.match(message, {
          Add: ({ point }) => ({ ...model, points: [...model.points, point] }),
          Drawn: ({ width }) => ({ ...model, width })
        }),
      view: (model, h) =>
        h.canvas.onMount(
          DrawChart({ points: model.points }).pipe(Mount.map((width) => Message.make({ _tag: "Drawn", width })))
        )
    })
    Story.make(Chart, {}, (s) => {
      s.expectMount(DrawChart({ points: [1, 2] }))
        .send(Message.make({ _tag: "Add", point: 3 }))
        .expectMount(DrawChart({ points: [1, 2, 3] }))
        // The definition's own result: the view's Mount.map makes the message.
        .mounted(DrawChart, 300)
        .model((model) => assert.strictEqual(model.width, 300))
      assert.throws(
        () => s.expectMount(DrawChart({ points: [] })),
        /Story\.expectMount: no rendered mount matches DrawChart\(\{"points":\[\]\}\); mounts: DrawChart\(\{"points":\[1,2,3\]\}\)/
      )
    })
  })
})
