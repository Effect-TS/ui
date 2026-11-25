import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { Orientation } from "./list.ts"

export const triggerAttribute = "data-menubar-trigger"

export const menubarOf = (element: Element): Element | null =>
  element.closest("[role=menubar]")

export const barTriggers = (bar: Element): Array<HTMLElement> =>
  Array.from(bar.querySelectorAll<HTMLElement>(`[${triggerAttribute}]`)).filter(
    (trigger) => menubarOf(trigger) === bar
  )

export const MenubarMenu = Schema.Struct({
  open: Schema.Boolean,
  trigger: Schema.NullOr(Schema.String)
})

export type MenubarMenu = typeof MenubarMenu.Type

export const MenubarShared = Schema.Struct({
  orientation: Orientation,
  modal: Schema.Boolean,
  disabled: Schema.Boolean,
  rtl: Schema.Boolean,
  hasSubmenuOpen: Schema.Boolean,
  current: Schema.NullOr(Schema.String),
  tabStop: Schema.NullOr(Schema.String),
  opening: Schema.NullOr(Schema.String)
})

export type MenubarShared = typeof MenubarShared.Type

export const MenubarMessage = UiSchema.TaggedEnum({
  ChangedMenus: { menus: Schema.Array(MenubarMenu) },
  FoundTriggers: { triggers: Schema.Array(Schema.String), rtl: Schema.Boolean },
  Navigated: {
    from: Schema.NullOr(Schema.String),
    key: Schema.String,
    open: Schema.Boolean
  },
  FocusedTrigger: { trigger: Schema.String }
})

export type MenubarMessage = typeof MenubarMessage.Type
