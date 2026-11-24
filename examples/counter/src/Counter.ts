import { Head, UiSchema } from "@effect/ui"
import { Button } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

export const CounterModel = Schema.Struct({
  count: Schema.Number
})

export const CounterMessage = UiSchema.TaggedEnum({
  ClickedDecrement: {},
  ClickedIncrement: {},
  ClickedReset: {}
})

const BUTTON_CLASS =
  "bg-black text-white hover:bg-gray-700 px-4 py-2 transition"

export const Counter = Html.component({
  name: "Counter",
  model: CounterModel,
  message: CounterMessage
}).make({
  init: () => ({ count: 0 }),
  update: {
    ClickedDecrement: ($) => $.evolve({ count: (count) => count - 1 }),
    ClickedIncrement: ($) => $.evolve({ count: (count) => count + 1 }),
    ClickedReset: ($) => $.evolve({ count: 0 })
  },
  head: ({ model }) => [Head.title(`Counter: ${model.count}`)],
  view: (h, model) =>
    h.div.class(
      "min-h-screen bg-white flex flex-col items-center justify-center gap-6 p-6"
    ).children(
      h.p.class("text-6xl font-bold text-gray-800").children(
        String(model.count)
      ),
      h.div.class("flex flex-wrap justify-center gap-4").children(
        Button(h, { onPress: CounterMessage.ClickedDecrement() }).class(
          BUTTON_CLASS
        ).children("-"),
        Button(h, { onPress: CounterMessage.ClickedReset() }).class(
          BUTTON_CLASS
        ).children("Reset"),
        Button(h, { onPress: CounterMessage.ClickedIncrement() }).class(
          BUTTON_CLASS
        ).children("+")
      )
    )
})
