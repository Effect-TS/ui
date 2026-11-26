---
"@effect/ui": patch
---

A commit now starts, updates and closes mounts in its own task under `HtmlScheduler`, so a `DatePicker` closed with Escape returns focus to its trigger instead of leaving it on `<body>` and touching its `Field`.
