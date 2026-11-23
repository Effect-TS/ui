import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { PanelLoader } from "./PanelLoader.ts"

const PageMessage = UiSchema.TaggedEnum({ ClickedTogglePanel: {} })

export const PanelPage = Component.define({
  name: "PanelPage",
  scoped: false,
  model: Schema.Struct({ isPanelShown: Schema.Boolean }),
  message: PageMessage,
  elements: Html
}).make({
  init: () => ({ isPanelShown: false }),
  update: {
    ClickedTogglePanel: (model) => ({ isPanelShown: !model.isPanelShown })
  },
  view: (model, h) =>
    h.div.class("counter-page").children(
      h.button.onClick(PageMessage.ClickedTogglePanel()).children(
        model.isPanelShown ? "Hide panel" : "Show panel"
      ),
      model.isPanelShown && PanelLoader(h, {
        fallback: () => h.span.attr("role", "alert").children("The panel failed to load")
      })
    )
})
