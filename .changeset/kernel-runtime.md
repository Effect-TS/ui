---
"@effect/ui": minor
---

Replace the runtime with a new one that allocates less per component and per element. The counter example's gzip bundle goes from 93,316 to 75,146 bytes. Two changes are visible to an app:

- Hydration adopts the server's nodes one by one. When an instance's view stops matching the server's HTML partway, the nodes before the mismatch are kept and only the rest is built again. Before, the whole instance was built again.
- Commands, or query fetches, of one flush that end together lead to one render. Before, each led to a render of its own.
