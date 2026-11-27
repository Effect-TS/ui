---
"@effect/ui": patch
---

After mount or hydration, forms without a `submit` handler now submit natively instead of being cancelled, unless they use the `dialog` method. With `BrowserRouter`, a same-window GET whose URL the routes parse still navigates in the app.
