---
"@effect/ui": minor
"@effect/ui-kit": minor
---

Remove sends from a parent to a child. Data goes down through props and up through events. `$.send(Owner, message)` to a shared-state owner above the sender is unchanged.

- `$.send(ref, message)` no longer compiles. `Component.Ref`, `Component.ref`, the `ref` method of components, headless components and features, the `ref` option of a child, `View.Child.ref`, `Component.Receives` and `Component.Send.ToChild` and `ToOwner` are gone. `Component.Send` is `{ owner, message }`. Name children with `key`.
- `receives` moves into the object form of `shares`, so only an owner can list it: `shares: { value, receives: ["Tag"] }`. `Feature` has no `receives`, and `Feature.Service` loses its `Receives` parameter.
- Components lose their `Rcv` type parameter: `Component.Component`, `ScopedComponent`, `Members`, `Mountable` and `Scoped`. `Component.Headless` keeps it for owners.
- To restart a child, stop rendering it or change its key. A parent can't ask a child to act on state only the child holds, such as scrolling to a row or saving its draft.
- Tests: the `receive` step is gone, `sent` takes only an owner, Scene's child steps take only a string key, and `TestHost.stub` has no `received`.
- `MessageLog.SendDropped` has `owner` in place of `ref` and no `reason`. The Wire's `sends` carry only `owner`, and `MessageLog.wireVersion` is now `7`.
- ui-kit's `Form` no longer receives `RejectedSubmit`, and `Form.ref` is gone. Errors that arrive after the render that follows a submit, such as a server's, aren't focused. To focus one, give the field or an error summary an `Html.ref` and run `Html.focus` from the `update` that records the rejection.
