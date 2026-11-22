import { Dialog } from "@foldkit/ui"
import { Schema } from "effect"

export const Model = Schema.Struct({
  confirm: Dialog.Model
})
export type Model = typeof Model.Type
