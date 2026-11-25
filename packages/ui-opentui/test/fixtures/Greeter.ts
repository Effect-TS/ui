import { UiSchema } from "@effect/ui"
import { OpenTui } from "@effect/ui-opentui"
import { Schema } from "effect"

const Message = UiSchema.TaggedEnum({ TypedName: { value: Schema.String } })

export const Greeter = OpenTui.component({
  name: "Greeter",
  model: Schema.Struct({ name: Schema.String }),
  message: Message
}).make({
  init: () => ({ name: "" }),
  update: { TypedName: ($, { value }) => $.evolve({ name: value }) },
  view: (h, model) =>
    h.box.children(
      h.text("Hello " + model.name),
      h.input.style({ width: 20 }).value(model.name).focused(true).onInput((
        { value }
      ) => Message.TypedName({ value }))
    )
})
