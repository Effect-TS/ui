---
"@effect/ui": patch
---

A focused field whose edit the browser host put back, because the Model hadn't taken it by the next frame, gets the user's selection back when the Model takes the edit later. A field the user changed before hydration no longer has its caret jump to the end when the client adopts it.
