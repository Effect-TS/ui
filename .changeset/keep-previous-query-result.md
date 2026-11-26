---
"@effect/ui": minor
---

A `query` entry whose args change now keeps its last Success, with `waiting` set, until the new args have a result, instead of opening as `Initial`. Set `dropPrevious: true` on the entry to opt out. `h.previous` and `p.previous` are removed.
