import { Option, Schema } from "effect"
import { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import * as Counter from "./Counter.ts"

export const Model = Schema.Struct({
  isCounterShown: Schema.Boolean,
  counter: Counter.Model
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ClickedToggleCounter: {},
  GotCounterMessage: { message: Counter.Message }
})
export type Message = typeof Message.Type

export const init = () => ({
  model: { isCounterShown: true, counter: Counter.init() }
})

const foldCounter = Update.foldChild({
  update: Counter.update,
  read: (model: Model) => Option.some(model.counter),
  write: (model: Model, counter: Counter.Model): Model => ({
    ...model,
    counter
  }),
  toParentMessage: (message: Counter.Message): Message =>
    Message.GotCounterMessage({ message })
})

export const update = (
  model: Model,
  message: Message
): Update.Return<Model, Message> =>
  Message.match(message, {
    ClickedToggleCounter: () => ({
      model: { ...model, isCounterShown: !model.isCounterShown }
    }),
    GotCounterMessage: ({ message }) => foldCounter(model, message)
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class("counter-page")], [
    h.button([h.OnClick(Message.ClickedToggleCounter())], [
      model.isCounterShown ? "Hide counter" : "Show counter"
    ]),
    model.isCounterShown
      ? h.submodel({
        slotId: "counter",
        model: model.counter,
        view: Counter.view,
        toParentMessage: (message) =>
          Message.GotCounterMessage({ message })
      })
      : h.empty
  ])
