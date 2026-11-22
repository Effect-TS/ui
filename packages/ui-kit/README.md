# @effect/ui-kit

Unstyled components for [`@effect/ui`](../ui). Each one owns the behaviour, ARIA, data attributes and any form field, and you draw the markup with your own `h` builders and style it.

```ts
import { Checkbox } from "@effect/ui-kit"

// In a view:
Checkbox(h, {
  props: { checked: model.terms, name: "terms" },
  onEmit: { Toggled: ({ checked }) => Message.ToggledTerms({ checked }) },
  view: (checkbox) =>
    h.label(
      checkbox.root(h.button.class("checkbox")).children(checkbox.indicator(h.span.class("tick"))),
      "I accept the terms"
    )
})
```

A component that keeps no state, such as `Switch`, is a plain view function instead: it takes no `key`, and an `on<Event>` option in place of `onEmit`.

## Components

- [AlertDialog](src/AlertDialog.ts): a modal dialog that asks the user to answer before going on, which a press outside doesn't close.
- [Avatar](src/Avatar.ts): an image with a fallback.
- [Button](src/Button.ts): a native button that can stay focusable while disabled.
- [Checkbox](src/Checkbox.ts): a controlled checkbox with an indicator.
- [Combobox](src/Combobox.ts): an input that filters a list of options as the user types, whose open state, value and text live in your Model, with single or multiple selection, chips, an input inside the popup, grids, inline lists and inputs for a form.
- [Dialog](src/Dialog.ts): a popup in the top layer whose open state lives in your Model, as a modal, a focus trap or a non-modal panel, with `DialogTrigger` to open it from another component.
- [Drawer](src/Drawer.ts): a `Dialog` that slides in from an edge of the screen. A swipe toward that edge dismisses it once it travels far enough or is released fast enough. It has snap points, drawers nested in one another, and swipe areas that open it.
- [DrawerProvider](src/Drawer.ts): scales the page behind the drawers inside it while one is open, as a native sheet does.
- [Field](src/Field.ts): a label, a description and an error for a form control or a group of them, such as a range slider, with its validity, touched and focused state.
- [Fieldset](src/Fieldset.ts): a native fieldset named by a legend, around several fields, which disables every control and every `Field` inside it at once.
- [Form](src/Form.ts): a native form that focuses its first invalid control after a submit.
- [Input](src/Input.ts): a native text input whose value lives in your Model.
- [Menu](src/Menu.ts): a button that opens a list of actions, checkbox and radio items and submenus, whose open state lives in your Model, with typeahead, a filter input, several triggers and a viewport that resizes the popup as it moves between them.
- [Meter](src/Meter.ts): a measurement within a known range, such as disk usage, whose value lives in your Model, with a label, a value text and an indicator sized to the value.
- [NumberField](src/NumberField.ts): a controlled input for a number, formatted and parsed for a locale, with stepper buttons that repeat while held, an area to drag across, and a hidden input for a form.
- [Progress](src/Progress.ts): a progress bar whose value lives in your Model, with a label, a value text and an indicator sized to the value.
- [Select](src/Select.ts): a button that opens a list of options, whose open state and value live in your Model, with typeahead, the popup laid over the trigger with the selected option on its text, and inputs for a form.
- [Separator](src/Separator.ts): a horizontal or vertical divider between sections of content.
- [Slider](src/Slider.ts): a controlled slider with one thumb or a range, each thumb a native range input you supply.
- [Switch](src/Switch.ts): a controlled on/off setting.
- [Toast](src/Toast.ts): `ToastProvider`, a stack of notifications that components inside it post to, which close after a timeout.
- [Toggle](src/Toggle.ts): a controlled two-state button, pressed or not.
- [Tooltip](src/Tooltip.ts): a popup shown when its trigger is hovered or focused, with `TooltipProvider` to open neighbouring tooltips without the delay.

## Other modules

- [Positioning](src/Positioning.ts): places a popup of your own against an anchor, as `Tooltip` places its popup. `Positioning.place` computes a position from rectangles, and the `Positioning.TrackPosition` mount keeps a positioner next to its anchor.
- [VirtualKeyboard](src/VirtualKeyboard.ts): tells which band of the screen the software keyboard leaves visible, read from `visualViewport`, so content fixed to the bottom can sit above it. `VirtualKeyboard.step` works out the band from the viewport's sizes, without reading the DOM. `VirtualKeyboard.watch` is a Stream of the band, and the `VirtualKeyboard.TrackKeyboard` mount writes the covered height on its node as `--keyboard-inset`.
