import { Dialog } from "@foldkit/ui"
import type { Document, HtmlBuilder } from "foldkit/html"
import { Message } from "./message.ts"
import type { Model } from "./model.ts"

const confirmView = (h: HtmlBuilder<Message>) =>
({
  dialog,
  backdrop,
  panel,
  title,
  description,
  closeButton,
  isVisible
}: Dialog.RenderInfo) =>
  h.dialog(
    [...dialog, h.Class("dialog")],
    isVisible
      ? [
        h.div([...backdrop, h.Class("backdrop")]),
        h.div(
          [...panel, h.Class("popup")],
          [
            h.h2([...title], ["Discard this draft?"]),
            h.p([...description], ["Your changes since the last save will be lost."]),
            h.div(
              [h.Class("actions")],
              [
                h.button([...closeButton, h.Class("button")], ["Keep editing"]),
                h.button([...closeButton, h.Class("button primary")], ["Discard"])
              ]
            )
          ]
        )
      ]
      : []
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "Discard draft",
  body: h.div(
    [],
    [
      h.button([h.Class("button"), h.OnClick(Message.ClickedOpenConfirm())], ["Discard draft"]),
      h.submodel({
        slotId: model.confirm.id,
        model: model.confirm,
        view: Dialog.view,
        viewInputs: {
          hasDescription: true,
          toView: confirmView(h)
        },
        toParentMessage: (message) => Message.GotConfirmMessage({ message })
      })
    ]
  )
})
