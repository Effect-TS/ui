---
"@effect/ui": patch
---

`HtmlLocator` role queries name a `<button>` or `<output>` by its associated `<label>` before its content, so `<label for="theme">Theme</label><button id="theme">Dark</button>` is the button "Theme".
