import { Component, UiSchema } from "@effect/ui"
import { DevTools } from "@effect/ui-devtools"
import { BrowserHost, Html } from "@effect/ui/html"
import { Effect, Layer, Schema } from "effect"

const SceneMessage = UiSchema.TaggedEnum({
  ClickedCount: {},
  ClickedMenu: {},
  ToggledMenu: { open: Schema.Boolean },
  ClickedOpenDialog: {},
  ClickedCloseDialog: {}
})

const Scene = Component.define({
  name: "Scene",
  model: Schema.Struct({
    count: Schema.Number,
    menu: Schema.Boolean,
    dialog: Schema.Boolean
  }),
  message: SceneMessage,
  elements: Html
}).make({
  init: () => ({ count: 0, menu: false, dialog: false }),
  update: {
    ClickedCount: ($) => $.evolve({ count: $.model.count + 1 }),
    ClickedMenu: ($) => $.evolve({ menu: true }),
    ToggledMenu: ($, { open }) => $.evolve({ menu: open }),
    ClickedOpenDialog: ($) => $.evolve({ dialog: true }),
    ClickedCloseDialog: ($) => $.evolve({ dialog: false })
  },
  view: (h, model) =>
    h.main(
      h.button.onClick(SceneMessage.ClickedCount()).children(
        "Count " + model.count
      ),
      h.button.onClick(SceneMessage.ClickedMenu()).children("Open menu"),
      h.div.attr("id", "menu").popover("auto", model.menu).onToggle((
        { open }
      ) => SceneMessage.ToggledMenu({ open }))
        .children(
          h.p("Menu"),
          h.button.onClick(SceneMessage.ClickedOpenDialog()).children(
            "Open dialog"
          )
        ),
      h.dialog.attr("aria-label", "Settings").modal(model.dialog).onCancel(
        SceneMessage.ClickedCloseDialog()
      )
        .children(
          h.p("Settings"),
          h.button.onClick(SceneMessage.ClickedCloseDialog()).children(
            "Close dialog"
          )
        )
    )
})

const Main = BrowserHost.mount(Scene, {}, document.getElementById("root")!)
  .pipe(
    Layer.provide(DevTools.layer({ position: "BottomRight" }))
  )

Layer.launch(Main).pipe(Effect.runFork)
document.body.setAttribute("data-ready", "")
