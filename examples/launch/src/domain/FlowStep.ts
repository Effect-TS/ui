import { Schema } from "effect"

export const FlowStep = Schema.Struct({
  kind: Schema.Literals(["message", "event", "props", "mount", "command", "OutMessage"]),
  at: Schema.Literals(["page", "dialog"]),
  name: Schema.String,
  where: Schema.String,
  caption: Schema.String,
  move: Schema.optional(Schema.Literals(["up", "down"])),
  line: Schema.optional(Schema.String),
  page: Schema.optional(Schema.Array(Schema.String)),
  dialog: Schema.optional(Schema.Array(Schema.String)),
  starts: Schema.optional(Schema.Boolean)
})
export type FlowStep = typeof FlowStep.Type
