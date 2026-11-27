---
"@effect/ui-native": minor
---

Add typed `InputProps` and typed `Native.Element.prop`, `TextEvents` (`textLayout`) and input events (`selectionChange`, `keyPress`, `contentSizeChange`, `endEditing`), uncontrolled `defaultValue`, RN input defaults (`autoCapitalize: "sentences"`, `underlineColorAndroid: 0`), and tree-shakable `Native.clear` and `Native.setSelection` helpers. Remove `InputStyle` (set `placeholderTextColor` and `selectionColor` via `.prop()`), and restore `ViewKind.defaults` when a prop is cleared to `undefined` (including custom `host.set(node, key, undefined)` calls).
