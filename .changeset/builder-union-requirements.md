---
"@effect/ui": patch
"@effect/ui-opentui": patch
---

Chaining on a choice of builders, such as `(cond ? h.h2 : h.h1).children(child)`, keeps the requirements of its children and mounts instead of inferring `any`. Calling the choice directly, `(cond ? h.h2 : h.h1)(child)`, is now a type error, and `View.shorthand` only takes a builder whose `children` returns that builder.
