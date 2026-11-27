---
"@effect/ui": patch
---

`HtmlServerVite` now fails `vite build --watch` with an error that names the plugin and suggests `vite dev`, instead of crashing with `Cannot read properties of undefined (reading 'map')`.
