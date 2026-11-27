import * as Component from "@effect/ui/Component"
import * as Schema from "effect/Schema"
import { Orientation } from "../ListNavigation.ts"

export const ToolbarShared = Schema.Struct({
  disabled: Schema.Boolean,
  orientation: Orientation,
  disabledItems: Schema.Array(Schema.String)
})

// Readers name the toolbar by its key, so they don't bundle `Toolbar`.
export const ToolbarKey = Component.sharedKey({
  name: "Toolbar",
  schema: ToolbarShared
})
