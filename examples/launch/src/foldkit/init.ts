import { Dialog } from "@foldkit/ui"
import type { Runtime } from "foldkit"
import type { Message } from "./message.ts"
import type { Model } from "./model.ts"

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    confirm: Dialog.init({ id: "confirm", isAnimated: true })
  }
})
