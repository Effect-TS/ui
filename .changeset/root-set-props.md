---
"@effect/ui": minor
"@effect/ui-opentui": minor
---

Add `setProps` to mounted root handles (`Renderer.Root` and `TestHost.Root`), carrying the root component's `Props` type (defaulting to `never`) across `Renderer.mount`, `BrowserHost.mountEffect`, `HtmlHydrate.hydrateEffect`, `OpenTuiHost.mountEffect`, `TestHost.mount`, `Play.make`, `HtmlPlay.make`, `Ssr.ssr`, and `OpenTuiTest.mount`. Calling `root.setProps(props)` updates a mounted or hydrated root in place without remounting, reconciling subscriptions, queries, shared state, and child props while recording `PropsChanged`.
