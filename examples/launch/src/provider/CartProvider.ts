import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

export const CartMessage = UiSchema.TaggedEnum({ AddedItem: {} })

export const CartProvider = Component.define({
  name: "CartProvider",
  model: Schema.Struct({ count: Schema.Number }),
  message: CartMessage,
  shares: {
    value: (model) => ({ count: model.count }),
    receives: ["AddedItem"]
  },
  elements: Html
}).make({
  init: () => ({ count: 0 }),
  update: {
    AddedItem: ($) => $.evolve({ count: $.model.count + 1 })
  },
  parts: () => ({})
})
