import { Effect, Schema } from "effect"
import { Command } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { Drafts } from "../Drafts.ts"

export const Model = Schema.Struct({ text: Schema.String })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChangedText: { text: Schema.String },
  SavedDraft: {}
})
export type Message = typeof Message.Type

export const SaveDraft = Command.define("SaveDraft", {
  args: { text: Schema.String },
  messages: [Message.SavedDraft],
  execute: Effect.fnUntraced(function*({ text }) {
    const drafts = yield* Drafts
    yield* drafts.save(text)
    return Message.SavedDraft()
  })
})

export const update = (model: Model, message: Message) =>
  Message.match(message, {
    ChangedText: ({ text }) => ({ model: { text }, commands: [SaveDraft({ text })] }),
    SavedDraft: () => ({ model })
  })
