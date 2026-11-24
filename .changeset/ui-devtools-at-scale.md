---
"@effect/ui-devtools": patch
---

The inspector keeps up with pages of thousands of components and sessions of minutes.

- The instance list shows only instances with something to report, failures and interruptions first, through a virtual list. A find field searches every instance by name or component, and "Browse all" opens the full tree with counts of what failed or is running under each branch.
- The entry header shows the instance's path. Each segment, like each list row, scopes the timeline to that instance and everything under it.
- `Inspector.Session` adds `instanceCount`, `summary`, `summaryAt`, `active`, `children` and `find`, kept up to date as entries arrive and leave.
- The seq column fits the newest seq, positions past one second read as minutes and seconds, and a row's label keeps its width ahead of the instance name.
- Every entry kind has a mark, commands have their own colour, names from app code are in mono, and values are syntax coloured. The launcher shows the Effect mark and counts failures logged since the panel was closed.
