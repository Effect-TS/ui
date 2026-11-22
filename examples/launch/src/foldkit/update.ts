import { Dialog } from "@foldkit/ui"
import { Option } from "effect"
import { Update } from "foldkit"
import { modifyFields } from "foldkit/struct"
import { Message } from "./message.ts"
import type { Model } from "./model.ts"

const foldConfirmOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => (model) => ({ model }),
  Closed: () => (model) => ({ model })
})

const readConfirm = (model: Model): Option.Option<Dialog.Model> => Option.some(model.confirm)

const writeConfirm = (model: Model, nextConfirm: Dialog.Model): Model =>
  modifyFields(model, { confirm: () => nextConfirm })

const toGotConfirmMessage = (message: Dialog.Message): Message => Message.GotConfirmMessage({ message })

const foldConfirm = Update.foldChild({
  update: Dialog.update,
  read: readConfirm,
  write: writeConfirm,
  toParentMessage: toGotConfirmMessage,
  foldOutMessage: foldConfirmOutMessage
})

const foldConfirmOpen = Update.foldChildStep({
  update: Dialog.open,
  read: readConfirm,
  write: writeConfirm,
  toParentMessage: toGotConfirmMessage,
  foldOutMessage: foldConfirmOutMessage
})

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedOpenConfirm: () => foldConfirmOpen(model),
    GotConfirmMessage: ({ message }) => foldConfirm(model, message)
  })
