import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { CartMessage, CartProvider } from "./CartProvider.ts"

export const Shop = Component.define({
  name: "Shop",
  // Shop keeps no state and has no Messages: a null Model and an
  // update with nothing to handle.
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    CartProvider(h, {
      // CartProvider draws nothing. Shop passes it this view, and
      // every Component rendered in it, at any depth, is inside the
      // Provider.
      view: () => h.main(CartCount(h, {}), Product(h, {}))
    })
})

const CartCount = Component.define({
  name: "CartCount",
  model: Schema.Null,
  message: Schema.Never,
  // Lists the Provider to read. Its value is h.shared.cart, and
  // CartCount renders again when that value changes.
  shared: { cart: CartProvider },
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.output(`${h.shared.cart.count} in cart`)
})

const Product = Component.define({
  name: "Product",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.article(h.h3("Notebook"), AddToCart(h, {}))
})

const AddToCartMessage = UiSchema.TaggedEnum({ ClickedAdd: {} })

const AddToCart = Component.define({
  name: "AddToCart",
  model: Schema.Null,
  message: AddToCartMessage,
  elements: Html
}).make({
  init: () => null,
  update: {
    // Sends the Message to the nearest CartProvider above. Sending
    // needs no shared entry.
    ClickedAdd: ($) =>
      $.send(CartProvider, CartMessage.RequestedAddItem())
  },
  view: (h) =>
    h.button.onClick(AddToCartMessage.ClickedAdd())
      .children("Add to cart")
})
