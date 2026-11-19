---
"@effect/ui-kit": minor
---

Add `Dialog`, a headless dialog shown in the top layer with a native `<dialog>`. The consumer owns whether it is open, and the dialog asks to open or close with `Opened` and `Dismissed`, which carries the reason. It opens as a modal, with `modal: "trap-focus"` to keep focus inside without making the page inert, or with `modal: false`. It handles focus on open and close, Escape and presses outside the popup, enter and exit transitions, and dialogs nested in one another. `DialogTrigger` draws a trigger for a dialog drawn somewhere else.
