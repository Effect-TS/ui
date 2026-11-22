---
"@effect/ui": minor
---

`Command.make` now returns a definition object with a `make` method instead of a callable function, matching `Command.Service`. Issue commands with `RollDie.make({ sides: 6 })` and `DomCommand.Focus.make({ ref })` instead of calling the factory directly.
