---
"@effect/ui-kit": minor
---

Add `Separator`, a view function ported from Base UI, for a horizontal or vertical divider between sections of content. Call it as `Separator(h).class("rule")`, or pass `props: { orientation: "vertical" }`. It returns a `<div>` builder with `role="separator"`, `aria-orientation` and `data-orientation`, written when the element is built so they win over what you chain. Pass `element` to stack a part on the same div.
