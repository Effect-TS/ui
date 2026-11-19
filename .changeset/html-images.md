---
"@effect/ui": minor
---

Add `Html.Images`, which loads an image the page doesn't show, so a component can wait for one from its `subscriptions`. `BrowserHost.layer` provides it over its document. Its default never settles. In a `TestHost` test, provide `TestImages.layer` from `@effect/ui/html/testing` and settle loads with `TestImages.load(source)` or `TestImages.fail(source)`.
