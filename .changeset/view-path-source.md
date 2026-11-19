---
"@effect/ui": patch
---

A component's `view` also takes, in place of its path, an object with a `path` property, read only when `h.id` is called. The kernel runtime passes the instance, so a row's path is made only when something asks for it.
