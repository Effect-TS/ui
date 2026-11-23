import { Component } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { Editor } from "./Editor.ts"

export const Page = Component.define({
  name: "Page",
  scoped: false,
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({
  init: () => ({}),
  update: (model) => model,
  view: (_model, h) => h.main.children(Editor(h, {}))
})
