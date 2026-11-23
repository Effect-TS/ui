import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { Counter } from "../counter/effect/Counter.ts"
import { Widget } from "./Widget.ts"

const PageMessage = UiSchema.TaggedEnum({ ClickedRestartWidget: {} })

export const WidgetPage = Component.define({
  name: "WidgetPage",
  scoped: false,
  model: Schema.Struct({ restarts: Schema.Number }),
  message: PageMessage,
  elements: Html
}).make({
  init: () => ({ restarts: 0 }),
  update: {
    ClickedRestartWidget: (model) => ({ restarts: model.restarts + 1 })
  },
  view: (model, h) =>
    h.div.class("counter-page").children(
      Counter(h, {}),
      Widget(h, {
        key: String(model.restarts),
        fallback: () =>
          h.span.class("counter").attr("role", "alert").children(
            "The widget failed.",
            h.button.onClick(PageMessage.ClickedRestartWidget()).children("Restart the widget")
          )
      })
    )
})
