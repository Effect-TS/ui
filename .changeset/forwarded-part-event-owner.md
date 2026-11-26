---
"@effect/ui": patch
"@effect/ui-kit": patch
---

Handlers, refs and mounts that a headless part sets in `forward` now belong to the part's component, beside the consumer's, instead of replacing them and going to the consumer.
