---
"@effect/ui": minor
"@effect/ui-opentui": minor
---

Add `root.setProps`, which gives a mounted or hydrated root new props without remounting. The root keeps its Model and nodes, and the change is logged as `PropsChanged`, as it is for a child.
