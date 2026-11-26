---
"@effect/ui": patch
---

Fix mount scheduling under `HtmlScheduler` so closing a `DatePicker` with Escape returns focus to its trigger without marking its `Field` touched.
