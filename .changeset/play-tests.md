---
"@effect/ui": minor
---

Add `Play` and `HtmlPlay`, the third kind of test next to `Story` and `Scene`: a cursor over a tree mounted on `TestHost`, where children are real and Commands and Subscriptions run against the Layers the test provides. `yield* HtmlPlay.make(App, Router.props(AppRoute))`, then `yield* play.type(...)`, `yield* play.click(...)` and `yield* play.expect(locator).toHaveText(...)`, with the Scene's names. Each step settles before and after it acts, so the test needs no `TestHost.settle` between steps, and the Play settles once more when its scope closes. An interaction no handler turned into a message must be followed by `expectIgnored()`. Play test files are named `X.play.test.ts`.

`Renderer.Dispatch` now returns whether a handler produced a message, which is how a Play step knows an interaction was ignored. This breaks custom hosts and hand-written `Dispatch` stubs at the type level: return the result of the dispatch you forward to, or `false` from a stub that dispatches nothing.
