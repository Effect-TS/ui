---
"@effect/ui": minor
"@effect/ui-kit": minor
---

Add `CheckboxGroup` to ui-kit: the checkboxes inside it share one list of ticked values, which the consumer stores from `Updated`. A `Checkbox` with a `value` is a member, and one with `parent: true` ticks or unticks every member, brings back the last mix, leaves disabled members as they are, and points at the members with `aria-controls`. Members without a `name` submit under the group's.

`Checkbox`'s `checked` prop is now optional and defaults to unticked. `Checkbox` also takes `parent` and `id`.

A reader's `report` in `shared` gets the reader's `id` as a third argument, the same as `p.id` and `h.id`, so a report can name one of the reader's elements.
