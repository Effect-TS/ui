---
"@effect/ui": minor
---

A file input now reports the files the user chose: `Html.InputPayload` has `files`, empty for other inputs. Give the input `.value("")` and the browser host empties it after each `change`, so choosing the same file again reports it again. The host never writes any other value to a file input, which a browser would refuse. `HtmlScene.change` and `HtmlPlay.change` take `files`.

Add `DomFile` to `@effect/ui/html`. `readAsText`, `readAsBytes` and `readAsDataUrl` read a `Blob` through its stream, so interrupting the Command that reads it, with `Command.interrupt`, a `"switch"` run or an unmount, stops the browser reading the file. `DomFile.pick` opens the browser's file picker without an input in the view, such as from a keyboard shortcut, and reports whether it opened and what the user chose. `BrowserHost.layer` provides the picker as `DomFile.Files`, and `TestFiles` in `@effect/ui/html/testing` fakes it.

Add `DomCommand.showPicker`, which opens the picker of an `input` or `select` the view renders. `Html.Host` has a new `showPicker` operation, so a fake `Html.Host` needs one.
