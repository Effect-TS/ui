import { Schema } from "effect"

export const FlowStep = Schema.Struct({
  kind: Schema.Literals(["message", "event", "props", "mount", "command", "outmessage"]),
  at: Schema.Literals(["page", "dialog"]),
  move: Schema.Literals(["up", "down", "none"]),
  name: Schema.String,
  where: Schema.String,
  caption: Schema.String,
  line: Schema.String,
  page: Schema.NullOr(Schema.Array(Schema.String)),
  dialog: Schema.NullOr(Schema.Array(Schema.String)),
  starts: Schema.Boolean
})
export type FlowStep = typeof FlowStep.Type

export const step = (
  fields: Pick<FlowStep, "kind" | "at" | "name" | "where" | "caption"> & Partial<FlowStep>
): FlowStep => ({ move: "none", line: "", page: null, dialog: null, starts: false, ...fields })
