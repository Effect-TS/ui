---
"@effect/ui": patch
---

Allow `onEmit` to accept one handler per tagged child event. Each handler receives its matching event and can return a parent message or `undefined` to ignore it.

Use a callback instead if the tags are open-ended or if any tag is an `Object.prototype` name, including `__proto__`. For example, replace `onEmit: { toString: (event) => event.text }` with `onEmit: (event) => event.text` for a child with only that tag. For multiple tags, handle the whole union in the callback. Omit `onEmit` to ignore all events.
