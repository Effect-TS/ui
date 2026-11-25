---
"@effect/ui-kit": patch
---

`Collapsible` and `Accordion` panels are now `inert` during exit transitions so keyboard focus skips closing content, and `Collapsible` keeps `aria-controls` linked to custom panel IDs even without `root`. `AccordionItem` panels also merge their trigger ID into any consumer-supplied `aria-labelledby` instead of overwriting it.
