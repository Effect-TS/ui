/**
 * @title Mounts
 *
 * Start work with an element's host node: a mount that measures a box once,
 * a mount that hosts a third-party editor and reports each change, and a
 * scene that names both by their definitions.
 */
import { Component, Mount } from "@effect/ui"
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
export const CodeEditor = Mount.makeStream(
  "CodeEditor",
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

const SnippetMessage = Schema.TaggedUnion({
  Measured: { width: Schema.Number },
  Edited: { text: Schema.String }
})

// An element takes one mount. A render that gives it a mount of another
// definition stops the running one and starts the new one. A result goes
// through the `Mount.map` of the latest render, so what the map reads is
// current.
export const Snippet = Component.define({
  name: "Snippet",
  model: Schema.Struct({ text: Schema.String, width: Schema.Number }),
  message: SnippetMessage,
  elements: Html
}).make({
  init: () => ({ text: "", width: 0 }),
  update: (model, message) =>
    SnippetMessage.match(message, {
      Measured: ({ width }) => ({ ...model, width }),
      Edited: ({ text }) => ({ ...model, text })
    }),
  view: (model, h) =>
    h.section.onMount(Measure().pipe(Mount.map((width) => SnippetMessage.make({ _tag: "Measured", width }))))
      .children(
        h.div.onMount(
          CodeEditor({ text: model.text }).pipe(Mount.map((text) => SnippetMessage.make({ _tag: "Edited", text })))
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
export const edited = Scene.make(Snippet, {}, (s) =>
  s.expectMount(CodeEditor({ text: "" }))
    .mounted(Measure, 320)
    .mounted(CodeEditor, "let x = 1")
    .expectMount(CodeEditor({ text: "let x = 1" })))
