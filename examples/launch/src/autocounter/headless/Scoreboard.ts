import { Component } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { Counter } from "./Counter.ts"

export const Scoreboard = Component.define({
  name: "Scoreboard",
  scoped: false,
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({
  init: () => ({}),
  update: (model) => model,
  view: (_model, h) =>
    h.div.class("drawings").children(
      Counter(h, {
        key: "compact",
        view: (counter) =>
          h.div.class("counter").attrs({ role: "group", "aria-label": "Compact counter" }).children(
            h.output.class("count").children(String(counter.count)),
            counter.increment(h.button.attr("aria-label", "Increment")).children("+")
          )
      }),
      Counter(h, {
        key: "scoreboard",
        view: (counter) =>
          h.section.class("scoreboard").attr("aria-label", "Scoreboard").children(
            h.output.class("score").children(String(counter.count)),
            h.div.class("counter").children(
              counter.increment(h.button).children("Add a point"),
              counter.toggleAutoCount(h.button).children(counter.isAutoCounting ? "Stop" : "Auto-count")
            )
          )
      })
    )
})
