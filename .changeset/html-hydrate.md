---
"@effect/ui": minor
---

Hydration has its own entry point. `HtmlHydrate.hydrate` and `HtmlHydrate.hydrateEffect` take the server's state as an argument: `(component, props, container, state, options?)`. `BrowserHost.mount`, `BrowserHost.mountEffect` and `Renderer.mount` no longer take a `state` option, and always build a fresh tree. `HtmlHydrate` is exported from `@effect/ui/html`.

```ts
// before
BrowserHost.mount(App, props, container, { state: rendered.state })
// after
HtmlHydrate.hydrate(App, props, container, rendered.state)
```

The other mount options (`fallback`, `query`, `head`) are the same on both. An app that never hydrates no longer bundles the hydration code.
