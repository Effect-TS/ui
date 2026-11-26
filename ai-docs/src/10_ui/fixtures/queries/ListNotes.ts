import { Note, NotesTag } from "#domain/Note"
import { Query } from "@effect/ui"
import { Effect, Schema } from "effect"
import { Notes } from "../notes/services/Notes.ts"

// Omit `args` for no arguments and `error` when infallible.
export class ListNotes extends Query.Service<ListNotes>()(
  "notes/ListNotes",
  {
    success: Schema.Array(Note),
    staleTime: "30 seconds",
    tags: [NotesTag]
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function*() {
      const notes = yield* Notes
      return () => notes.list
    })
  )
}
