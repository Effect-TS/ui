---
"@effect/ui-devtools": minor
---

Add `DevTools.layer({ position })`, a read-only inspector overlay for the browser. It provides the app's `MessageLog` and mounts the overlay in a shadow root: the timeline with follow latest and filters, the instances with how their Command runs ended, the causal chain of the selected entry with links both ways, its Model with what changed, its message, Commands and raw frame, and the lifecycle of its instance's Layer builds, Subscriptions, mounts and Command runs. A run that failed its instance reads as failed.
