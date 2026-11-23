// SPIKE (EFF-4218): counter-spike.ts hydrating what today's server rendered, with the state it shipped.
import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import * as SpikeHydrate from "@effect/ui/html/SpikeHydrate"
import { Effect, Layer, Schema } from "effect"

const Message = UiSchema.TaggedEnum({ Increment: {}, Decrement: {} })

const Counter = Component.define({
  name: "Counter",
  model: Schema.Number,
  message: Message,
  elements: Html
}).make({
  init: () => 0,
  update: ($, message) =>
    message._tag === "Increment" ? $.model + 1 : $.model - 1,
  view: (h, model) =>
    h.div.children(
      h.button.onClick(Message.Decrement()).children("-"),
      h.span.children(String(model)),
      h.button.onClick(Message.Increment()).children("+")
    )
})

const app = document.getElementById("app")!
const state = JSON.parse(document.getElementById("state")?.textContent ?? "{}")

Layer.launch(SpikeHydrate.hydrate(Counter, {}, app, state)).pipe(Effect.runFork)
