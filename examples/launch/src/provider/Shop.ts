import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { CartMessage, CartProvider } from "./CartProvider.ts"

const CartCount = Component.define({
  name: "CartCount",
  model: Schema.Null,
  message: Schema.Never,
  shared: { cart: CartProvider },
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.output(`${h.shared.cart.count} in cart`)
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
    ClickedAdd: ($) => $.send(CartProvider, CartMessage.AddedItem())
  },
  view: (h) =>
    h.button.onClick(AddToCartMessage.ClickedAdd())
      .children("Add to cart")
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

export const Shop = Component.define({
  name: "Shop",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    CartProvider(h, {
      view: () => h.main(CartCount(h, {}), Product(h, {}))
    })
})
