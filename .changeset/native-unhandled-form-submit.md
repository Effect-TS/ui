---
"@effect/ui": patch
---

After mount or hydration, the host now leaves unhandled GET submissions to the browser instead of cancelling them; handled and `dialog` submissions remain cancelled. `BrowserRouter` still intercepts unhandled same-window GET submissions whose URLs the routes parse.
