import { UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

export const CodeGroupMessage = UiSchema.TaggedEnum({
  RequestedSetRow: { row: Schema.Number, isOpen: Schema.Boolean }
})

/**
 * A Provider for the files of a comparison. It holds which rows are
 * open, so the files level with each other on the two sides open and
 * close together.
 */
export const CodeGroup = Html.component({
  name: "CodeGroup",
  model: Schema.Struct({ openRows: Schema.Array(Schema.Number) }),
  message: CodeGroupMessage,
  shares: {
    value: ({ model }) => ({ openRows: model.openRows }),
    receives: ["RequestedSetRow"]
  }
}).make({
  init: () => ({ openRows: [] }),
  update: {
    RequestedSetRow: ($, { isOpen, row }) =>
      $.evolve({
        openRows: (rows) => {
          const others = rows.filter((other) => other !== row)
          return isOpen ? [...others, row] : others
        }
      })
  }
})
