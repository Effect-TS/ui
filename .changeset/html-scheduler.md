---
"@effect/ui": minor
---

Add `HtmlScheduler`, a Scheduler for the browser. It runs fiber work in time slices of 5 milliseconds by default, posted with `scheduler.postTask` or, where the browser lacks it, a `MessageChannel`, so long-running Commands and many fibers waking together no longer hold up rendering and input. A fiber yields once its work passes the budget, not only after a count of operations, and yielding no longer waits on `setTimeout`'s 4ms clamp.

A priority below 0 runs before other fiber work and one above 0 only when nothing else is queued, so `yield* Effect.yieldNowWith(1)` moves CPU-bound work to the background. A fiber that spends its budget resumes at the priority it was running at.

`BrowserHost.mount` and `BrowserHost.mountEffect` use it when the caller hasn't provided a `Scheduler`. Use `HtmlScheduler.layer` for other Effects that run in the page.
