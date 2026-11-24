---
"@effect/ui": minor
---

`HtmlScene.click` and `HtmlPlay.click` now send `pointerdown`, `mousedown`, `mouseup`, and `click` before the click defaults, matching what a browser sends for a mouse click. Cancelling `pointerdown` skips `mousedown` and `mouseup` (not `click`), cancelling `mousedown` or `mouseup` skips nothing, and only a cancelled `click` skips the defaults (and sets `Scene.defaultPrevented`). `HtmlPlay.click` settles between the press (`pointerdown`, `mousedown`) and release (`mouseup`, `click`, defaults), and both drop the rest of the click if the press removes or disables the element.
