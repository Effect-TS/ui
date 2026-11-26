---
"@effect/ui": patch
---

Exclude inert elements from `HtmlLocator` role queries unless `hidden: true` is passed for inspection. Simulated user actions in `HtmlPlay`, `HtmlScene` and `HtmlLocator` now reject inert targets, while raw events still reach them.
