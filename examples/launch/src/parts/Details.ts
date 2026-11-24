import { Component } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { Disclosure } from "./Disclosure.ts"

export const Details = Component.define({
  name: "Details",
  // Nothing to store: Disclosure holds the open state.
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    Disclosure(h, {
      view: (disclosure) =>
        h.section.class("details").children(
          disclosure.trigger(h.button).children("Shipping"),
          disclosure.isOpen &&
            disclosure.panel(h.div).children("Arrives in 3 days.")
        )
    })
})
