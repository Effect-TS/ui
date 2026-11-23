import { ListNotes } from "#queries/ListNotes"
import { Component, Head, UiSchema, UiStruct } from "@effect/ui"
import { HtmlHead } from "@effect/ui/html"
import { Layer, Match, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Notes } from "../notes/services/Notes.ts"
import { AppRoute } from "../routes.ts"

const noteUrl = (id: string) => AppRoute.print(AppRoute.Note({ params: { id } }))

export const NotesIndexMessage = UiSchema.TaggedEnum({
  // The Pin button and a drop both send it, so it names what they share.
  PinnedNote: { id: Schema.String },
  DraggedIntoPins: {},
  DraggedOutOfPins: {}
})

// A drag carries strings by type. An app's own type keeps other drags,
// such as text or files, from landing on its targets.
const NoteType = "application/x-note"

export const NotesIndexNoDeps = Component.define({
  name: "NotesIndex",
  scoped: false,
  // The Model holds only what the user did here. The notes live in the
  // `notes` query's result, which the runtime keeps beside the Model.
  model: Schema.Struct({ pinned: Schema.Array(Schema.String), over: Schema.Boolean }),
  message: NotesIndexMessage,
  // `ListNotes` takes no args, so this query is the same for every instance.
  queries: { notes: { query: ListNotes, args: () => ({}) } },
  restore: (model) => UiStruct.evolve(model, { over: false })
}).make({
  init: () => ({ pinned: [], over: false }),
  update: ($, message) =>
    Match.valueTags(message, {
      PinnedNote: ({ id }) => $.evolve({ pinned: (pinned) => pinned.includes(id) ? pinned : [...pinned, id] }),
      DraggedIntoPins: () => $.evolve({ over: true }),
      DraggedOutOfPins: () => $.evolve({ over: false })
    }),
  // Every mounted instance contributes head entries. They merge in document
  // order, and the later entry wins.
  head: () => [Head.title("All notes"), HtmlHead.meta({ name: "description", content: "Every note you wrote" })],
  view: (h, model) =>
    AsyncResult.match(h.queries.notes, {
      onInitial: () => h.p("Loading notes…"),
      onFailure: () => h.p("The notes couldn't be loaded."),
      // Links are plain anchors with a printed route. The browser Router
      // intercepts clicks on hrefs the routes parse. `.key` identifies a row.
      onSuccess: ({ value: notes }) =>
        h.div(
          h.ul(notes.map((note) =>
            h.li.key(note.id)
              // A drag source: the host puts this data on the drag.
              .draggable({ [NoteType]: note.id }, { effectAllowed: "link" }).children(
                h.a.attr("href", noteUrl(note.id)).children(note.title),
                // Drag and drop needs a pointer, so every drag has a button
                // that sends the same message, for the keyboard and touch.
                h.button.attr("aria-label", `Pin ${note.title}`)
                  .onClick(NotesIndexMessage.PinnedNote({ id: note.id })).children("Pin")
              )
          )),
          // A drop target takes the drags whose types it accepts. Enter and
          // leave go to the target the drop would land on, once each, and
          // not to its children, so the highlight doesn't flicker.
          h.aside.attr("aria-label", "Pinned").class("pins", model.over && "drop-here")
            .onDrop(
              ({ data }) => NotesIndexMessage.PinnedNote({ id: data[NoteType] ?? "" }),
              { accepts: [NoteType], dropEffect: "link" }
            )
            .onDragEnter(NotesIndexMessage.DraggedIntoPins())
            .onDragLeave(NotesIndexMessage.DraggedOutOfPins()).children(
              h.h2("Pinned"),
              h.ul(model.pinned.map((id) => h.li.key(id).children(notes.find((note) => note.id === id)?.title ?? id)))
            )
        )
    })
})

export const NotesIndex = NotesIndexNoDeps.pipe(
  Component.provide(ListNotes.layer.pipe(Layer.provide(Notes.layerHttp)))
)
