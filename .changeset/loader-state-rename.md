---
"@effect/ui": patch
---

Rename the two meanings of "slot". Behaviour is unchanged.

Query results:

- `Component.Slots` is now `Component.Results`.
- `Component.PartsContext`'s `loaded` field is now `queries`.
- `Story.Story` and `Story.Replay` expose `results` instead of `slots`.
- In the `MessageLog`, a `QueryChanged` entry's `slot` field is now `result`, and an `Update` entry's `loaded` field is now `queries`, in both the live entries and the Wire.
- Page state and history state for a component with queries is `{ model, queries }` instead of `{ model, loaded }`. State written by an earlier version isn't adopted, and the instance starts fresh.

Children:

- Error messages say "child" instead of "slot", such as "the child has no fallback to show while it's pending".
