---
"@effect/ui": patch
---

Preserve inline CSS declarations written through `element.style` (such as from `onMount`) whose value or priority differs from the previous view's when `BrowserHost` updates or removes a view-rendered `style` attribute, with those declarations winning on shared properties. `Renderer.Host.setAttr` now receives an optional `previous` value from the renderer during patching and hydration.
