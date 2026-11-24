import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

export const Message = UiSchema.TaggedEnum({ ClickedTrigger: {} })

export const Disclosure = Component.define({
  name: "Disclosure",
  model: Schema.Struct({ isOpen: Schema.Boolean }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ isOpen: false }),
  update: {
    ClickedTrigger: ($) => $.evolve({ isOpen: !$.model.isOpen })
  },
  parts: (p, model) => ({
    isOpen: model.isOpen,
    trigger: p.part("button", (button) =>
      button.attrs({
        type: "button",
        "aria-expanded": String(model.isOpen),
        "aria-controls": p.id("panel")
      }).onClick(Message.ClickedTrigger())),
    panel: p.part("div", (div) => div.id(p.id("panel")))
  })
})
