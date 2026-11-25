// The modules of @effect/ui-kit. components.test.ts checks these lists
// against the package's source.

// The components that Base UI has too.
export const components = [
  "Accordion",
  "AlertDialog",
  "Autocomplete",
  "Avatar",
  "Button",
  "Checkbox",
  "CheckboxGroup",
  "Collapsible",
  "Combobox",
  "ContextMenu",
  "Dialog",
  "Drawer",
  "Field",
  "Fieldset",
  "Form",
  "Input",
  "Menu",
  "Menubar",
  "Meter",
  "NavigationMenu",
  "NumberField",
  "OTPField",
  "Popover",
  "PreviewCard",
  "Progress",
  "RadioGroup",
  "ScrollArea",
  "Select",
  "Separator",
  "Slider",
  "Switch",
  "Tabs",
  "Toast",
  "Toggle",
  "ToggleGroup",
  "Toolbar",
  "Tooltip"
] as const

export const extras = [
  "DirectionProvider",
  "Positioning",
  "VirtualKeyboard",
  "VirtualList"
] as const

export type Module =
  | (typeof components)[number]
  | (typeof extras)[number]
