---
"@effect/ui": patch
---

Keep Command requirements when calling `run` on a union of steps, such as the result of `Message.match`, instead of widening them to `any`.
