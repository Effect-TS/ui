---
"@effect/ui-kit": minor
---

Add `VirtualKeyboard`, exported as a namespace, which tells which band of the screen the software keyboard leaves visible. `VirtualKeyboard.step` works out the band from the viewport's sizes without reading the DOM, `VirtualKeyboard.watch` is a Stream of the band read from `visualViewport`, and the `VirtualKeyboard.TrackKeyboard` mount writes the height the keyboard covers on its node as `--keyboard-inset`.
