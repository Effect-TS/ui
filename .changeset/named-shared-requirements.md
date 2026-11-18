---
"@effect/ui": minor
---

Reads and sends now require `Component.Shared<"OwnerName">`. Replace `Component.Shared<typeof Owner>` with `Component.Shared.Of<typeof Owner>`. Give distinct owners distinct names: the requirement is checked by name, but a reader still looks up its owner by definition at mount.
