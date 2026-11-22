import { Dialog } from "@foldkit/ui"
import { defineMessageUnion } from "foldkit/message"

export const Message = defineMessageUnion({
  ClickedOpenConfirm: {},
  GotConfirmMessage: { message: Dialog.Message }
})
export type Message = typeof Message.Type
