---
"@effect/ui": minor
---

A child's identity follows the component that wrote it, not where it's placed. Its path is its author's path and its own segment, so a child moved to another element, wrapped in a slotted component or placed through a slot keeps its instance, Model and mounts. Slot content reads the owners its author wrote around it. A slot its receiver stops placing is kept out of the document, as a detached child is, and comes back as it was. Two children at one path across one author's view, closures and slot content now fail that author, as two refs with one key already did.
