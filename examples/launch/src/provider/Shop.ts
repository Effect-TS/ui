import { UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { CartMessage, CartProvider } from "./CartProvider.ts"

export const Shop = Html.component({
  name: "Shop",
  // Shop has no state and no Messages.
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    CartProvider(h, {
      // CartProvider draws nothing. Shop passes it this view, and
      // every Component rendered in it, at any depth, is inside the
      // Provider.
      view: () =>
        h.main(
          CartCount(h, {}),
          h.article(h.h3("Notebook"), AddToCart(h, {}))
        )
    })
})

const CartCount = Html.component({
  name: "CartCount",
  model: Schema.Null,
  message: Schema.Never,
  // Lists the Provider to read from.
  reads: { cart: CartProvider }
}).make({
  init: () => null,
  update: ($) => $.model,
  // h.reads.cart holds CartProvider's shared value. CartCount
  // renders again when that value changes.
  view: (h) => h.output(`${h.reads.cart.count} in cart`)
})

const AddToCartMessage = UiSchema.TaggedEnum({ ClickedAdd: {} })

const AddToCart = Html.component({
  name: "AddToCart",
  model: Schema.Null,
  message: AddToCartMessage
}).make({
  init: () => null,
  update: {
    // Sends the Message to the nearest CartProvider above. Sending
    // needs no reads entry.
    ClickedAdd: ($) =>
      $.send(CartProvider, CartMessage.RequestedAddItem())
  },
  view: (h) =>
    h.button.on("click", AddToCartMessage.ClickedAdd())
      .children("Add to cart")
})
