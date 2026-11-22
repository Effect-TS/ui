---
"@effect/ui": minor
---

Add `DomImages.Images`, a service that loads an image off the page, so a component can wait for it in `subscriptions`. `BrowserHost.layer` provides it. By default a load never settles. A `TestHost` test provides `TestImages.layer` from `@effect/ui/html/testing` and settles loads with `TestImages.load(source)` or `TestImages.fail(source)`.
