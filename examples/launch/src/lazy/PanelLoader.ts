import { Component } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Effect, Layer, Schema } from "effect"
import { Panel } from "./Panel.ts"

const PanelLazy = Layer.unwrap(
  Effect.promise(() => import("./CounterPanel.ts")).pipe(
    Effect.map(({ CounterPanel }) => Panel.toLayer(CounterPanel))
  )
)

export const PanelLoaderNoDeps = Component.define({
  name: "PanelLoader",
  scoped: false,
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({
  init: () => ({}),
  update: (model) => model,
  view: (_model, h) => Panel.render(h, { fallback: () => h.span.attr("role", "status").children("Loading the panel") })
})

export const PanelLoader = PanelLoaderNoDeps.pipe(Component.provide(PanelLazy))
