import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"

export const CheckboxGroupItem = Schema.Struct({
  value: Schema.String,
  disabled: Schema.Boolean,
  id: Schema.String
})

export type CheckboxGroupItem = typeof CheckboxGroupItem.Type

export const CheckboxGroupMessage = UiSchema.TaggedEnum({
  ToggledItem: { value: Schema.String },
  ToggledParent: {},
  ChangedItems: { items: Schema.Array(CheckboxGroupItem) }
})
