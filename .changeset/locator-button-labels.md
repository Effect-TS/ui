---
"@effect/ui": patch
---

`HtmlLocator` role queries now find `<button>` and `<output>` elements by their associated `<label>` text, including buttons with `role="switch"`. Associated labels take precedence over element content, but not ARIA names.
