---
"@effect/ui": patch
---

`HtmlServerVite` now automatically bundles installed component libraries that depend on `@effect/ui` during dev SSR and prerender, so apps no longer need to list them in `ssr.noExternal`. List a package in `ssr.external` to opt it out.
