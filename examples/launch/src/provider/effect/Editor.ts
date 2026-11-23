import { Command, Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Effect, Schema } from "effect"
import { Drafts } from "../Drafts.ts"

const EditorMessage = UiSchema.TaggedEnum({
  ChangedText: { text: Schema.String }
})

class SaveDraft extends Command.Service<SaveDraft>()(
  "SaveDraft",
  { args: { text: Schema.String } },
  Effect.gen(function*() {
    const drafts = yield* Drafts
    return ({ text }) => drafts.save(text)
  })
) {}

export const EditorNoDeps = Component.define({
  name: "Editor",
  scoped: false,
  model: Schema.Struct({ text: Schema.String }),
  message: EditorMessage,
  elements: Html
}).make({
  init: () => ({ text: "" }),
  update: {
    ChangedText: (_model, { text }, $) => $.set({ text }).run(SaveDraft.make({ text }).pipe(Command.asNoop))
  },
  view: (model, h) => h.textarea.value(model.text).onInput(({ value }) => EditorMessage.ChangedText({ text: value }))
})

export const Editor = EditorNoDeps.pipe(
  Component.provide(SaveDraft.layer),
  Component.provide(Drafts.layer)
)
