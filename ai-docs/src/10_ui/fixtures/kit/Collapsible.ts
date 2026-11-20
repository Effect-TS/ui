import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

// A kit component with a view of its own and named slots. It owns the markup
// around its content and whether the body is open. What goes inside is the
// parent's: the parent writes it with its own `h`, so its handlers send the
// parent's messages and its children report to the parent.

export const CollapsibleMessage = UiSchema.TaggedEnum({ ClickedToggle: {} })

export const Collapsible = Component.define({
  name: "Collapsible",
  lifetime: "view",
  model: Schema.Struct({ open: Schema.Boolean }),
  message: CollapsibleMessage,
  elements: Html,
  // The slot names, as `receives` lists message tags. A parent can pass
  // content for any of them, and a slot it leaves out shows nothing.
  slots: ["summary", "body"]
}).make({
  init: () => ({ open: true }),
  update: (model) => ({ open: !model.open }),
  // `h.slots.<name>` places a slot's content: once per render, anywhere in
  // the view. A parent's re-render patches only the content, so this view
  // doesn't run for it. Leaving a slot out of the view unmounts its content,
  // and placing it again mounts it fresh.
  view: (model, h) =>
    h.section(
      h.header(
        h.slots.summary,
        h.button
          .attr("type", "button")
          .attr("aria-expanded", model.open ? "true" : "false")
          .onClick(CollapsibleMessage.ClickedToggle())
          .children(model.open ? "Hide" : "Show")
      ),
      model.open && h.slots.body
    )
})
