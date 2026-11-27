---
"@effect/ui": patch
"@effect/ui-kit": patch
---

Add `Component.sharedKey` so readers can read shared state and send messages without importing the owner component. Use shared keys in `Menu`, `Select`, `ToggleGroup` and `Checkbox` to avoid bundling unused `Menubar`, `Toolbar` and `CheckboxGroup` implementations.
