---
"@effect/ui": patch
---

Add an optional `key` option to root mount and prerender APIs (`BrowserHost.mount`, `BrowserHost.mountEffect`, `Renderer.mount`, `Renderer.prerender`, and `HtmlServer.renderToHtml`) so multiple mounts of the same root component on one document get distinct paths (`/<name>[<key>]`) and element IDs. Server renders record `~key` in state for `HtmlHydrate.hydrate` to adopt automatically, and the dev build warns when two live `BrowserHost` mounts share a path in the current window's document.
