// SPIKE (EFF-4218): counter.ts on the kernel and its DOM host.
import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import * as KernelDom from "@effect/ui/html/KernelDom"
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

Layer.launch(KernelDom.mount(Counter, {}, document.getElementById("app")!))
  .pipe(Effect.runFork)
