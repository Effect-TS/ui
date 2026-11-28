import * as Component from "@effect/ui/Component"
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

export const CheckboxGroupShared = Schema.Struct({
  value: Schema.Array(Schema.String),
  disabled: Schema.Boolean,
  name: Schema.NullOr(Schema.String),
  parent: Schema.NullOr(Schema.Struct({
    checked: Schema.Boolean,
    indeterminate: Schema.Boolean,
    controls: Schema.String
  }))
})

export const CheckboxGroupReport = Schema.NullOr(CheckboxGroupItem)

// Checkboxes name the group by its key, so a standalone checkbox doesn't bundle `CheckboxGroup`.
export const CheckboxGroupKey = Component.sharedKey({
  name: "CheckboxGroup",
  schema: CheckboxGroupShared,
  message: CheckboxGroupMessage,
  receives: ["ToggledItem", "ToggledParent"],
  reports: CheckboxGroupReport
})
