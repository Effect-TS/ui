---
"@effect/ui": patch
---

Avoid a second view transition when `BrowserRouter` receives a history traversal with `hasUAVisualTransition: true`, such as a browser-animated swipe back. Later navigations can still request view transitions.
