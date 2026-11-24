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
  "html/Markdown.test.ts"
]

export const pending: {
  readonly [file: string]: { readonly [test: string]: string }
} = {
  "Noop.test.ts": {},
  "Send.test.ts": {},
  "DuplicatePaths.test.ts": {},
  "Keyed.test.ts": {},
  "RenderTiming.test.ts": {},
  "Runtime.test.ts": {
    "Runtime > Renderer.mount whose owner a setup callback closes mounts nothing, and cleans up in order":
      "differs: a malformed `~query` reaches Problems only once a query runner is loaded; this tree loads none, where today's runtime always makes the cache and reports it",
    "Runtime > Commands > switch interrupts the running run, and results come back as messages":
      "main moved: MessageLog Wire 1 (#168) logs CommandStarted and CommandInterrupted.reason",
    "Runtime > run owners > a save ends with its instance: the running run is interrupted, the queued one never starts":
      "main moved: MessageLog Wire 1 (#168) logs CommandStarted and CommandInterrupted.reason",
    "Runtime > provided Layers > Commands wait for a Layer that builds in the background":
      "main moved: MessageLog Wire 1 (#168) logs CommandStarted and CommandInterrupted.reason",
    "Runtime > MessageLog > an instance logs Unmounted as it leaves the tree, and a Command's end once its fiber has exited":
      "main moved: MessageLog Wire 1 (#168) logs CommandStarted and CommandInterrupted.reason",
    "Runtime > MessageLog > a run logs CommandStarted with its span, and its CommandInterrupted names what stopped it":
      "main moved: MessageLog Wire 1 (#168) logs CommandStarted and CommandInterrupted.reason",
    "Runtime > MessageLog > a run that interrupts itself while its instance's close is held open logs self":
      "main moved: MessageLog Wire 1 (#168) logs CommandStarted and CommandInterrupted.reason",
    "Runtime > MessageLog > a queued run's CommandStarted names the step that freed its group":
      "main moved: MessageLog Wire 1 (#168) logs CommandStarted and CommandInterrupted.reason",
    "Runtime > MessageLog > a run whose result fails its instance names itself in Failed, which is its end":
      "main moved: MessageLog Wire 1 (#168) logs CommandStarted and CommandInterrupted.reason",
    "Runtime > a keyed provide > an old selection is released only after the cleanup of a Command the key change interrupted, at unmount too":
      "main moved: MessageLog Wire 1 (#168) logs CommandStarted and CommandInterrupted.reason"
  },
  "SlotStatus.test.ts": {},
  "Slots.test.ts": {
    "placing a slot twice fails the receiver > once in a headless child's closure":
      "headless components (step 8): a slot placed in the author's view and again in a headless child's closure is checked across the author's trees, which the kernel doesn't do"
  },
  "html/Canvas.test.ts": {},
  "html/HtmlFiles.test.ts": {},
  "KeepAlive.test.ts": {
    "keep-alive children > a hidden tab keeps its draft and its save, gets messages, and emits through the last onEmit":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children > an event on a node of a kept child reaches the child":
      "kept children (step 4, blocked on a seam)",
    "keep-alive lists > ends a row once its item is deleted, and keeps one the view filters out":
      "kept children (step 4, blocked on a seam)",
    "keepAlive predicates > fails the author when it reads nothing from its argument":
      "kept children (step 4, blocked on a seam)",
    "keepAlive predicates > fails the author when it reads only the key":
      "kept children (step 4, blocked on a seam)",
    "keepAlive predicates > fails the author when it throws (for a child that render writes: true)":
      "kept children (step 4, blocked on a seam)",
    "keepAlive predicates > fails the author when it throws (for a child that render writes: false)":
      "kept children (step 4, blocked on a seam)",
    "keep-alive lifetimes > ends kept children with their author":
      "kept children (step 4, blocked on a seam)",
    "keep-alive lifetimes > shows a child that failed while kept as its fallback once drawn":
      "kept children (step 4, blocked on a seam)",
    "keep-alive lifetimes > fails the author on a host that can't hold kept nodes":
      "kept children (step 4, blocked on a seam)",
    "keep-alive lifetimes > stops a kept child's mounts and starts them again once it's drawn":
      "kept children (step 4, blocked on a seam)",
    "keep-alive lifetimes > starts a mount under a handle the host recycled from a removed author's container":
      "kept children (step 4, blocked on a seam)",
    "saved state of keep-alive children > a router restore keeps the state of a kept child until it's written again":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "saved state of keep-alive children > the Router is asked for it once at mount and once per navigation":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "EFF-4038 probes, keepAlive > P1: wrapping a child in a slot component keeps it":
      "kept children (step 4, blocked on a seam)",
    "EFF-4038 probes, keepAlive > P2: moving a child between two elements of one view keeps it":
      "kept children (step 4, blocked on a seam)",
    "EFF-4038 probes, keepAlive > P8: a receiver that stops placing a slot keeps the child in it":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children of a headless child > a headless child's closure writes them with its author's h.keepAlive, and a kept one leaves collects":
      "kept children (step 4, blocked on a seam), headless components (step 8)",
    "keep-alive children of a headless child > headless owners in a keep-alive child moved up a level get an event deepest first":
      "kept children (step 4, blocked on a seam), headless components (step 8)",
    "keep-alive children drawn by other children > are drawn again once their own keyed Layer builds again":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children drawn by other children > keeps a child drawn in a receiver that fails, and draws it elsewhere after":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children drawn by other children > keeps a child its receiver stops placing as its Layer builds again":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children drawn by other children > shows the fallback of a child that failed as it mounted wherever it's drawn, until its predicate ends it":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children drawn by other children > keeps a child drawn in a receiver whose own predicate ends it":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children drawn by other children > a child drawn in a kept receiver keeps its Model, and its mounts follow it out":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children drawn by other children > shows the fallback of a drawn child that fails in its place":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children that read shared state > read the owner above where they're drawn (an optional read: true)":
      "kept children (step 4, blocked on a seam), shared state (step 4, blocked on a seam)",
    "keep-alive children that read shared state > read the owner above where they're drawn (an optional read: false)":
      "kept children (step 4, blocked on a seam), shared state (step 4, blocked on a seam)",
    "keep-alive children across a router restore > keeps a draft and its subtree that were drawn when saved and are hidden when restored":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "keep-alive children across a router restore > keeps a kept draft that a restore didn't claim, for the next one after a reload":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "keep-alive children across a router restore > starts fresh a draft whose saved state a false predicate ended":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "keep-alive children across a router restore > starts a fresh push blank after a restore that didn't claim the draft, and Back still restores it":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "keep-alive children across a router restore > starts blank the subtree of a restored child that ended before drawing it":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "keep-alive children across a router restore > keeps the kept drafts of each root on one router":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "keep-alive children across a router restore > keeps a draft a Back restores when the page it leaves has one at the same path":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "keep-alive children across a router restore > drops a draft a Back restores once the page that stayed through it is removed":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "keep-alive children whose state encodes after the push that left them > start fresh after a reload, when a sibling's state was written into the entry":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "keep-alive children whose state encodes after the push that left them > start fresh after a reload, when edited again after a Back and left before that encodes":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "keep-alive children whose state encodes after the push that left them > start fresh in an entry that never drew them, after a Back from one that did":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "keep-alive children written into closed slots > run no mounts and report nothing while the slot is closed":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children written into closed slots > start when a slot first places them":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children written into closed slots > keep the props and onEmit of the last render that placed them":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children written into closed slots > a receiver that redraws an old write leaves the child where the author wrote it last":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children written into closed slots > keeps a child whose headless writer is replaced by another that writes it":
      "kept children (step 4, blocked on a seam), headless components (step 8)",
    "keep-alive children written into closed slots > a receiver that redraws an old write doesn't start a child that ended while its author left it out":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children written into closed slots > fails the author that writes two components of one name and key":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children written into closed slots > an ordinary child and a keep-alive one of the same name and key, the keep-alive one in its own view":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children written into closed slots > an ordinary child and a keep-alive one of the same name and key, the keep-alive one in a slot after it":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children written into closed slots > an ordinary child and a keep-alive one of the same name and key, the keep-alive one in a slot before it":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children written into closed slots > an ordinary child and a keep-alive one of the same name and key, the keep-alive one in the author's view beside its slot":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children written into closed slots > a keep-alive child takes the path of an ordinary one of its name and key that the same render ends":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children written into closed slots > draws a child its author returns again without writing it again":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children written into closed slots > draws a child a failed child's fallback writes":
      "kept children (step 4, blocked on a seam)",
    "keep-alive children that report to shared state > move their report to the owner above where they're drawn":
      "kept children (step 4, blocked on a seam), shared state (step 4, blocked on a seam)"
  },
  "Shared.test.ts": {
    "a component that reads its own kind > sends to the nearest instance of its own kind above it, and the outermost one's send is dropped":
      "headless parts (step 8): Menu's parts stamp its button with p.part, and the kernel doesn't apply a part's layers"
  },
  "html/KeepAlive.test.ts": {
    "keep-alive children on the server > writes no nodes for a kept child, and the client takes its state once it's written":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children on the server > lists a child whose Model doesn't encode as deferred where it's drawn, and sends a kept one no state":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children on the client after hydration > keep the server's Model when the client draws them somewhere new":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children on the client after hydration > keep the server's Model when the client first hides them":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > keep what the user typed into a field its author writes again, bare, while the receiver waits":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > keep what the user typed into a field its author writes again, by a forwarded builder, while the receiver waits":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > keep what the user typed into a field its author writes again, by a headless child's view, while the receiver waits":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7), headless components (step 8)",
    "keep-alive children in a receiver that waits for its Layer > take the server's Model and new nodes when moved out of the receiver while it waits":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > keep the nodes they got outside the receiver when moved back in before it resumes":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > left out of the slot as the receiver resumes (none), start as the server's when written again":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > left out of the slot as the receiver resumes (ended), start as the client's when written again":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > that wait for their own Layer in the slot keep the server's Model when next placed in the aside":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > that wait for their own Layer in the slot keep the server's Model when next placed in the slot":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > keep what the user typed, when the one drawn before them leaves the slot":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > leave the one field drawn after them, which takes an edit once, when moved out of the slot":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > release a receiver that adopted them and was removed, while another still waits":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > keep the server's nodes under the predicate their author last wrote them with, when the receiver resumes":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > start what's below a child of theirs whose state decodes late from the server":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > start what's below a child of theirs whose state fails to decode late from the client":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > start what's below them when their own state fails to decode late from the client":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > stop decoding their state when they're no longer written as it decodes":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > leave with an author removed before it drew them, while another component waits: one made at its key starts them afresh":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > start with the props their author last wrote them with, when the receiver resumes (drawn by the server: true)":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > start with the key their author last wrote them with, when the receiver resumes (drawn by the server: true)":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > start with the order their author last wrote them with, when the receiver resumes (drawn by the server: false)":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > start in the order drawn, and only where placed, when the receiver resumes placing a slot that holds one more":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > start in the order drawn, and only where placed, when the receiver resumes placing its slots the other way around":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > keep the server's Model when first written out of a slot the receiver resumes without":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > are built where the client last drew them, when their state decodes after the receiver resumes":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > start from what's left of their state when one made at its key replaces Author, removed as it waited for its Layer":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children in a receiver that waits for its Layer > start from what's left of their state when one made at its key replaces Outer, removed as it waited for its Layer":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "keep-alive children of a headless child > a kept one doesn't keep alive the closure's nodes once the headless child is removed":
      "kept children (step 4, blocked on a seam), headless components (step 8)",
    "keep-alive children of a headless child > a waiting receiver doesn't keep alive the writes its author replaced":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7), headless components (step 8)"
  },
  "Restore.test.ts": {
    "restore > restores every root on its first mount after a reload, and none on a remount":
      "kept children (step 4, blocked on a seam), shared state (step 4, blocked on a seam)",
    "restore > a keep-alive instance with restore: false ignores what an older entry saved of it, and restores its children":
      "kept children (step 4, blocked on a seam), shared state (step 4, blocked on a seam)",
    "restore > after a reload, a root's first mount takes its kept state and leaves another root's (Office first)":
      "kept children (step 4, blocked on a seam), shared state (step 4, blocked on a seam)",
    "restore > after a reload, a root's first mount takes its kept state and leaves another root's (App first)":
      "kept children (step 4, blocked on a seam), shared state (step 4, blocked on a seam)"
  },
  "Router.test.ts": {
    "Router > logs a navigation's update, route and outcome before the page it mounts":
      "differs: the kernel logs the old page's Unmounted and the new page's Mounted in the other order",
    "Router.prefetch > records watches only while a check after a push is outstanding":
      "differs: reads today's runtime's Instance (children, watched), which the kernel's has no equivalent of"
  },
  "html/HistoryRestore.test.ts": {
    "history restore of a page whose hydration hasn't settled > a push as a excluded keep-alive form waits writes what its restore keeps into the entry":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > a push as a filtered keep-alive form waits writes what its restore keeps into the entry":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > a push as a filtered late keep-alive waits writes what its restore keeps into the entry":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores the server's Model of a keep-alive child whose state still decodes after that Back":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores a keep-alive child drawn by a keep-alive child":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores the server's Model of a keep-alive form a push closed as it waited for its Layer":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > a keep-alive child with restore: false the server kept undrawn starts from the server's Model when first drawn":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back runs a keep-alive child the server kept undrawn from init when a push closed its author as its state decoded":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > a second Back runs a keep-alive child the server kept undrawn from init, after a push closed its author as it waited":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores none of a keep-alive child a push closed with its waiting author, when its predicate is false at that Back":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back runs a keep-alive child an author drew as a push closed it waiting from init, drawn again after the Back settles":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores a keep-alive child a push closed with its waiting author once: an author made again at its key starts it afresh":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores a keep-alive child of an author made before the Back settles":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores no keep-alive child of an author made after it settled, in a root that still hydrates":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores a keep-alive child once, in a root that still hydrates: an author made again at its key starts it afresh":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
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
    "BrowserHost > events > a kept keep-alive child gets the events it fires as it is drawn again":
      "kept children (step 4, blocked on a seam)",
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
