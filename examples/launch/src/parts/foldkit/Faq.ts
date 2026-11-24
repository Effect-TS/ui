import { Disclosure } from "@foldkit/ui"
import { Schema } from "effect"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"

export const Model = Schema.Struct({ isAnswerOpen: Schema.Boolean })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ToggledAnswer: { isOpen: Schema.Boolean }
})
export type Message = typeof Message.Type

export const init = () => ({ model: { isAnswerOpen: false } })

export const update = (
  _model: Model,
  message: Message
): Update.Return<Model, Message> =>
  Message.match(message, {
    ToggledAnswer: ({ isOpen }) => ({
      model: { isAnswerOpen: isOpen }
    })
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  Disclosure.view({
    id: "returns",
    isOpen: model.isAnswerOpen,
    onToggle: (isOpen) => Message.ToggledAnswer({ isOpen }),
    toView: ({ button, panel }) =>
      h.div([h.Class("faq")], [
        h.button([...button, h.Class("faq-question")], [
          "Can I return an order?"
        ]),
        model.isAnswerOpen
          ? h.div([...panel, h.Class("faq-answer")], [
            "Yes, within 30 days."
          ])
          : h.empty
      ])
  }, h)
