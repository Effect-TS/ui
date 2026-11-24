---
"@effect/ui-devtools": minor
---

Add Time travel to the DevTools overlay. On a selected entry, it opens the time travel slider, pauses the root and paints the page as it was at that entry in an `inert` copy, while the live app keeps running hidden. A Paused badge with Resume sits in the header, and a slider moves the painted page through the entries. Selecting another entry repaints it. The bar lists the instances that started from `init` for lack of state, and those whose feature slot shows its fallback because the copy doesn't build its Layer. The closed launcher shows the Paused badge and Resume too. `DevTools.layer` now provides `BrowserHost.Controllables` and keeps the raw entries it paints from, folded into a base state, props included, as they're evicted.
