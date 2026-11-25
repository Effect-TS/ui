import { UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

export const Message = UiSchema.TaggedEnum({ ClickedTrigger: {} })

export const Disclosure = Html.component({
  name: "Disclosure",
  model: Schema.Struct({ isOpen: Schema.Boolean }),
  message: Message
}).make({
  init: () => ({ isOpen: false }),
  update: {
    ClickedTrigger: ($) => $.evolve({ isOpen: !$.model.isOpen })
  },
  // parts takes p, the helper that builds parts, as a view takes h,
  // the helper that builds elements. What it returns is what the
  // consumer's view receives: plain values such as isOpen, and parts.
  parts: (p, model) => ({
    isOpen: model.isOpen,
    // p.part makes a part. This one decorates a <button> that the
    // consumer supplies. The click sends Disclosure's own Message to
    // Disclosure's update.
    trigger: p.part("button", (button) =>
      button.attrs({
        type: "button",
        "aria-expanded": String(model.isOpen),
        "aria-controls": p.id("panel")
      }).on("click", Message.ClickedTrigger())),
    panel: p.part("div", (div) => div.id(p.id("panel")))
  })
})
