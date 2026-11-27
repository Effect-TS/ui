---
"@effect/ui": minor
"@effect/ui-kit": patch
---

Document shortcuts no longer fire behind an open modal: `HtmlKeyboard.shortcuts` and `HtmlSubscription.keySequences` skip rows on document listeners while `GlobalPayload.modal` is true, unless a row sets `whileModal: true`. Native modal dialogs and ui-kit modal layers set it, and `HtmlSubscription.holdModal` marks any other element as a modal.
