// SPIKE (EFF-4218): counter.ts on the kernel and its DOM host.
import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import * as SpikeDom from "@effect/ui/html/SpikeDom"
import { Effect, Layer, Schema } from "effect"

const Message = UiSchema.TaggedEnum({ Increment: {}, Decrement: {} })

const Counter = Component.define({
  name: "Counter",
  scoped: false,
  model: Schema.Number,
  message: Message,
  elements: Html
}).make({
  init: () => 0,
  update: (model, message) => message._tag === "Increment" ? model + 1 : model - 1,
  view: (model, h) =>
    h.div.children(
      h.button.onClick(Message.Decrement()).children("-"),
      h.span.children(String(model)),
      h.button.onClick(Message.Increment()).children("+")
    )
})

Layer.launch(SpikeDom.mount(Counter, {}, document.getElementById("app")!)).pipe(Effect.runFork)
