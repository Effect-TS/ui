---
"@effect/ui": patch
---

Leave inert elements out of `HtmlLocator` role queries unless `hidden: true` is passed: elements inside `inert`, and those outside the topmost modal dialog. User steps in `HtmlPlay`, `HtmlScene` and the DOM actions now throw on inert elements, while `fire` still delivers to them.
