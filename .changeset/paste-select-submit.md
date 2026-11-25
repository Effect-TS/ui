---
"@effect/ui": minor
---

Add what a field split over several inputs needs from the browser:

- A `paste` event on every element, whose payload is the pasted text: `h.input.on("paste", ({ text }) => Message.Pasted({ text }), { preventDefault: true })`.
- `HtmlCommand.select(ref, f)`, a Command that selects a field's text, and `HtmlCommand.requestSubmit(ref, f)`, which submits the form a control belongs to through its validation and its `submit` handler.
