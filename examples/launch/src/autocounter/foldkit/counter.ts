import { Effect, Schema } from "effect"
import { Command } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"

export const Model = Schema.Struct({ count: Schema.Number })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ClickedIncrement: {},
  ClickedResetAfterDelay: {},
  CompletedDelayReset: {}
})
export type Message = typeof Message.Type

export const DelayReset = Command.define("DelayReset", {
  messages: [Message.CompletedDelayReset],
  execute: Effect.sleep("1 second").pipe(Effect.as(Message.CompletedDelayReset()))
})

export const update = (model: Model, message: Message) =>
  Message.match(message, {
    ClickedIncrement: () => ({ model: { count: model.count + 1 } }),
    ClickedResetAfterDelay: () => ({ model, commands: [DelayReset] }),
    CompletedDelayReset: () => ({ model: { count: 0 } })
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([], [
    h.output([], [String(model.count)]),
    h.button([h.OnClick(Message.ClickedIncrement())], ["Increment"]),
    h.button([h.OnClick(Message.ClickedResetAfterDelay())], ["Reset in 1 second"])
  ])
