---
"@effect/ui": minor
---

A `query` entry now keeps its last Success with `waiting: true` while changed args debounce or fetch, replacing `h.previous` and `p.previous`. Set `dropPrevious: true` on the entry to show `Initial` instead.
