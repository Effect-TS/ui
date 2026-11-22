import { Component, Head, UiSchema } from "@effect/ui"
import { Button } from "@effect/ui-kit"
import { Array, Schema } from "effect"
import { Counter } from "./Counter.ts"

export const CountersModel = Schema.Struct({
  counterIds: Schema.Array(Schema.Number),
  nextCounterId: Schema.Number
})

export const CountersMessage = UiSchema.TaggedEnum({
  ClickedAddCounter: {},
  ClickedRemoveCounter: { id: Schema.Number }
})

export const Counters = Component.define({
  name: "Counters",
  scoped: false,
  model: CountersModel,
  message: CountersMessage
}).make({
  init: () => ({ counterIds: [1, 2, 3], nextCounterId: 4 }),
  update: {
    ClickedAddCounter: (model, _message, $) =>
      $.evolve({
        counterIds: Array.append(model.nextCounterId),
        nextCounterId: (id) => id + 1
      }),
    ClickedRemoveCounter: (_model, { id }, $) => $.evolve({ counterIds: Array.filter((counterId) => counterId !== id) })
  },
  head: (model) => [Head.title(`Counters (${model.counterIds.length})`)],
  view: (model, h) =>
    h.div.class("min-h-screen bg-white flex flex-col items-center py-12 px-6 gap-6").children(
      h.h1.class("text-2xl font-semibold text-gray-900").children("Counters"),
      h.p.class("text-sm text-gray-500 max-w-md text-center").children(
        "Each row is a Counter child keyed by its id. The parent holds only the list of ids, and each Counter keeps its own count, so adding, updating or removing one leaves the others as they were."
      ),
      h.div.class("flex flex-col gap-3 w-full max-w-md").children(
        model.counterIds.map((id) => {
          const labelId = h.id("label", id)
          return h.div.key(String(id)).attr("role", "group").attr("aria-labelledby", labelId)
            .class("flex items-center gap-2").children(
              h.span.id(labelId).class("w-20 text-sm text-gray-500").children(`Counter ${id}`),
              h.div.class("flex-1").children(Counter(h, { key: String(id) })),
              Button(h, { onPress: CountersMessage.ClickedRemoveCounter({ id }) })
                .class(
                  "rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:border-red-300 hover:text-red-600 transition cursor-pointer"
                )
                .children("Remove")
            )
        })
      ),
      Button(h, { onPress: CountersMessage.ClickedAddCounter() })
        .class(
          "rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition cursor-pointer"
        )
        .children("+ Add Counter")
    )
})
