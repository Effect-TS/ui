import { Component, Head } from "@effect/ui"
import { Layer, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { ActivityLog } from "../../notes/components/ActivityLog.ts"
import { NoteActivity } from "../../notes/components/NoteActivity.ts"
import { NoteEditor } from "../../notes/components/NoteEditor.ts"
import { GetNote } from "../../notes/loaders/GetNote.ts"
import { Notes } from "../../notes/services/Notes.ts"

export const NotePageMessage = Schema.TaggedUnion({
  Saved: {},
  EditorFailed: {},
  SaveNow: {}
})

// A ref names a child so the page can send it messages. The note's id
// goes in with `at`, so a new note still mounts a fresh editor.
const Editor = NoteEditor.ref("Editor")

export const NotePageNoDeps = Component.define({
  name: "NotePage",
  props: Schema.Struct({ id: Schema.String }),
  // The Model holds no copy of the note. The runtime keeps each loader's
  // last result in its state beside the Model, and the Model plus the loader
  // state is the instance's state.
  model: Schema.Struct({ notice: Schema.String }),
  message: NotePageMessage,
  // Each loader names its read and returns the read's args, or `undefined`
  // to disable it. The runtime watches the read at those args and writes
  // every change to the loader's state, which re-renders the page. No message or
  // `update` case is involved.
  loaders: { note: { load: GetNote, args: (_model, props) => ({ id: props.id }) } }
}).make({
  init: () => ({ notice: "" }),
  // `update` can read the loader state too, as `$.loaded`.
  update: (model, message, $) =>
    NotePageMessage.match(message, {
      Saved: () => ({ ...model, notice: "Saved" }),
      EditorFailed: () => ({ ...model, notice: "The editor crashed" }),
      // "Save now" is a one-shot instruction, so it's a send, not a prop.
      // State the editor shows, like the note, stays in its props. The
      // editor's `update` handles the message after this render, with the
      // props from it. A send to a child that isn't rendered, such as while
      // the note loads, is dropped and logged.
      SaveNow: () => $.send(Editor.at($.props.id), { _tag: "Save" })
    }),
  // `head` gets the Model, the props and the loaders' results, as a view
  // does. The title comes from the loaded note, and the note's id from the
  // route stands in while it loads, with no copy of the prop in the Model.
  head: (_model, props, loaded) => [
    Head.title(AsyncResult.isSuccess(loaded.note) ? loaded.note.value.title : `Note ${props.id}`)
  ],
  view: (model, h) =>
    // `h.loaded.note` is the loader's state as an `AsyncResult`.
    AsyncResult.match(h.loaded.note, {
      onInitial: () => h.p("Loading note…"),
      onFailure: () => h.p("This note doesn't exist."),
      onSuccess: ({ value: note }) =>
        h.article(
          h.button.attr("type", "button").onClick(NotePageMessage.make({ _tag: "SaveNow" })).children("Save now"),
          NoteEditor(h, {
            ref: Editor.at(note.id),
            props: { note },
            // Maps the child's events to this component's messages.
            onEmit: () => NotePageMessage.make({ _tag: "Saved" }),
            // Every child is a failure boundary. A failed child shows
            // `fallback` and stays down until its key changes.
            onFailure: () => NotePageMessage.make({ _tag: "EditorFailed" }),
            fallback: () => h.p("The editor is unavailable.")
          }),
          NoteActivity.render(h, {
            key: "activity",
            props: { noteId: note.id },
            fallback: (result) => h.p(AsyncResult.isInitial(result) ? "Loading activity…" : "No activity.")
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
// - Nothing is rebuilt when props change. Re-key the component instead.
// - A Layer that can fail needs `{ onFailure: (failure) => message }`.
export const NotePage = NotePageNoDeps.pipe(
  Component.provide([
    GetNote.layer.pipe(Layer.provide(Notes.layerHttp)),
    NoteActivity.toLayer(ActivityLog)
  ])
)
