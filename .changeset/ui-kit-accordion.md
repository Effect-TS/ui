---
"@effect/ui-kit": minor
---

Add `Accordion` and `AccordionItem`, a set of panels under headings, each opened and closed by its own button. The accordion owns no open state: it reads the open items from `value` and emits `Toggled` with the value to store, one item at a time or several with `multiple`. Each item is built on `Collapsible`, so its panel publishes `--accordion-panel-height` and `--accordion-panel-width` for its transitions, and with `hiddenUntilFound` the browser's find-in-page can open it.
