import { Component, UiSchema } from "@effect/ui"
import { Button } from "@effect/ui-kit"
import { Schema } from "effect"

export const CounterModel = Schema.Struct({
  count: Schema.Number
})

export const CounterMessage = UiSchema.TaggedEnum({
  ClickedDecrement: {},
  ClickedIncrement: {}
})

const BUTTON_CLASS =
  "h-9 w-9 rounded bg-gray-900 text-white text-lg leading-none hover:bg-gray-700 transition cursor-pointer"

export const Counter = Component.define({
  name: "Counter",
  scoped: false,
  model: CounterModel,
  message: CounterMessage
}).make({
  init: () => ({ count: 0 }),
  update: {
    ClickedDecrement: (_model, _message, $) => $.evolve({ count: (count) => count - 1 }),

    ClickedIncrement: (_model, _message, $) => $.evolve({ count: (count) => count + 1 })
  },
  view: (model, h) =>
    h.div.class("flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3").children(
      Button(h, { onPress: CounterMessage.ClickedDecrement() }).attr("aria-label", "Decrement").class(BUTTON_CLASS)
        .children("-"),
      h.output.class("w-12 text-center text-2xl font-mono tabular-nums").children(String(model.count)),
      Button(h, { onPress: CounterMessage.ClickedIncrement() }).attr("aria-label", "Increment").class(BUTTON_CLASS)
        .children("+")
    )
})
