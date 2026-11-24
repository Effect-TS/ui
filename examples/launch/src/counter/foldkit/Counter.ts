import { Schema } from "effect"
import type { Update } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineView } from "foldkit/submodel"

export const Model = Schema.Struct({ count: Schema.Number })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ClickedDecrement: {},
  ClickedIncrement: {}
})
export type Message = typeof Message.Type

export const init = (): Model => ({ count: 0 })

export const update = (
  model: Model,
  message: Message
): Update.Return<Model, Message> =>
  Message.match(message, {
    ClickedDecrement: () => ({ model: { count: model.count - 1 } }),
    ClickedIncrement: () => ({ model: { count: model.count + 1 } })
  })

export type ViewInputs = Readonly<{ label: string }>

export const view = defineView<Model, Message, ViewInputs>(
  (model, viewInputs, h) =>
    h.div([h.Class("counter")], [
      h.span([h.Class("counter-label")], [viewInputs.label]),
      h.button([
        h.Class("counter-button"),
        h.AriaLabel("Decrement"),
        h.OnClick(Message.ClickedDecrement())
      ], ["-"]),
      h.output([h.Class("counter-value")], [String(model.count)]),
      h.button([
        h.Class("counter-button"),
        h.AriaLabel("Increment"),
        h.OnClick(Message.ClickedIncrement())
      ], ["+"])
    ])
)
