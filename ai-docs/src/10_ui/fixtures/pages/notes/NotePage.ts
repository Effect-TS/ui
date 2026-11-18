import { Component, Head } from "@effect/ui"
import { Layer, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Collapsible } from "../../kit/Collapsible.ts"
import { ActivityLog } from "../../notes/components/ActivityLog.ts"
import { NoteActivity } from "../../notes/components/NoteActivity.ts"
import { NoteEditor } from "../../notes/components/NoteEditor.ts"
import { GetNote } from "../../notes/queries/GetNote.ts"
import { Notes } from "../../notes/services/Notes.ts"

export const NotePageMessage = Schema.TaggedUnion({
  SavedNote: {},
  FailedEditor: {},
  ClickedSaveNow: {}
})

// A ref names a child so the page can send it messages. The note's id
// goes in with `at`, so a new note still mounts a fresh editor.
const Editor = NoteEditor.ref("Editor")

export const NotePageNoDeps = Component.define({
  name: "NotePage",
  props: Schema.Struct({ id: Schema.String }),
  // The Model holds no copy of the note. The runtime keeps each query's
  // last result beside the Model, and the Model plus the query results is
  // the instance's state.
  model: Schema.Struct({ notice: Schema.String }),
  message: NotePageMessage,
  // Each entry names a `Query` and returns its args, or `undefined` to
  // disable it. The runtime watches the query at those args and keeps its
  // latest result, which re-renders the page. No message or
  // `update` case is involved.
  queries: { note: { query: GetNote, args: (_model, props) => ({ id: props.id }) } }
}).make({
  init: () => ({ notice: "" }),
  // `update` can read the results too, as `$.queries`.
  update: (model, message, $) =>
    NotePageMessage.match(message, {
      SavedNote: () => ({ ...model, notice: "Saved" }),
      FailedEditor: () => ({ ...model, notice: "The editor crashed" }),
      // "Save now" is a one-shot instruction, so it's a send, not a prop.
      // State the editor shows, like the note, stays in its props. The
      // editor's `update` handles the message after this render, with the
      // props from it. A send to a child that isn't rendered, such as while
      // the note loads, is dropped and logged.
      // The message sent is still a fact, named by the editor.
      ClickedSaveNow: () => $.send(Editor.at($.props.id), { _tag: "RequestedSave" })
    }),
  // `head` gets the Model, the props and the queries' results, as a view
  // does. The title comes from the loaded note, and the note's id from the
  // route stands in while it loads, with no copy of the prop in the Model.
  head: (_model, props, queries) => [
    Head.title(AsyncResult.isSuccess(queries.note) ? queries.note.value.title : `Note ${props.id}`)
  ],
  view: (model, h) =>
    // `h.queries.note` is the query's result as an `AsyncResult`.
    AsyncResult.match(h.queries.note, {
      onInitial: () => h.p("Loading note…"),
      onFailure: () => h.p("This note doesn't exist."),
      onSuccess: ({ value: note }) =>
        h.article(
          // The Collapsible draws the frame and opens and closes the body.
          // Each slot's content is this page's: written with this `h`, so
          // the button sends `ClickedSaveNow` here, the editor's events and failure
          // map to this page's messages, `$.send` reaches the editor by its
          // ref, and `NoteActivity` is resolved from this page's Layers.
          // The editor's path is `.../Collapsible[note]/[body]/NoteEditor[...]`.
          Collapsible(h, {
            key: "note",
            slots: {
              summary: [
                h.h2(note.title),
                h.button.attr("type", "button").onClick(NotePageMessage.make({ _tag: "ClickedSaveNow" })).children(
                  "Save now"
                )
              ],
              body: [
                NoteEditor(h, {
                  ref: Editor.at(note.id),
                  props: { note },
                  // Maps the child's events to this component's messages:
                  // the event's verb, then this page's name for the child.
                  onEmit: () => NotePageMessage.make({ _tag: "SavedNote" }),
                  // Every child is a failure boundary. A failed child shows
                  // `fallback` and stays down until its key changes.
                  onFailure: () => NotePageMessage.make({ _tag: "FailedEditor" }),
                  fallback: () => h.p("The editor is unavailable.")
                }),
                NoteActivity.render(h, {
                  key: "activity",
                  props: { noteId: note.id },
                  fallback: (result) => h.p(AsyncResult.isInitial(result) ? "Loading activity…" : "No activity.")
                })
              ]
            }
          }),
          model.notice !== "" && h.p.attr("role", "status").children(model.notice)
        )
    })
})

// `NotePageNoDeps` requires `GetNote | NoteActivity`. `NoteEditor` already
// provides its own `SaveNote`, so that one doesn't surface here. The plain
// name is the page with its Layers provided, which is what `App` uses.
//
// - Provide domain Layers in the component that needs them, not at the root.
//   The root keeps platform Layers: the Router, the HTTP client, logging.
// - A Layer value is built once and shared by the instances using it. Pass
//   `{ local: true }` or a function of props for state each instance owns.
// - Nothing is rebuilt when props change. Re-key the component instead, or
//   pass `{ key: (props, model) => key, layer: (key) => Layer }` to select
//   the Layer again when the key changes, which remounts everything below.
// - A Layer that can fail needs `{ onFailure: (failure) => message }`.
export const NotePage = NotePageNoDeps.pipe(
  Component.provide([
    GetNote.layer.pipe(Layer.provide(Notes.layerHttp)),
    NoteActivity.toLayer(ActivityLog)
  ])
)
