---
"@effect/ui-kit": patch
---

Fix popup dismissal, keep modal state to its own document, and check locks when an action happens rather than when it was asked for.

- `Menu` and `ContextMenu`: a Tab whose close the consumer refuses leaves the popup usable instead of inert, and asks to close once rather than twice. Escape on the page closes a menu that hovering opened, unless something already handled the key. A disabled menu ignores its filter input and clear button, and a disabled link item doesn't navigate.
- `Combobox` and `Autocomplete`: Escape closes a popup that a touch opened with focus on the popup. A disabled or read-only control no longer clears on Escape keyup, and a read-only one no longer picks by typeahead.
- `Select`, `Combobox` and `Autocomplete`: browser autofill no longer picks a disabled item.
- `Dialog`, `AlertDialog` and `Drawer` no longer add a document listener when the module loads. The topmost dialog, the page hidden from assistive technology and the scroll lock are tracked per document, so a dialog in an iframe or another window leaves the others alone. A dialog that isn't mounted shows once its own tracking starts, one render after `open` turns true, so it returns focus to what had it before.
- `Popover` and `PreviewCard` triggers outside the popover reach only a popup with that id in their own document.
- `Popover`: a disabled trigger asks for nothing, including a click on an element inside it, and a trigger disabled or removed during the hover delay opens nothing.
- `CheckboxGroup` ignores toggles that reach it while it is disabled.
- `RadioGroup`: arrow keys from a read-only radio move focus without picking, and an arrow from a disabled radio does nothing.
- `OTPField`: `autoSubmit` doesn't submit when the consumer disables the field as it stores the last character. `Completed` is still emitted.
