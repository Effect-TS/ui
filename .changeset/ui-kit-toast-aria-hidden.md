---
"@effect/ui-kit": patch
---

`ToastProvider` no longer sets `aria-hidden` on focusable toasts or their `close` button, so screen readers can reach them while the stack is collapsed. Focus that lands on a closing toast moves to the next one, Escape on the viewport returns focus to the page, and F6 works when the provider is inside a shadow root.
