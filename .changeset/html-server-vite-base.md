---
"@effect/ui": patch
---

Support non-root Vite bases in dev SSR and prerendering: pass `import.meta.env.BASE_URL` to `HtmlServerHttp.layerHttp` and `BrowserRouter.layer` as `base`, and keep `prerender` paths app-relative. Home links preserve the base's trailing slash, and closing a router or server Layer's Scope restores the previous base.
