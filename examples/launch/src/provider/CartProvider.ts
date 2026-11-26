import { UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

export const CartMessage = UiSchema.TaggedEnum({
  RequestedAddItem: {}
})

export const CartProvider = Html.component({
  name: "CartProvider",
  model: Schema.Struct({ count: Schema.Number }),
  message: CartMessage,
  // value is what the Components inside the Provider read. receives
  // lists the Messages they may send it with $.send.
  shares: {
    value: ({ model }) => ({ count: model.count }),
    receives: ["RequestedAddItem"]
  }
}).make({
  init: () => ({ count: 0 }),
  update: {
    RequestedAddItem: ($) => $.evolve({ count: $.model.count + 1 })
  }
})
