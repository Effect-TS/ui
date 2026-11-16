---
"@effect/ui": minor
---

Messages listed in `receives` are now parent-only. Commands, views (including fragments and headless parts), subscriptions, loader callbacks and provided-layer failure handlers cannot produce them. Updates still handle the full message union, and parents still send received messages through refs.

Use a separate local message when a view or command needs the same behavior, and share its update handler with the received message. Use `Message.cases.Tag.make(...)` rather than the whole union's `make` when a narrow result is required.
