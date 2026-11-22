---
"@effect/ui-kit": minor
---

Events that ask the consumer to change a prop are now named for the request, so they no longer read as if the change had already happened. `Opened` and `Dismissed` are `RequestedOpen` and `RequestedClose` on `Autocomplete`, `Combobox`, `Dialog`, `AlertDialog`, `Drawer`, `Menu`, `ContextMenu`, `Popover`, `PreviewCard`, `Select` and `Tooltip`. `Menu`'s `ChangedQuery` is `RequestedQuery`, and `Combobox`'s `EditedInput` is `RequestedInputValue`. The messages a component sends to `ToastProvider` are `RequestedAdd`, `RequestedUpdate` and `RequestedClose`, in place of `AddedToast`, `UpdatedToast` and `ClosedToast`. `ToastProvider`'s `Dismissed` event keeps its name, since the provider has already closed the toast when it emits it. Payloads are unchanged.
