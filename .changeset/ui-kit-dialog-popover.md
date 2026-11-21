---
"@effect/ui-kit": minor
---

`Dialog` no longer opens with `showModal()`. Every mode shows the `<dialog>` as a manual popover, so toasts stay pressable while a modal is open. `modal: true` is now `"trap-focus"` plus a full-screen layer the portal draws before the consumer's children, a scroll lock that keeps the scrollbar's space, and `aria-hidden` on the rest of the page, live regions excepted. `"trap-focus"` hides the page from screen readers too, and neither mode sets `aria-modal`. `AlertDialog` inherits all of this and no longer sets `closedby`.

Also: Escape is handled on `keydown` in every mode and ignored while an input method is composing, so a refused close keeps the dialog open however often Escape is pressed. With a backdrop, an outside press is a click that starts and ends outside. Presses on a scrollbar, with several fingers or with another mouse button don't count. The trigger and close parts set `type="button"`, the title and description label the dialog only when drawn, and only the trigger that opened the dialog reports it open. `Settled` waits for the popup's own animations, and a close before the first frame still runs the exit.

Known costs:

- The browser no longer enforces the modal. Find-in-page and a script's `focus()` reach the page behind it.
- Close requests other than Escape, such as Android's back gesture, no longer reach the dialog.
- With `modal: true`, a press outside closes on `click`, not `pointerdown`. A press on another of the dialog's triggers while it is open switches to that trigger.
- The page takes presses, scrolls and is read by screen readers as soon as a close starts, during the exit transition. Focus still goes back once the exit ends.
