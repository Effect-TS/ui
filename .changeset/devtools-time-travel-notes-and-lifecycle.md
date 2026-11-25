---
"@effect/ui-devtools": patch
---

Time travelling to an entry before a same-cause sibling or child logged its `Mounted` or `Waiting` entry now uses that recorded mount state instead of falling back to `init`, without looking past a superseding state change to an ancestor. Remaining fallback notes in the pause bar render as compact collapsible `<details>` summaries with a scrollable path list, the time-travel slider is labeled **Time travel**, the timeline marker gutter sits beside the scrollbar rather than over it, and the Lifecycle tab keeps instance paths readable without overlapping adjacent columns at narrow panel widths.
