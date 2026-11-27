---
"@effect/ui-native": minor
---

Add typed input props and text/input events, multiline input, uncontrolled `defaultValue`, React Native input defaults, and `Native.clear` / `Native.setSelection` helpers. Replace `InputStyle` with `TextStyle` (set `placeholderTextColor` and `selectionColor` via `.prop()`), and restore `ViewKind.defaults` when props are set to `undefined`, including through custom views' `host.set` calls.
