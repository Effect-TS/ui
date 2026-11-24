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
  "html/KeepAlive.test.ts": {
    "keep-alive children in a receiver that waits for its Layer > don't start when their author last wrote them out of a headless child's view, as the receiver resumes":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it",
    "keep-alive children in a receiver that waits for its Layer > don't start when their author last wrote them out of a slot nobody places, as the receiver resumes":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it",
    "keep-alive children in a receiver that waits for its Layer > take the server's Model and new nodes when moved out of the receiver while it waits":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it",
    "keep-alive children in a receiver that waits for its Layer > that wait for their own Layer in the slot keep the server's Model when next placed in the aside":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it",
    "keep-alive children in a receiver that waits for its Layer > leave the one field drawn after them, which takes an edit once, when moved out of the slot":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it",
    "keep-alive children in a receiver that waits for its Layer > stop decoding their state when they're no longer written as it decodes":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it",
    "keep-alive children in a receiver that waits for its Layer > start with the props their author last wrote them with, when the receiver resumes (drawn by the server: true)":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it",
    "keep-alive children in a receiver that waits for its Layer > start with the key their author last wrote them with, when the receiver resumes (drawn by the server: true)":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it",
    "keep-alive children in a receiver that waits for its Layer > are built where the client last drew them, when their state decodes after the receiver resumes":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it"
  },
  "Router.test.ts": {
    "Router.prefetch > records watches only while a check after a push is outstanding":
      "internals: walks today's runtime's Instance fields (children, watched), which no public API exposes; the kernel keeps what a prefetch check watched on routeRun's views"
  },
  "html/HistoryRestore.test.ts": {
    "history restore of a page whose hydration hasn't settled > a push as a filtered late keep-alive waits writes what its restore keeps into the entry":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported",
    "history restore of a page whose hydration hasn't settled > Back restores the server's Model of a keep-alive child whose state still decodes after that Back":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported",
    "history restore of a page whose hydration hasn't settled > a keep-alive child with restore: false the server kept undrawn starts from the server's Model when first drawn":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported",
    "history restore of a page whose hydration hasn't settled > Back runs a keep-alive child the server kept undrawn from init when a push closed its author as its state decoded":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported",
    "history restore of a page whose hydration hasn't settled > a second Back runs a keep-alive child the server kept undrawn from init, after a push closed its author as it waited":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported"
  },
  "html/BrowserHost.test.ts": {
    "BrowserHost > inline style > a hydration style mismatch replaces the server's style text":
      "hydration (step 7, unfinished): a style mismatch keeps the server's style text, where today's replaces it (cause not investigated)"
  },
  "html/Composed.test.ts": {},
  "html/Forward.test.ts": {},
  "html/Slots.test.ts": {
    "slots on the server > writes a marker pair per outlet, and the client adopts the content":
      "hydration (step 7, unfinished): the client doesn't adopt an outlet's marker pair, so its markers stay in the document",
    "slots on the server > builds content fresh when it doesn't match the server's, and adopts the rest":
      "hydration (step 7, unfinished): the client doesn't adopt an outlet's marker pair, so its markers stay in the document",
    "slots on the server > ssr() names the slot whose content the client rebuilt":
      "hydration (step 7, unfinished): the client doesn't adopt an outlet's marker pair, so ssr() reports the markers, not the rebuilt slot"
  },
  "html/SlotStatus.test.ts": {
    "slot status after SSR > a slot whose Layer failed on the server ships Failed, and the client adopts its failure branch, cause included":
      "hydration (step 7, unfinished): a receiver whose Layer failed on the server isn't adopted in its failure branch; the client rebuilds the slot",
    "slot status after SSR > a slot the server rendered whose client Layer isn't ready reports that it awaits the client's Layer":
      "hydration (step 7, unfinished): a server-rendered receiver waiting for its client Layer reports Pending, where today's reports Awaiting"
  },
  "html/HtmlServer.test.ts": {
    "HtmlServer > a hydrated open dialog's close belongs to that showing, not to a modal shown since":
      "modal dialogs and popovers on KernelDom (blocked seam)"
  },
  "html/ViewTransition.test.ts": {
    "view transitions > a mid-flush route transition commits once across callback, freeze, and close":
      "internals: asserts that today's runtime queues a flush task on the internal executor while a route transition holds; the kernel resumes from the transition's callback and queues none. The commits it counts match"
  },
  "html/StateCodec.test.ts": {
    "state codecs > ships a File in a Model and adopts a Model that decodes asynchronously":
      "hydration (step 7, unfinished): a root whose state decodes only asynchronously isn't held; `Options.hold` holds children, and holding the root means deferring `Kernel.mount` behind the root handle",
    "state codecs > restores a state that encodes later from memory only, and one that decodes later once decoded":
      "hydration (step 7, unfinished): history restore decodes saved state synchronously only (`routeRun.init`), so state that decodes later isn't restored"
  }
}
