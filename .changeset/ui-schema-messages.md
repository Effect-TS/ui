---
"@effect/ui": patch
"@effect/ui-kit": patch
---

The ui-kit events (`CheckboxEvents`, `TooltipEvents`) are now `UiSchema.TaggedEnum`s, so they have case constructors such as `TooltipEvents.Opened()`. They decode and encode as before. The docs and examples define messages and events with `UiSchema.TaggedEnum` and build them with case constructors.
