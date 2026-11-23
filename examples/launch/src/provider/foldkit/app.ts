import { Option, Schema } from "effect"
import { Update } from "foldkit"
import type { Document, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import * as Editor from "./editor.ts"

export const Model = Schema.Struct({ editor: Editor.Model })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({ GotEditorMessage: { message: Editor.Message } })
export type Message = typeof Message.Type

export const init = () => ({ model: { editor: { text: "" } } })

const foldEditor = Update.foldChild({
  update: Editor.update,
  read: (model: Model) => Option.some(model.editor),
  write: (model: Model, editor: Editor.Model): Model => ({ ...model, editor }),
  toParentMessage: (message: Editor.Message): Message => Message.GotEditorMessage({ message })
})

export const update = (model: Model, message: Message) =>
  Message.match(message, { GotEditorMessage: ({ message }) => foldEditor(model, message) })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "Editor",
  body: h.textarea([
    h.Value(model.editor.text),
    h.OnInput((text) => Message.GotEditorMessage({ message: Editor.Message.ChangedText({ text }) }))
  ])
})
