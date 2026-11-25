---
"@effect/ui": patch
---

`BrowserRouter` now follows links and GET forms, and reports link intent, in a root mounted inside a shadow root, open or closed. It used to listen on `document` only, so a form in a shadow root did nothing, and in a closed root a link click loaded the page and hover, focus and touch reported no intent.
