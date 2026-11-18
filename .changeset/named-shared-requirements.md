---
"@effect/ui": minor
---

Reads and sends now require `Component.Shared<"OwnerName">`. Replace `Component.Shared<typeof Owner>` with `Component.Shared.Of<typeof Owner>`. Give distinct owners distinct names: the requirement is checked by name, but a reader still looks up its owner by definition at mount.

`Component.SharedOptional` is removed: `make` no longer subtracts optional owners by name.

If an update sends to an optional owner, omit its explicit step return type. For example, with `shared: { a: { owner: A, optional: true } }`:

```diff
// Required: the annotation could describe a send to any owner named "Provider".
- update: (_, msg, $): Component.Step<Model, Msg, never, Component.Shared<"Provider">> => $.send(A, msg)

// Optional: inference keeps A as the target.
+ update: (_, msg, $) => $.send(A, msg)
```
