---
"@effect/ui": minor
---

Add `$.evolve` to steps and a `UiStruct` module with `evolve` (and remove `$.modify` in favor of `$.evolve` and `$.set`), which change some fields of a struct and keep the rest, so `update` doesn't spread `...model`. Each field takes its new value, or a function from its old value to the new one: `$.evolve({ submitting: true, attempts: (n) => n + 1 })`. `$.evolve` returns a step, so `.run`, `.emit` and another `.evolve` chain after it.

`UiStruct.evolve` takes the same fields for a struct inside the Model, data-first or data-last: `UiStruct.evolve(line, { quantity: (n) => n + 1 })` and `coupon: UiStruct.evolve({ status: "Idle" })`. A field can't change type, and an unknown key in the fields literal, a wrong value and a wrong return type are errors on that field. Check fields declared elsewhere with `satisfies UiStruct.EvolveFields<Model>`. A partial struct isn't merged. A function is always the updater, so a field whose type is a function can't be set through `evolve`. A union, nullable structs included, is a compile error: match it first, then evolve the member.
