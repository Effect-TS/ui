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
  "html/Pause.test.ts"
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
  "Slots.test.ts": {
    "placing a slot twice fails the receiver > once in a headless child's closure":
      "headless components (step 8): a slot placed in the author's view and again in a headless child's closure is checked across the author's trees, which the kernel doesn't do"
  },
  "html/Canvas.test.ts": {},
  "html/HtmlFiles.test.ts": {},
  "KeepAlive.test.ts": {
    "keep-alive children of a headless child > headless owners in a keep-alive child moved up a level get an event deepest first":
      "headless components (step 8): its headless child stamps nodes with `p.part`, and the kernel doesn't run headless parts",
    "keep-alive children written into closed slots > keeps a child whose headless writer is replaced by another that writes it":
      "headless components (step 8): its headless child stamps nodes with `p.part`, and the kernel doesn't run headless parts"
  },
  "Shared.test.ts": {
    "a component that reads its own kind > sends to the nearest instance of its own kind above it, and the outermost one's send is dropped":
      "headless parts (step 8): Menu's parts stamp its button with p.part, and the kernel doesn't apply a part's layers"
  },
  "html/KeepAlive.test.ts": {
    "keep-alive children in a receiver that waits for its Layer > don't start when their author last wrote them out of a headless child's view, as the receiver resumes":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it",
    "keep-alive children in a receiver that waits for its Layer > don't start when their author last wrote them out of a slot nobody places, as the receiver resumes":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it",
    "keep-alive children in a receiver that waits for its Layer > keep what the user typed into a field its author writes again, bare, while the receiver waits":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it",
    "keep-alive children in a receiver that waits for its Layer > keep what the user typed into a field its author writes again, by a forwarded builder, while the receiver waits":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it",
    "keep-alive children in a receiver that waits for its Layer > keep what the user typed into a field its author writes again, by a headless child's view, while the receiver waits":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it",
    "keep-alive children in a receiver that waits for its Layer > take the server's Model and new nodes when moved out of the receiver while it waits":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it",
    "keep-alive children in a receiver that waits for its Layer > that wait for their own Layer in the slot keep the server's Model when next placed in the aside":
      "hydration (step 7, unfinished): a kept child drawn in a receiver that waits for its Layer starts as hydration draws it, where it should hold the server's nodes until the receiver resumes and start as its author last wrote it",
    "keep-alive children in a receiver that waits for its Layer > keep what the user typed, when the one drawn before them leaves the slot":
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
    "Router > logs a navigation's update, route and outcome before the page it mounts":
      "differs: the kernel logs the old page's Unmounted and the new page's Mounted in the other order",
    "Router.prefetch > records watches only while a check after a push is outstanding":
      "differs: reads today's runtime's Instance (children, watched), which the kernel's has no equivalent of"
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
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported",
    "history restore of a page whose hydration hasn't settled > Back runs a keep-alive child an author drew as a push closed it waiting from init, drawn again after the Back settles":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported",
    "history restore of a page whose hydration hasn't settled > no snapshot holds the server's Model of the children of a excluded vault a push closed as it waited":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported",
    "history restore of a page whose hydration hasn't settled > no snapshot holds the server's Model of the children of a filtered vault a push closed as it waited":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported",
    "history restore of a page whose hydration hasn't settled > Back restores what the user typed in a form a push closed as an earlier Back's state decoded":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported",
    "history restore of a page whose hydration hasn't settled > Back restores all the user typed below a form a push closed after an earlier Back (open card, whose state still decoded: true)":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported",
    "history restore of a page whose hydration hasn't settled > Back restores all the user typed below a form a push closed after an earlier Back (open card, whose state still decoded: false)":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported",
    "history restore of a page whose hydration hasn't settled > Back restores all the user typed below a form a push closed after an earlier Back (late contact, whose state still decoded: true)":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported",
    "history restore of a page whose hydration hasn't settled > Back restores all the user typed below a form that crossed a push to another entry while its state decoded":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported",
    "history restore of a page whose hydration hasn't settled > Back restores all the user typed below a form that crossed a Back to another entry while its state decoded":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported",
    "history restore of a page whose hydration hasn't settled > Back restores none of a form its parent stopped drawing before a push after an earlier Back":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported",
    "history restore of a page whose hydration hasn't settled > Back restores a Model the user set to null":
      "hydration (step 7, unfinished): history snapshots and restores of instances a navigation reaches before hydration settles aren't ported"
  },
  "html/BrowserHost.test.ts": {
    "BrowserHost > inline style > a hydration style mismatch replaces the server's style text":
      "hydration (step 7, unfinished): a style mismatch keeps the server's style text, where today's replaces it (cause not investigated)"
  },
  "html/Composed.test.ts": {
    "p.child > an owned child's event goes through the declaring component's update, and replays from the log":
      "headless parts (step 8)",
    "p.child > an event the child emits from init goes to the declaring component":
      "headless parts (step 8)",
    "p.child > a failed owned child stays blank, and the declaring component hears of it without failing":
      "headless parts (step 8)",
    "p.child > a throw in p.child's parts, or a refused option, fails the declaring component with the source view":
      "headless parts (step 8)",
    "p.child on the server > the client adopts the server's render of every owned child":
      "server rendering and hydration (step 7), headless parts (step 8)"
  },
  "html/Forward.test.ts": {
    "children > a part's children come before the consumer's, in the order the parts were applied":
      "headless parts (step 8)",
    "forward > renders around the element, and what the caller chains and its children land on the element":
      "headless parts (step 8)"
  },
  "html/HtmlServer.test.ts": {
    "HtmlServer > renders a modal dialog closed, with no open attribute, and hydration shows it":
      "modal dialogs and popovers on KernelDom (blocked seam)",
    "HtmlServer > a hydrated open dialog's close belongs to that showing, not to a modal shown since":
      "modal dialogs and popovers on KernelDom (blocked seam)",
    "HtmlServer > renders a popover closed with its mode, and hydration shows it":
      "modal dialogs and popovers on KernelDom (blocked seam)",
    "HtmlServer > keeps what the user changed before adoption > reports an edit made while the instance waits for its Layer":
      "hydration (step 7, unfinished): form edits made before adoption (value, checked, radios) aren't kept or reported",
    "HtmlServer > keeps what the user changed before adoption > reports edits made before the client mounts: a checkbox and a focused field":
      "hydration (step 7, unfinished): form edits made before adoption (value, checked, radios) aren't kept or reported",
    "HtmlServer > keeps what the user changed before adoption > keeps a radio picked outside its form":
      "hydration (step 7, unfinished): form edits made before adoption (value, checked, radios) aren't kept or reported",
    "HtmlServer > places what a child builds fresh among the server's nodes":
      "hydration (step 7, unfinished): a child built fresh among the server's nodes keeps a stray server node (`[\"go\",\"tail\"]` where today's has `[\"go\"]`; cause not investigated)",
    "HtmlServer > places what the root's child builds fresh among the server's nodes":
      "hydration (step 7, unfinished): a child built fresh among the server's nodes keeps a stray server node (`[\"go\",\"tail\"]` where today's has `[\"go\"]`; cause not investigated)",
    "HtmlServer > places what a child that waited for its Layer builds fresh among the server's nodes":
      "hydration (step 7, unfinished): a child built fresh among the server's nodes keeps a stray server node (`[\"go\",\"tail\"]` where today's has `[\"go\"]`; cause not investigated)",
    "HtmlServer > compares the head a waiting child's subtree had with the props it was placed with":
      "hydration (step 7, unfinished): a child waiting for its Layer adopts with its parent's current props and slots, not those it was placed with (seen in the 'panel b' case; the other two not investigated)",
    "HtmlServer > adopts a waiting child with the slots it was placed with, and applies the new ones after":
      "hydration (step 7, unfinished): a child waiting for its Layer adopts with its parent's current props and slots, not those it was placed with (seen in the 'panel b' case; the other two not investigated)",
    "HtmlServer > drops the placement held for a waiting instance its parent removes, and never applies it":
      "hydration (step 7, unfinished): a child waiting for its Layer adopts with its parent's current props and slots, not those it was placed with (seen in the 'panel b' case; the other two not investigated)",
    "HtmlServer > recovers from mismatches on marker-free single-element children":
      "hydration (step 7, unfinished): a mismatch on a marker-free single-element child replaces a different node than today's (cause not investigated)"
  },
  "html/ViewTransition.test.ts": {
    "view transitions > a mid-flush route transition commits once across callback, freeze, and close":
      "differs: with a route transition held mid-flush the kernel queues no flush task, and a root closed while it holds commits nothing, where today's runtime commits the held update"
  },
  "html/StateCodec.test.ts": {
    "state codecs > ships a File in a Model and adopts a Model that decodes asynchronously":
      "hydration (step 7, unfinished): a root whose state decodes only asynchronously isn't held; `Options.hold` holds children, and holding the root means deferring `Kernel.mount` behind the root handle",
    "state codecs > restores a state that encodes later from memory only, and one that decodes later once decoded":
      "hydration (step 7, unfinished): history restore decodes saved state synchronously only (`routeRun.init`), so state that decodes later isn't restored"
  }
}
