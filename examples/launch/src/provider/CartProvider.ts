import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

export const CartMessage = UiSchema.TaggedEnum({
  RequestedAddItem: {}
})

export const CartProvider = Component.define({
  name: "CartProvider",
  model: Schema.Struct({ count: Schema.Number }),
  message: CartMessage,
  // value is what the Components inside the Provider read. receives
  // lists the Messages they may send it with $.send.
  shares: {
    value: (model) => ({ count: model.count }),
    receives: ["RequestedAddItem"]
  },
  elements: Html
}).make({
  init: () => ({ count: 0 }),
  update: {
    RequestedAddItem: ($) => $.evolve({ count: $.model.count + 1 })
  },
  // A Component that shares state is headless: it has parts in
  // place of a view, and its consumer draws the markup. This one
  // has no parts to offer.
  parts: () => ({})
})
