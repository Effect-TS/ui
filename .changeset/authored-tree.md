---
"@effect/ui": minor
---

A child's identity follows the component that wrote it, not where it's placed. Its path is its author's path and its own segment, so a child moved to another element, wrapped in a slotted component or placed through a slot keeps its instance, Model and mounts. Slot content reads the owners its author wrote around it. A slot its receiver stops placing is kept out of the document, as an unplaced `"model"` child is, and comes back as it was. A page restored on back or forward gets back its content wherever the view now places it, but not content left in a closed slot: that starts fresh when the slot opens. A feature keeps its instance through a move when it resolves against the same Env. Two children at one path across one author's view, closures and slot content now fail that author, as two refs with one key already did.
