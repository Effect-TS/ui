---
"@effect/ui-kit": minor
---

Add `Separator`, a view function for a static horizontal or vertical divider between sections of content. Call it as `Separator(h).class("rule")` or `Separator(h, { props: { orientation: "vertical" } })`. It returns a `<div>` builder and writes `role="separator"`, `aria-orientation` and `data-orientation` when the element is built, so they win over values set on `element` or chained after the call, while leaving the caller's classes, other attributes and event handlers intact.
