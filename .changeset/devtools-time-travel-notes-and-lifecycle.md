---
"@effect/ui-devtools": patch
---

Time travelling to an entry before a same-cause sibling or child logged its `Mounted` or `Waiting` entry now uses that recorded mount state instead of falling back to `init`. Any remaining fallback notes in the pause bar render as compact collapsible `<details>` summaries with a scrollable path list, and the Lifecycle tab now keeps instance paths readable without overlapping adjacent columns at narrow panel widths.
