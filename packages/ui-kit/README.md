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
- [Dialog](src/Dialog.ts): a popup in the top layer whose open state lives in your Model, as a modal, a focus trap or a non-modal panel, with `DialogTrigger` to open it from another component.
- [Drawer](src/Drawer.ts): a `Dialog` that slides in from an edge of the screen. A swipe toward that edge dismisses it once it travels far enough or is released fast enough. It has snap points, drawers nested in one another, and swipe areas that open it.
- [DrawerProvider](src/Drawer.ts): scales the page behind the drawers inside it while one is open, as a native sheet does.
- [Field](src/Field.ts): a label, a description and an error for a form control or a group of them, such as a range slider, with its validity, touched and focused state.
- [Input](src/Input.ts): a native text input whose value lives in your Model.
- [Meter](src/Meter.ts): a measurement within a known range, such as disk usage, whose value lives in your Model, with a label, a value text and an indicator sized to the value.
- [Progress](src/Progress.ts): a progress bar whose value lives in your Model, with a label, a value text and an indicator sized to the value.
- [Slider](src/Slider.ts): a controlled slider with one thumb or a range, each thumb a native range input you supply.
- [Switch](src/Switch.ts): a controlled on/off setting.
- [Toast](src/Toast.ts): `ToastProvider`, a stack of notifications that components inside it post to, which close after a timeout.
- [Toggle](src/Toggle.ts): a controlled two-state button, pressed or not.
- [Tooltip](src/Tooltip.ts): a popup shown when its trigger is hovered or focused, with `TooltipProvider` to open neighbouring tooltips without the delay.

## Other modules

- [Positioning](src/Positioning.ts): places a popup of your own against an anchor, as `Tooltip` places its popup. `Positioning.place` computes a position from rectangles, and the `Positioning.TrackPosition` mount keeps a positioner next to its anchor.
