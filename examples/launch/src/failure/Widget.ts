import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

const WidgetMessage = UiSchema.TaggedEnum({ ClickedBreak: {} })

export const Widget = Component.define({
  name: "Widget",
  scoped: false,
  model: Schema.Struct({}),
  message: WidgetMessage,
  elements: Html
}).make({
  init: () => ({}),
  update: {
    ClickedBreak: () => {
      throw new Error("Widget failed")
    }
  },
  view: (_model, h) => h.button.onClick(WidgetMessage.ClickedBreak()).children("Break the widget")
})
