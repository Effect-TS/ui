import { Note, NotesTag } from "#domain/Note"
import { Query } from "@effect/ui"
import { Effect, Schema } from "effect"
import { Notes } from "../notes/services/Notes.ts"

// A query with no arguments writes `args: {}`, and one that can't fail writes
// `error: Schema.Never`. The Effect runs once, when the Layer is built, and
// returns the fetcher.
export class ListNotes extends Query.Service<ListNotes>()(
  "notes/ListNotes",
  {
    args: {},
    success: Schema.Array(Note),
    error: Schema.Never,
    staleTime: "30 seconds",
    tags: [NotesTag]
  },
  Effect.gen(function*() {
    const notes = yield* Notes
    return () => notes.list
  })
) {}
