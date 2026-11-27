---
"@effect/ui": patch
---

`Html.customElement` reads a registered tag's class from `HTMLElementTagNameMap`: `prop` takes its writable fields with their types, and `ref` and `onMount` use the element class, so `Html.customElement({ tag: "sl-qr-code" })` needs no `properties`.
