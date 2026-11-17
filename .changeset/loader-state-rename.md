---
"@effect/ui": patch
---

Rename the two meanings of "slot". Behaviour is unchanged.

Loader state:

- `Component.Slots` is now `Component.LoaderState`.
- `Component.PartsContext`'s `loaded` field is now `loaderState`.
- `Story.Story` and `Story.Replay` expose `loaderState` instead of `slots`.
- In the `MessageLog`, a `LoaderChanged` entry's `slot` field is now `state`, and an `Update` entry's `loaded` field is now `loaderState`, in both the live entries and the Wire.
- Page state and history state for a component with loaders is `{ model, loaderState }` instead of `{ model, loaded }`. State written by an earlier version isn't adopted, and the instance starts fresh.

Children:

- `Component.Ref.Slot` is now `Component.Ref.For`.
- Error messages say "child" instead of "slot", such as "A child takes exactly one of key and ref".
