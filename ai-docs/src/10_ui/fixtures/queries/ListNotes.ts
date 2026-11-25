import { Note, NotesTag } from "#domain/Note"
import { Query } from "@effect/ui"
import { Effect, Schema } from "effect"
import { Notes } from "../notes/services/Notes.ts"

// Use `args: {}` for no arguments and `error: Schema.Never` when infallible.
export class ListNotes extends Query.Service<ListNotes>()(
  "notes/ListNotes",
  {
    args: {},
    success: Schema.Array(Note),
    error: Schema.Never,
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
