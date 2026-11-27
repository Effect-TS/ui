---
"@effect/ui-native": minor
---

Add the opt-in `@effect/ui-native/networking` side-effect entry point to initialize React Native's networking globals (`fetch`, `XMLHttpRequest`, `WebSocket`, `URL`, `AbortController`) without bundling the XHR stack into apps that don't make network requests.
