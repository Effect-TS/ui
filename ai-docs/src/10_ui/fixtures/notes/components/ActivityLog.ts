import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { NoteActivity } from "./NoteActivity.ts"

// One implementation of the feature. Its props must fit the contract.
export const ActivityLog = Html.component({
  name: "ActivityLog",
  props: NoteActivity.props,
  model: Schema.Struct({}),
  message: Schema.Never
}).make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) => h.aside(`No activity yet on note ${h.props.noteId}.`)
})
