import { Note, NoteNotFound, NotesTag } from "#domain/Note"
import { Query } from "@effect/ui"
import { Effect, Schema } from "effect"
import { Notes } from "../notes/services/Notes.ts"

// Queries cache one entry per args; `toLayer` captures `Notes` at Layer build.
// `SaveNote` invalidates `NotesTag`, so a save refetches it.
export class GetNote extends Query.Service<GetNote>()(
  "notes/GetNote",
  {
    args: { id: Schema.String },
    success: Note,
    error: NoteNotFound,
    staleTime: "30 seconds",
    tags: [NotesTag]
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function*() {
      const notes = yield* Notes
      return ({ id }) => notes.get(id)
    })
  )
}
