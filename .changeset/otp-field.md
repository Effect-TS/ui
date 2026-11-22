---
"@effect/ui-kit": minor
---

Add `OTPField`, a one-time code field: a row of one-character inputs for a verification code. It is a headless component with `root` and `input` parts, and it emits `Updated`, `Completed` and `Rejected`. Typing moves focus to the next slot, a pasted or autofilled code fills the slots, the arrow keys, Home, End, Backspace and Delete work across slots, and a hidden input submits the code as one form value. `autoSubmit` submits the form once the code is complete.

Add `DirectionProvider`, which shares the reading direction with the components inside it. `OTPField` swaps Left and Right inside one set to `rtl`.
