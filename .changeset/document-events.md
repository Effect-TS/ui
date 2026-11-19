---
"@effect/ui": minor
---

Listen for document and window events from `subscriptions`, with `Html.onDocument` and `Html.onWindow`.

```ts
subscriptions: ;
;((model) => [
  model.running && Html.onDocument(
    "keydown",
    ({ key }) => isArrow(key) ? Message.PressedArrow({ key }) : undefined,
    { preventDefault: true }
  )
])
```

- `onDocument` takes `keydown` and `keyup` with the element handlers' key payload, and `mousedown`, `mouseup` and `click` with their pointer payload. `onWindow` takes `focus` and `blur`. The handler and `preventDefault` work as they do on an element. The payload also has `defaultPrevented`, so a listener can skip an event an element's handler already cancelled. `capture: true` listens in the capture phase.
- Each is a Subscription keyed by target, event and phase, such as `@effect/ui/html/document:"keydown"` or `@effect/ui/html/document:"mousedown","capture"`. Gate an entry on the Model to listen only while it's needed.
- The listener always calls the handler from the latest `subscriptions` result, so a handler may read the Model. It dispatches inside the DOM listener, as an element handler does.
- The events come from `Html.GlobalEvents`, a `Context.Reference` that `BrowserHost.layer` provides over its document and window. Its default never fires, so a `TestHost` test or a server render runs without a document and nothing fails.
- In tests, a `Story` delivers one with `s.subscription(key, message)`. An `HtmlScene` fires one with `s.fireDocument(event, payload)` and `s.fireWindow(event, payload)`, and a `TestHost` test provides `TestGlobalEvents.layer` from `@effect/ui/html/testing` and calls `TestGlobalEvents.fire(target, event, payload)`.
