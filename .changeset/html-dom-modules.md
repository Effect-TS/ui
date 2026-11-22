---
"@effect/ui": patch
---

Move the parts of `Html` that talk to the live document into their own modules in `@effect/ui/html`. `Html` keeps the element vocabulary: the builders, event payloads, tags, `Host`, `classNames` and `ref`. Behaviour is unchanged.

- `DomSubscription`: `onDocument`, `onWindow`, `DocumentEvents`, `WindowEvents`, `GlobalPayload`, `GlobalEventOptions` and `GlobalEvents`. The `GlobalEvents` key is now `@effect/ui/html/DomSubscription/GlobalEvents`. The subscription keys `@effect/ui/html/document` and `@effect/ui/html/window` are unchanged.
- `DomCommand`: `focus`, `blur`, `scrollIntoView`, `measure`, their Commands `Focus`, `Blur`, `ScrollIntoView` and `Measure`, and `Found`. The Commands are named `DomCommand.focus` and so on in the `MessageLog`, in place of `Html.focus`.
- `DomImages`: `Images` and `ImageSource`. The `Images` key is now `@effect/ui/html/DomImages/Images`.

```ts
import { DomCommand, DomSubscription, Html } from "@effect/ui/html"

const NewTodo = Html.ref("NewTodo", "input")

DomSubscription.onDocument("keydown", onKey)
DomCommand.focus(NewTodo, () => Message.Focused())
```
