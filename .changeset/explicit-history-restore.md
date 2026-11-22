---
"@effect/ui": minor
"@effect/ui-kit": minor
---

Add a `restore` option to `Component.define`, which decides what history restore saves of a component. `restore: false` saves nothing, so after Back, forward or a reload the instance starts from `init`. A function returns the Model to save, so a field it clears, such as a password, is never written to `history.state`: `restore: (model) => ({ ...model, password: "" })`. It runs when the Router saves. Hydration doesn't read it.

A reload now restores the saved state of the current history entry on the first render. Before, it was only read on Back or forward to that entry. An instance that hydrates server-rendered HTML still starts from the server's state.

An owner of shared state now restores from history like any other component. It was always left out before. Set `restore: false` on an owner that should start from `init`. A restored owner whose `shares` has `collects` also gets back the message its readers' reports last sent, so it compares their reports with that and no longer keeps a stale value or gets the same message twice.

In `@effect/ui-kit`, `Tooltip`, `TooltipProvider`, `ToastProvider`, `Dialog`, `Drawer` and `DrawerProvider` set `restore: false`, so the kit's owners behave as before and a tooltip no longer comes back hovered. `Field` saves `touched` and not `focused`.
