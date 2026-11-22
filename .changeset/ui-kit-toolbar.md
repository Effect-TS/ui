---
"@effect/ui-kit": minor
---

Add `Toolbar`, a row or column of controls with one stop in the Tab order. It is a headless component with `root`, `group`, `button`, `link`, `input` and `separator` parts. The arrow keys of its `orientation`, Home and End move focus between the items, wrapping with `loopFocus` and following a `DirectionProvider`, and a text input lets them go only from the edge of its text. A disabled item stays focusable with `aria-disabled` unless its entry turns `focusableWhenDisabled` off. A `Menu` or `Select` trigger and a `ToggleGroup` item stack inside a toolbar button.

A `ToggleGroup` inside a `Toolbar` leaves the tab stop and the arrow keys to the toolbar, and is disabled with it.
