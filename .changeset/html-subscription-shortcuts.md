---
"@effect/ui": minor
"@effect/ui-kit": patch
---

Add `HtmlSubscription.shortcuts`, a document `keydown` Subscription from a table of `HtmlKeyboard.shortcuts` rows with `preventDefault: true` by default, and add `mod?: boolean` to `HtmlKeyboard.Shortcut` for cross-platform `Ctrl`/`Cmd` matching (either `ctrl` or `meta`, not both). `@effect/ui-kit`'s internal Escape listener now delegates to `HtmlSubscription.shortcuts`, leaving modified `Escape` (`Ctrl`/`Alt`/`Meta`) unhandled.
