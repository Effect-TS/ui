---
"@effect/ui": patch
---

`HtmlPlay.keydown("document", key)` presses a key on the document and settles the resulting UI work without advancing `TestClock`. With `TestGlobalEvents.layer`, every root sharing it gets the key.
