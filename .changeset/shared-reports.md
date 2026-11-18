---
"@effect/ui": minor
---

Shared state gains optional owners, reports and `onChange`.

- `shares` takes `{ value, reports, onReports }`. Each reader's `shared` entry may give a `report` from its Model and props. Once a render pass has nothing left to render, the owner's `onReports` runs on every mounted reader's report and its message is dispatched, as an `Update` with source `Reported`, when it differs from the last one. The first comparison is with `onReports([])`. A server render ships the owner's last message under `~reported` in the page state, and an owner that adopts its Model on the client compares with it, so hydration doesn't send it again.
- A `shared` entry may be `{ owner, optional: true }`. With no owner above, the read is `undefined`, a send to the owner is logged as `SendDropped` with the new reason `absent`, and the component doesn't require `Component.Shared<typeof Owner>`.
- A `shared` entry's `onChange` is the reader's message when the owner's value changes. Changes are delivered in one round per owner before the next render, so a reader gets at most one message per round with the latest value. The message's log source is `Shared`, pointing at the owner's entry that changed the value. An owner may be listed under several names, but `define` throws when more than one of them has an `onChange`.
- An owner that sends more than 100 `onReports` messages or `onChange` rounds in one flush fails, with `in: "shares"`, so a report and value that answer each other can't loop forever. A reader whose `report` or `onChange` throws fails with the new `in: "shared"`.
- Stories and scenes give readers `given(model, queries, shared)` and a `shared` step that sends `onChange`, and record `reports`. A headless owner's scene has a `reported` step.
