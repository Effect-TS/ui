---
"@effect/ui": patch
"@effect/ui-opentui": patch
---

Keep Command requirements when calling `run` on a union of steps, such as the result of `Message.match`. Calling `children` on a union of builders now requires `unknown` instead of silently widening requirements to `any`.
