---
"@effect/ui-kit": minor
---

Add `NumberField`, a headless number input ported from Base UI. Call it as `NumberField(h, { props: { value }, onEmit, view })` and apply `numberField.root`, `numberField.group`, `numberField.input`, `numberField.decrement`, `numberField.increment`, `numberField.scrubArea` and `numberField.scrubAreaCursor` to your own builders. `value` is controlled, a number or `null` for an empty field: the field emits `Updated` for each value the user asks for and `Committed` once they are done, each with a reason.

The input shows the value formatted with `Intl.NumberFormat` for `locale` and `format`, such as a currency, a percentage or a unit, and reads what is typed in that locale, including its separators and Arabic-Indic, Persian, fullwidth and Han digits. Only characters that can be part of the number may be typed or pasted. ArrowUp and ArrowDown step by `step`, with Shift for `largeStep` and Alt for `smallStep`, and Home and End go to `min` and `max`. A stepper button steps on the press and repeats while held. A drag across the scrub area changes the value with the pointer locked, and `scrubAreaCursor` draws the cursor that stands in for the pointer. `allowWheelScrub` steps the focused input with the wheel. `snapOnStep` and `allowOutOfRange` change how a value is rounded to the step and kept in range.

`name` and `form` submit the plain number through a hidden `<input type="number">`, which also carries `min`, `max`, `step` and `required` for the browser's own validation. In a `Field`, draw the input with `numberField.input(field.control(h.input))` and pass `disabled: field.disabled`.
