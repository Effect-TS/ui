---
"@effect/ui": minor
"@effect/ui-kit": patch
---

Document shortcuts and key sequences now skip rows while a host-managed native modal dialog, ui-kit modal layer, or `HtmlSubscription.holdModal` hold is active. Set `whileModal: true` on a row to allow it to match while a modal is open.
