---
"@effect/ui": patch
---

Behaviour changes in the runtime rewrite:

- A root whose view places one of its own slots now fails. A root has no parent to fill a slot. Before, the slot rendered nothing.
- When two keyed rows swap places, the list diff now moves the other node of the pair. Each row keeps its node either way, but the moved node loses what the browser drops on a move, such as an open popover.
