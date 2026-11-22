---
"@effect/ui": minor
---

Add what a field split over several inputs needs from the browser:

- A `paste` event on every element, whose payload is the pasted text: `h.input.onPaste(({ text }) => Message.Pasted({ text }), { preventDefault: true })`.
- `DomCommand.select(ref, f)`, a Command that selects a field's text, and `DomCommand.requestSubmit(ref, f)`, which submits the form a control belongs to through its validation and its `submit` handler.
