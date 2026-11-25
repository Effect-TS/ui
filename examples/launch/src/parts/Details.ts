import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { Disclosure } from "./Disclosure.ts"

export const Details = Html.component({
  name: "Details",
  // Nothing to store: Disclosure holds the open state.
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    Disclosure(h, {
      // disclosure holds what Disclosure's parts returns. Each part
      // takes an element written here and returns it with the
      // attributes and handlers it needs.
      view: (disclosure) =>
        h.section.class("details").children(
          disclosure.trigger(h.button).children("Shipping"),
          disclosure.isOpen &&
            disclosure.panel(h.div).children("Arrives in 3 days.")
        )
    })
})
