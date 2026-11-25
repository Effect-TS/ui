import { NoteResults, NoteSort, NotesTag } from "#domain/Note"
import { Query } from "@effect/ui"
import { Effect, Schema } from "effect"
import { Notes } from "../notes/services/Notes.ts"

// A query keyed by the whole search, so each page and order is cached on its
// own and going back to an earlier page shows it at once.
export class SearchNotes extends Query.Service<SearchNotes>()(
  "notes/SearchNotes",
  {
    args: { q: Schema.String, page: Schema.Number, sort: NoteSort },
    success: NoteResults,
    error: Schema.Never,
    staleTime: "30 seconds",
    tags: [NotesTag]
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function*() {
      const notes = yield* Notes
      return (search) => notes.search(search)
    })
  )
}
