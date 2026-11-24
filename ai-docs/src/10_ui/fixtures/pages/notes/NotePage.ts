import { GetNote } from "#queries/GetNote"
import { Component, Head, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Layer, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Collapsible } from "../../kit/Collapsible.ts"
import { ActivityLog } from "../../notes/components/ActivityLog.ts"
import { NoteActivity } from "../../notes/components/NoteActivity.ts"
import { NoteEditor } from "../../notes/components/NoteEditor.ts"
import { Notes } from "../../notes/services/Notes.ts"

export const NotePageMessage = UiSchema.TaggedEnum({
  SavedNote: {},
  FailedEditor: {}
})

export const NotePageNoDeps = Html.component({
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
  queries: { note: { query: GetNote, args: ({ props }) => ({ id: props.id }) } }
}).make({
  init: () => ({ notice: "" }),
  // `update` can read the results too, as `$.queries`.
  update: ($, message) =>
    NotePageMessage.match(message, {
      SavedNote: () => $.evolve({ notice: "Saved" }),
      FailedEditor: () => $.evolve({ notice: "The editor crashed" })
    }),
  // `head` gets one object holding the Model, the props and the queries'
  // results, and picks out what it reads. The title comes from the loaded note, and the note's id from the
  // route stands in while it loads, with no copy of the prop in the Model.
  head: ({ props, queries }) => [
    Head.title(
      AsyncResult.isSuccess(queries.note)
        ? queries.note.value.title
        : `Note ${props.id}`
    )
  ],
  view: (h, model) =>
    // `h.queries.note` is the query's result as an `AsyncResult`.
    AsyncResult.match(h.queries.note, {
      onInitial: () => h.p("Loading note…"),
      onFailure: () => h.p("This note doesn't exist."),
      onSuccess: ({ value: note }) =>
        h.article(
          // The Collapsible draws the frame and opens and closes the body.
          // Each slot's content is this page's: written with this `h`, so
          // the editor's events and failure map to this page's messages, and
          // `NoteActivity` is resolved from this page's Layers. The page
          // can't tell the editor to save: the draft is the editor's, and
          // its own Save button, Ctrl+S and autosave save it.
          // The note's id is the key, so a new note mounts a fresh editor,
          // at `.../Collapsible[note]/[body]/NoteEditor[n1]`.
          Collapsible(h, {
            key: "note",
            slots: {
              summary: h.h2(note.title),
              body: [
                NoteEditor(h, {
                  key: note.id,
                  props: { note },
                  // Maps the child's events to this component's messages:
                  // the event's verb, then this page's name for the child.
                  onEmit: { Saved: () => NotePageMessage.SavedNote() },
                  // Every child is a failure boundary. A failed child shows
                  // `fallback` and stays down until its key changes.
                  onFailure: () => NotePageMessage.FailedEditor(),
                  fallback: () => h.p("The editor is unavailable.")
                }),
                NoteActivity.render(h, {
                  key: "activity",
                  props: { noteId: note.id },
                  fallback: (result) =>
                    h.p(
                      AsyncResult.isInitial(result)
                        ? "Loading activity…"
                        : "No activity."
                    )
                })
              ]
            }
          }),
          model.notice !== "" &&
            h.p.attr("role", "status").children(model.notice)
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
