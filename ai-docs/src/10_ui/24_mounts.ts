/**
 * @title Mounts
 *
 * Start work with an element's host node: a mount that measures a box once,
 * a mount that attaches a third-party editor and reports each change, and a
 * scene that names both by their definitions.
 */
import { Component, Mount, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Scene } from "@effect/ui/testing"
import { Effect, Queue, Schema, Stream } from "effect"

// A third-party widget, such as a code editor.
interface Editor {
  readonly text: () => string
  readonly setText: (text: string) => void
  readonly onChange: (f: (text: string) => void) => void
  readonly destroy: () => void
}
declare const createEditor: (node: HTMLElement) => Editor

// ---------------------------------------------------------------------------
// Definitions: a name, an args Schema and a body
// ---------------------------------------------------------------------------

// A mount is defined once, at module level, like a Command. The body gets
// the host node and ends with its own result. The annotation on `node` is
// the node it needs, so `onMount` rejects an element of another kind.
export const Measure = Mount.make(
  "Measure",
  { args: {} },
  (node: HTMLElement) => Effect.sync(() => node.getBoundingClientRect().width)
)

// `makeStream` sends a result for each value, for as long as the element
// lives. The args are data: the log encodes them through their Schema, and
// `changes` gives each render's args when they differ by its equivalence,
// so the editor follows the Model without being rebuilt. Everything runs in
// the mount's Scope, which closes when the element goes.
export const AttachEditor = Mount.makeStream(
  "AttachEditor",
  { args: { text: Schema.String } },
  (node: HTMLElement, _args, changes) =>
    Stream.callback<string>((queue) =>
      Effect.gen(function*() {
        const editor = yield* Effect.acquireRelease(
          Effect.sync(() => createEditor(node)),
          (editor) => Effect.sync(() => editor.destroy())
        )
        editor.onChange((text) => Queue.offerUnsafe(queue, text))
        // `changes` starts with the current args.
        yield* Stream.runForEach(changes, ({ text }) =>
          Effect.sync(() => {
            if (editor.text() !== text) editor.setText(text)
          })).pipe(Effect.forkScoped)
      })
    )
)

// ---------------------------------------------------------------------------
// A view issues mounts and maps their results to its messages
// ---------------------------------------------------------------------------

// A mount is named for what it does to the element, and the binding matches
// the name string. A result that ends a mount is `Completed` and the
// mount's name. A stream mount reports facts, as a Subscription does.
const SnippetMessage = UiSchema.TaggedEnum({
  CompletedMeasure: { width: Schema.Number },
  UpdatedCode: { text: Schema.String }
})

// An element takes one mount. A render that gives it a mount of another
// definition stops the running one and starts the new one. A result goes
// through the `Mount.map` of the latest render, so what the map reads is
// current.
export const Snippet = Component.define({
  name: "Snippet",
  lifetime: "view",
  model: Schema.Struct({ text: Schema.String, width: Schema.Number }),
  message: SnippetMessage,
  elements: Html
}).make({
  init: () => ({ text: "", width: 0 }),
  update: (model, message) =>
    SnippetMessage.match(message, {
      CompletedMeasure: ({ width }) => ({ ...model, width }),
      UpdatedCode: ({ text }) => ({ ...model, text })
    }),
  view: (model, h) =>
    h.section.onMount(Measure().pipe(Mount.map((width) => SnippetMessage.CompletedMeasure({ width }))))
      .children(
        h.div.onMount(
          AttachEditor({ text: model.text }).pipe(
            Mount.map((text) => SnippetMessage.UpdatedCode({ text }))
          )
        ),
        h.p(`${model.text.length} characters in ${model.width}px`)
      )
})

// ---------------------------------------------------------------------------
// A scene names a mount by its definition
// ---------------------------------------------------------------------------

// Nothing runs in a scene. `expectMount` asserts on the args the view
// rendered, and `mounted` takes the definition's own result, before
// `Mount.map`. Each `mounted` of a stream mount sends one value; any other
// mount ends once. A mount the view starts is work in flight: a message step
// or the end of the test throws until `mounted` or `expectMount` names it.
// `Scene.make` is scoped: a test runs this with `it.effect`, and the end
// check runs when the test's scope closes.
export const edited = Effect.gen(function*() {
  const s = yield* Scene.make(Snippet, {})
  s.expectMount(AttachEditor({ text: "" }))
    .mounted(Measure, 320)
    .mounted(AttachEditor, "let x = 1")
    .expectMount(AttachEditor({ text: "let x = 1" }))
})
