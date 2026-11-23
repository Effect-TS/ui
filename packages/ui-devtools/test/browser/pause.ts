import { Component, Feature, UiSchema } from "@effect/ui"
import { DevTools } from "@effect/ui-devtools"
import { BrowserHost, Html, HtmlSubscription } from "@effect/ui/html"
import { Effect, Layer, Schema } from "effect"

const SceneMessage = UiSchema.TaggedEnum({
  ClickedCount: {},
  ClickedMenu: {},
  ToggledMenu: { open: Schema.Boolean },
  ClickedOpenDialog: {},
  ClickedCloseDialog: {},
  ClickedDocument: {}
})

class Editor extends Feature.Service<Editor>()("pause/Editor", { props: Schema.Struct({}) }) {}

const EditorView = Component.define({
  name: "EditorView",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({ init: () => null, update: ($) => $.model, view: (h) => h.span.class("editor").children("Editor ready") })

const Notes = Component.define({
  name: "Notes",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
})
  .make({ init: () => null, update: ($) => $.model, view: (h) => h.span.class("notes").children("Notes") })

const Shown = Component.define({
  name: "Shown",
  scoped: false,
  props: Schema.Struct({ n: Schema.Number }),
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({ init: () => null, update: ($) => $.model, view: (h) => h.span.class("shown").children(String(h.props.n)) })

const Panel = Component.define({
  name: "Panel",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
})
  .make({
    init: () => null,
    update: ($) => $.model,
    view: (h) =>
      h.section.class("panel").children(
        Editor.render(h, { key: "e", props: {}, fallback: () => h.span.class("editor").children("Editor loading") }),
        Notes(h, { key: "n" })
      )
  })
  .pipe(Component.provide(Editor.toLayer(EditorView)))

const Scene = Component.define({
  name: "Scene",
  scoped: false,
  model: Schema.Struct({
    count: Schema.Number,
    menu: Schema.Boolean,
    dialog: Schema.Boolean,
    clicks: Schema.Number
  }),
  message: SceneMessage,
  elements: Html
}).make({
  init: () => ({ count: 0, menu: false, dialog: false, clicks: 0 }),
  update: {
    ClickedCount: ($) => $.evolve({ count: $.model.count + 1 }),
    ClickedMenu: ($) => $.evolve({ menu: true }),
    ToggledMenu: ($, { open }) => $.evolve({ menu: open }),
    ClickedOpenDialog: ($) => $.evolve({ dialog: true }),
    ClickedCloseDialog: ($) => $.evolve({ dialog: false }),
    ClickedDocument: ($) => $.evolve({ clicks: $.model.clicks + 1 })
  },
  subscriptions: () => [
    HtmlSubscription.onDocument("click", () => SceneMessage.ClickedDocument()),
    HtmlSubscription.onDocument("keydown", ({ key }) => key === "d" ? SceneMessage.ClickedOpenDialog() : undefined)
  ],
  view: (h, model) =>
    h.main(
      h.button.onClick(SceneMessage.ClickedCount()).children("Count " + model.count),
      h.button.onClick(SceneMessage.ClickedMenu()).children("Open menu"),
      Panel(h, { key: "p" }),
      Shown(h, { key: "a", props: { n: model.count } }),
      Shown(h, { key: "b", props: { n: model.count } }),
      h.output.class("clicks").children("Document clicks " + model.clicks),
      h.div.attr("id", "menu").popover("auto", model.menu).onToggle(({ open }) => SceneMessage.ToggledMenu({ open }))
        .children(
          h.p("Menu"),
          h.button.onClick(SceneMessage.ClickedOpenDialog()).children("Open dialog")
        ),
      h.dialog.attr("aria-label", "Settings").modal(model.dialog).onCancel(SceneMessage.ClickedCloseDialog())
        .children(
          h.p("Settings"),
          h.button.onClick(SceneMessage.ClickedCloseDialog()).children("Close dialog")
        )
    )
})

const Main = BrowserHost.mount(Scene, {}, document.getElementById("root")!).pipe(
  Layer.provide(DevTools.layer({ position: "BottomRight" }))
)

Layer.launch(Main).pipe(Effect.runFork)
document.body.setAttribute("data-ready", "")
