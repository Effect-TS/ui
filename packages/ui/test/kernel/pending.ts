/**
 * The test files the kernel project runs against the new runtime, and the tests in them that need a
 * feature a later step ports, by `describe > test` name, each with that feature. `differs:` is a test
 * that counts what today's runtime does where the kernel does less, to settle before step 9. The list shrinks with each step and goes away once the kernel replaces the
 * runtime.
 */
export const files: ReadonlyArray<string> = [
  "Child.test.ts",
  "Feature.test.ts",
  "Send.test.ts",
  "Noop.test.ts",
  "Keyed.test.ts",
  "Slots.test.ts",
  "SlotStatus.test.ts",
  "RenderTiming.test.ts",
  "DuplicatePaths.test.ts",
  "Runtime.test.ts",
  "Command.test.ts",
  "Subscription.test.ts",
  "html/HtmlSubscription.test.ts",
  "html/HtmlKeyboard.test.ts",
  "html/Canvas.test.ts",
  "html/HtmlFiles.test.ts",
  "Shared.test.ts",
  "KeepAlive.test.ts",
  "ScopedMake.test.ts",
  "html/KeepAlive.test.ts",
  "Query.test.ts",
  "QueryRuns.test.ts",
  "QueryResults.test.ts",
  "QueryRedacted.test.ts",
  "Queries.test.ts",
  "AfterRefetch.test.ts",
  "InfiniteQuery.test.ts",
  "InfiniteData.test.ts",
  "Router.test.ts",
  "Route.test.ts",
  "Restore.test.ts",
  "html/BrowserRouter.test.ts",
  "html/HistoryRestore.test.ts",
  "html/LazyQuery.test.ts",
  "html/BrowserHost.test.ts",
  "html/Html.test.ts",
  "Head.test.ts",
  "html/HtmlHead.test.ts",
  "html/ViewTransition.test.ts",
  "html/HtmlImages.test.ts",
  "html/HeadSync.test.ts",
  "html/Head.test.ts",
  "html/Forward.test.ts",
  "html/Composed.test.ts",
  "html/register.test.ts",
  "html/HtmlLocator.test.ts",
  "html/HtmlServer.test.ts",
  "html/HtmlServerHttp.test.ts",
  "QueryHydration.test.ts",
  "html/StateCodec.test.ts",
  "html/Markdown.test.ts",
  "Paint.test.ts",
  "html/Pause.test.ts",
  "Story.test.ts",
  "Scene.test.ts",
  "Play.test.ts",
  "Headless.test.ts",
  "html/Headless.test.ts",
  "html/HeadlessStory.test.ts",
  "html/HtmlPlay.test.ts",
  "html/HtmlScene.test.ts",
  "html/SlotsStory.test.ts",
  "html/Slots.test.ts",
  "html/SlotStatus.test.ts",
  "Lazy.test.ts",
  "Redacted.test.ts",
  "WorkedExample.test.ts"
]

export const pending: {
  readonly [file: string]: { readonly [test: string]: string }
} = {
  "Noop.test.ts": {},
  "Send.test.ts": {},
  "DuplicatePaths.test.ts": {},
  "Keyed.test.ts": {},
  "RenderTiming.test.ts": {},
  "Runtime.test.ts": {},
  "SlotStatus.test.ts": {},
  "Slots.test.ts": {},
  "html/Canvas.test.ts": {},
  "html/HtmlFiles.test.ts": {},
  "KeepAlive.test.ts": {},
  "Shared.test.ts": {},
  "html/KeepAlive.test.ts": {},
  "Router.test.ts": {
    "Router.prefetch > records watches only while a check after a push is outstanding":
      "internals: walks today's runtime's Instance fields (children, watched), which no public API exposes; the kernel keeps what a prefetch check watched on routeRun's views"
  },
  "html/HistoryRestore.test.ts": {},
  "html/BrowserHost.test.ts": {},
  "html/Composed.test.ts": {},
  "html/Forward.test.ts": {},
  "html/Slots.test.ts": {},
  "html/SlotStatus.test.ts": {},
  "html/HtmlServer.test.ts": {},
  "html/ViewTransition.test.ts": {
    "view transitions > a mid-flush route transition commits once across callback, freeze, and close":
      "internals: asserts that today's runtime queues a flush task on the internal executor while a route transition holds; the kernel resumes from the transition's callback and queues none. The commits it counts match"
  },
  "html/StateCodec.test.ts": {}
}
