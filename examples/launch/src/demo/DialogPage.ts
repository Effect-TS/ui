import { Component, UiSchema } from "@effect/ui"
import { Dialog } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

const DialogPageMessage = UiSchema.TaggedEnum({
  OpenedConfirm: {},
  DismissedConfirm: {}
})

export const DialogPage = Component.define({
  name: "DialogPage",
  scoped: false,
  model: Schema.Struct({ confirm: Schema.Boolean }),
  message: DialogPageMessage,
  elements: Html
}).make({
  init: () => ({ confirm: false }),
  update: {
    OpenedConfirm: (_model, _message, $) => $.evolve({ confirm: true }),
    DismissedConfirm: (_model, _message, $) => $.evolve({ confirm: false })
  },
  view: (model, h) =>
    Dialog(h, {
      props: { open: model.confirm },
      onEmit: {
        Opened: () => DialogPageMessage.OpenedConfirm(),
        Dismissed: () => DialogPageMessage.DismissedConfirm(),
        Settled: () => undefined
      },
      view: (dialog) =>
        h.div(
          dialog.trigger(h.button.class("button")).children("Discard draft"),
          dialog.portal(h.dialog.class("dialog"))?.children(
            dialog.backdrop(h.div.class("backdrop")),
            dialog.popup(h.div.class("popup")).children(
              dialog.title(h.h2).children("Discard this draft?"),
              dialog.description(h.p).children("Your changes since the last save will be lost."),
              h.div.class("actions").children(
                dialog.close(h.button.class("button")).children("Keep editing"),
                dialog.close(h.button.class("button primary")).children("Discard")
              )
            )
          )
        )
    })
})
