---
"@effect/ui": patch
---

Bundle installed packages that depend on `@effect/ui` in `HtmlServerVite` via `ssr.noExternal` so third-party component libraries share the app's `@effect/ui` instance during dev SSR and prerender.
