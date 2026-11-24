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
  "Scoped.test.ts",
  "ScopedMake.test.ts",
  "html/Scoped.test.ts",
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
  "html/LazyQuery.test.ts"
]

export const pending: {
  readonly [file: string]: { readonly [test: string]: string }
} = {
  "Noop.test.ts": {},
  "Send.test.ts": {
    "$.send to an owner > delivers several sends in the order they were issued, each logged as a Send":
      "headless components and shared state (step 8)",
    "Story and sends > fromLog reports a divergence when a send changes, from entries and from the Wire":
      "headless components and shared state (step 8)"
  },
  "DuplicatePaths.test.ts": {},
  "Keyed.test.ts": {},
  "RenderTiming.test.ts": {},
  "Runtime.test.ts": {
    "Runtime > rejects a different shared owner with the same name at mount":
      "headless components and shared state (step 8)",
    "Runtime > Commands > a ref resolves within the issuing instance after the render is committed":
      "refs and mounts (step 6)",
    "Runtime > vocabularies > controlled properties are re-applied after every patch":
      "controlled properties (full DOM host, step 6)",
    "Runtime > vocabularies > onMount runs with the element's node on hosts that run mounts":
      "refs and mounts (step 6)",
    "Runtime > vocabularies > TestHost never runs onMount":
      "refs and mounts (step 6)",
    "Runtime > vocabularies > two elements running the same mount link their own silent and failed ends":
      "refs and mounts (step 6)",
    "Runtime > vocabularies > a mount runs once, sees each new args by their Schema, and its Scope closes with the element":
      "refs and mounts (step 6)",
    "Runtime > vocabularies > a reader of a mount's args that outlives the mount ends when the element is removed":
      "refs and mounts (step 6)",
    "Runtime > vocabularies > a mount returning during scope closure logs one closed end caused by removal":
      "refs and mounts (step 6)",
    "Runtime > vocabularies > a mount's result goes through the Mount.map of the latest render":
      "refs and mounts (step 6)",
    "Runtime > vocabularies > a mount that is busy while two args arrive gets the latest one":
      "refs and mounts (step 6)",
    "Runtime > vocabularies > a mount that reads its args again starts from the latest ones":
      "refs and mounts (step 6)",
    "Runtime > vocabularies > a reader of a mount's args that starts while new ones arrive gets them once":
      "refs and mounts (step 6)",
    "Runtime > vocabularies > a render that adds, swaps or drops an element's mount starts and stops it":
      "refs and mounts (step 6)",
    "Runtime > vocabularies > a stream mount sends each value through the Mount.map of the latest render":
      "refs and mounts (step 6)",
    "Runtime > a removed element's mount that was waiting for its Layer never runs":
      "refs and mounts (step 6)",
    "Runtime > Renderer.mount whose owner a setup callback closes mounts nothing, and cleans up in order":
      "server rendering and hydration (step 7)",
    "Runtime > prerenders the tree as nodes: an instance's elements and text in a Range under its path":
      "server rendering and hydration (step 7)"
  },
  "SlotStatus.test.ts": {},
  "Slots.test.ts": {
    "slots > a DOM ref in content resolves for the parent that wrote it":
      "refs and mounts (step 6)",
    "placing a slot twice fails the receiver > once in a headless child's closure":
      "headless components and shared state (step 8)",
    "placing a slot twice fails the receiver > but not when it forwards the slot through a headless closure in a child's content":
      "headless components and shared state (step 8)"
  },
  "html/Canvas.test.ts": {
    "Canvas > paints at the pixel ratio, repaints only a changed scene, and reports pointers in scene coordinates":
      "refs and mounts (step 6)"
  },
  "html/HtmlFiles.test.ts": {
    "HtmlFiles > HtmlCommand.showPicker opens a rendered input's picker, whose files arrive in its change":
      "refs and mounts (step 6)",
    "HtmlFiles > without showPicker, HtmlCommand.showPicker falls back to click only on an enabled file input and never submits a form":
      "refs and mounts (step 6)"
  },
  "Scoped.test.ts": {
    "scoped children > a hidden tab keeps its draft and its save, gets messages, and emits through the last onEmit":
      "kept children (step 4, blocked on a seam), head (step 6)",
    "scoped children > an event on a node of a kept child reaches the child":
      "kept children (step 4, blocked on a seam)",
    "scoped lists > ends a row once its item is deleted, and keeps one the view filters out":
      "kept children (step 4, blocked on a seam)",
    "scope predicates > fails the author when it reads nothing from its argument":
      "kept children (step 4, blocked on a seam)",
    "scope predicates > fails the author when it reads only the key":
      "kept children (step 4, blocked on a seam)",
    "scope predicates > fails the author when it throws (for a child that render writes: true)":
      "kept children (step 4, blocked on a seam)",
    "scope predicates > fails the author when it throws (for a child that render writes: false)":
      "kept children (step 4, blocked on a seam)",
    "scoped lifetimes > ends kept children with their author":
      "kept children (step 4, blocked on a seam)",
    "scoped lifetimes > shows a child that failed while kept as its fallback once drawn":
      "kept children (step 4, blocked on a seam)",
    "scoped lifetimes > fails the author on a host that can't hold kept nodes":
      "kept children (step 4, blocked on a seam)",
    "scoped lifetimes > stops a kept child's mounts and starts them again once it's drawn":
      "kept children (step 4, blocked on a seam)",
    "scoped lifetimes > starts a mount under a handle the host recycled from a removed author's container":
      "kept children (step 4, blocked on a seam)",
    "saved state of scoped children > a router restore keeps the state of a kept child until it's written again":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "saved state of scoped children > the Router is asked for it once at mount and once per navigation":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "EFF-4038 probes, scoped > P1: wrapping a child in a slot component keeps it":
      "kept children (step 4, blocked on a seam)",
    "EFF-4038 probes, scoped > P2: moving a child between two elements of one view keeps it":
      "kept children (step 4, blocked on a seam)",
    "EFF-4038 probes, scoped > P8: a receiver that stops placing a slot keeps the child in it":
      "kept children (step 4, blocked on a seam)",
    "scoped children of a headless child > a headless child's closure writes them with its author's scope, and a kept one leaves collects":
      "kept children (step 4, blocked on a seam), headless components (step 8)",
    "scoped children of a headless child > headless owners in a scoped child moved up a level get an event deepest first":
      "kept children (step 4, blocked on a seam), headless components (step 8)",
    "scoped children drawn by other children > are drawn again once their own keyed Layer builds again":
      "kept children (step 4, blocked on a seam)",
    "scoped children drawn by other children > keeps a child drawn in a receiver that fails, and draws it elsewhere after":
      "kept children (step 4, blocked on a seam)",
    "scoped children drawn by other children > keeps a child its receiver stops placing as its Layer builds again":
      "kept children (step 4, blocked on a seam)",
    "scoped children drawn by other children > shows the fallback of a child that failed as it mounted wherever it's drawn, until its predicate ends it":
      "kept children (step 4, blocked on a seam)",
    "scoped children drawn by other children > keeps a child drawn in a receiver whose own scope ends":
      "kept children (step 4, blocked on a seam)",
    "scoped children drawn by other children > a child drawn in a kept receiver keeps its Model, and its mounts follow it out":
      "kept children (step 4, blocked on a seam)",
    "scoped children drawn by other children > shows the fallback of a drawn child that fails in its place":
      "kept children (step 4, blocked on a seam)",
    "scoped children that read shared state > read the owner above where they're drawn (an optional read: true)":
      "kept children (step 4, blocked on a seam), shared state (step 4, blocked on a seam)",
    "scoped children that read shared state > read the owner above where they're drawn (an optional read: false)":
      "kept children (step 4, blocked on a seam), shared state (step 4, blocked on a seam)",
    "scoped children across a router restore > keeps a draft and its subtree that were drawn when saved and are hidden when restored":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "scoped children across a router restore > keeps a kept draft that a restore didn't claim, for the next one after a reload":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "scoped children across a router restore > starts fresh a draft whose saved state a false predicate ended":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "scoped children across a router restore > starts a fresh push blank after a restore that didn't claim the draft, and Back still restores it":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "scoped children across a router restore > starts blank the subtree of a restored child that ended before drawing it":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "scoped children across a router restore > keeps the kept drafts of each root on one router":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "scoped children across a router restore > keeps a draft a Back restores when the page it leaves has one at the same path":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "scoped children across a router restore > drops a draft a Back restores once the page that stayed through it is removed":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "scoped children whose state encodes after the push that left them > start fresh after a reload, when a sibling's state was written into the entry":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "scoped children whose state encodes after the push that left them > start fresh after a reload, when edited again after a Back and left before that encodes":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "scoped children whose state encodes after the push that left them > start fresh in an entry that never drew them, after a Back from one that did":
      "kept children (step 4, blocked on a seam), router and history restore (step 5)",
    "scoped children written into closed slots > run no mounts and report nothing while the slot is closed":
      "kept children (step 4, blocked on a seam)",
    "scoped children written into closed slots > start when a slot first places them":
      "kept children (step 4, blocked on a seam)",
    "scoped children written into closed slots > keep the props and onEmit of the last render that placed them":
      "kept children (step 4, blocked on a seam)",
    "scoped children written into closed slots > a receiver that redraws an old write leaves the child where the author wrote it last":
      "kept children (step 4, blocked on a seam)",
    "scoped children written into closed slots > keeps a child whose headless writer is replaced by another that writes it":
      "kept children (step 4, blocked on a seam), headless components (step 8)",
    "scoped children written into closed slots > a receiver that redraws an old write doesn't start a child that ended while its author left it out":
      "kept children (step 4, blocked on a seam)",
    "scoped children written into closed slots > fails the author that writes two components of one name and key":
      "kept children (step 4, blocked on a seam)",
    "scoped children written into closed slots > an ordinary child and a scoped one of the same name and key, the scoped one in its own view":
      "kept children (step 4, blocked on a seam)",
    "scoped children written into closed slots > an ordinary child and a scoped one of the same name and key, the scoped one in a slot after it":
      "kept children (step 4, blocked on a seam)",
    "scoped children written into closed slots > an ordinary child and a scoped one of the same name and key, the scoped one in a slot before it":
      "kept children (step 4, blocked on a seam)",
    "scoped children written into closed slots > an ordinary child and a scoped one of the same name and key, the scoped one in the author's view beside its slot":
      "kept children (step 4, blocked on a seam)",
    "scoped children written into closed slots > a scoped child takes the path of an ordinary one of its name and key that the same render ends":
      "kept children (step 4, blocked on a seam)",
    "scoped children written into closed slots > draws a child its author returns again without writing it again":
      "kept children (step 4, blocked on a seam)",
    "scoped children written into closed slots > draws a child a failed child's fallback writes":
      "kept children (step 4, blocked on a seam)",
    "scoped children that report to shared state > move their report to the owner above where they're drawn":
      "kept children (step 4, blocked on a seam), shared state (step 4, blocked on a seam)"
  },
  "Shared.test.ts": {
    "shared state > a reader reads its owner's value, and its send reaches the owner as a logged update":
      "shared state (step 4, blocked on a seam)",
    "shared state > re-renders the readers when the owner's props change what it shares":
      "shared state (step 4, blocked on a seam)",
    "shared state > re-renders the readers only when the shared value changes":
      "shared state (step 4, blocked on a seam)",
    "shared state > fails an owner whose shares throws, with source shares":
      "shared state (step 4, blocked on a seam)",
    "optional owners, reports and onChange > an optional reader with no owner reads undefined, and its send to the owner is dropped":
      "shared state (step 4, blocked on a seam)",
    "optional owners, reports and onChange > an owner reads its readers' reports once the pass settles: a swap in one render sends nothing, an unmount does":
      "shared state (step 4, blocked on a seam)",
    "optional owners, reports and onChange > a report's id is the reader's own, in an app and in a Scene":
      "shared state (step 4, blocked on a seam)",
    "optional owners, reports and onChange > a reader's onChange gets the new value, pointing at the owner's entry that changed it":
      "shared state (step 4, blocked on a seam)",
    "optional owners, reports and onChange > a report and a shared value that answer each other fail the owner":
      "shared state (step 4, blocked on a seam)",
    "optional owners, reports and onChange > 150 changes before a render are one onChange message with the last value":
      "shared state (step 4, blocked on a seam)",
    "shared state in update > reads the owner's value as update runs, logs it, and replays it from entries and Wire frames":
      "shared state (step 4, blocked on a seam)",
    "onChange rounds and declarations > a reader that changes the owner mid-round leaves the next reader's message pointing at its value's entry":
      "shared state (step 4, blocked on a seam)",
    "a component that reads its own kind > reads the nearest instance of its own kind above it, and reports to it":
      "shared state (step 4, blocked on a seam)",
    "a component that reads its own kind > sends to the nearest instance of its own kind above it, and the outermost one's send is dropped":
      "shared state (step 4, blocked on a seam)"
  },
  "html/Scoped.test.ts": {
    "scoped children on the server > writes no nodes for a kept child, and the client takes its state once it's written":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children on the server > lists a child whose Model doesn't encode as deferred where it's drawn, and sends a kept one no state":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children on the client after hydration > keep the server's Model when the client draws them somewhere new":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children on the client after hydration > keep the server's Model when the client first hides them":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > keep the server's nodes once the receiver adopts them":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > keep what the user typed into a field its author writes again, bare, while the receiver waits":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > keep what the user typed into a field its author writes again, by a forwarded builder, while the receiver waits":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > keep what the user typed into a field its author writes again, by a headless child's view, while the receiver waits":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7), headless components (step 8)",
    "scoped children in a receiver that waits for its Layer > take the server's Model and new nodes when moved out of the receiver while it waits":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > keep the nodes they got outside the receiver when moved back in before it resumes":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > left out of the slot as the receiver resumes (none), start as the server's when written again":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > left out of the slot as the receiver resumes (ended), start as the client's when written again":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > that wait for their own Layer in the slot keep the server's Model when next placed in the aside":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > that wait for their own Layer in the slot keep the server's Model when next placed in the slot":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > keep what the user typed, when the one drawn before them leaves the slot":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > leave the one field drawn after them, which takes an edit once, when moved out of the slot":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > keep the server's nodes of a receiver they draw, when taken out of the document and drawn again while it waits":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > release a receiver that adopted them and was removed, while another still waits":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > let adoption finish when their receiver is removed as they wait for their own Layer in the slot of a scoped child there":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > keep the server's nodes under the predicate their author last wrote them with, when the receiver resumes":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > start what's below a child of theirs whose state decodes late from the server":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > start what's below a child of theirs whose state fails to decode late from the client":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > start what's below them when their own state fails to decode late from the client":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > stop decoding their state when they're no longer written as it decodes":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > leave with an author removed before it drew them, while another component waits: one made at its key starts them afresh":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > start with the props their author last wrote them with, when the receiver resumes (drawn by the server: true)":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > start with the key their author last wrote them with, when the receiver resumes (drawn by the server: true)":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > start with the order their author last wrote them with, when the receiver resumes (drawn by the server: false)":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > don't start when their author last wrote them out of a headless child's view, as the receiver resumes":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7), headless components (step 8)",
    "scoped children in a receiver that waits for its Layer > don't start when their author last wrote them out of a slot nobody places, as the receiver resumes":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > start in the order drawn, and only where placed, when the receiver resumes placing neither slot":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > start in the order drawn, and only where placed, when the receiver resumes placing a slot that holds one more":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > start in the order drawn, and only where placed, when the receiver resumes placing its slots the other way around":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > keep the server's Model when first written out of a slot the receiver resumes without":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > are built where the client last drew them, when their state decodes after the receiver resumes":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > don't start when the receiver resumes after a render that wasn't their author's and the predicate is false":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > start from what's left of their state when one made at its key replaces Author, removed as it waited for its Layer":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children in a receiver that waits for its Layer > start from what's left of their state when one made at its key replaces Outer, removed as it waited for its Layer":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "scoped children of a headless child > a kept one doesn't keep alive the closure's nodes once the headless child is removed":
      "kept children (step 4, blocked on a seam), headless components (step 8)",
    "scoped children of a headless child > a waiting receiver doesn't keep alive the writes its author replaced":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7), headless components (step 8)"
  },
  "InfiniteData.test.ts": {
    "Infinite queries > the server renders the first page, ships the page array, and drops a load more":
      "server rendering and hydration (step 7)"
  },
  "Queries.test.ts": {
    "a query without onChange > renders the loaded value, and update reads it through $.queries":
      "head (step 6)",
    "a query without onChange > hydrates the server's { model, queries } state without refetching":
      "server rendering and hydration (step 7)",
    "a query without onChange > restores the Model and result from history.state, seeding the cold cache, and refetches once":
      "head (step 6)",
    "a query without onChange > drops history.state saved as { model, loaded }, rerunning init and fetching afresh":
      "head (step 6)",
    "a query without onChange > replays from the MessageLog with Story.fromLog, update reading the logged results as $.queries":
      "head (step 6), Story (step 8)",
    "a query without onChange > replays a bounded log whose result writes were evicted":
      "head (step 6), Story (step 8)",
    "a query without onChange > replays an update that read a refetch in flight, live and through the Wire":
      "head (step 6), Story (step 8)",
    "a query without onChange > replay ends with the results a load wrote after the last message, live and through the Wire":
      "head (step 6), Story (step 8)",
    "a query without onChange > replay ends with a load that settled without any message":
      "head (step 6), Story (step 8)",
    "a query without onChange > a Mounted entry at the same path starts the results over":
      "head (step 6), Story (step 8)",
    "a query without onChange > entries of two instances at one path replay apart, and the result is the later instance's":
      "head (step 6), Story (step 8)",
    "a query without onChange > replay follows props from the parent: a new id's load, then disabling the query, live and through the Wire":
      "head (step 6), Story (step 8)",
    "a query without onChange > a divergence returns the props and results the diverging update read":
      "head (step 6), Story (step 8)"
  },
  "QueryRedacted.test.ts": {
    "omits reads with Redacted args, success or error schemas from the server cache":
      "server rendering and hydration (step 7)",
    "hydrates suspended string according to its schema":
      "server rendering and hydration (step 7)",
    "hydrates recursive tree according to its schema":
      "server rendering and hydration (step 7)",
    "hydrates suspended secret according to its schema":
      "server rendering and hydration (step 7)",
    "hydrates mutual recursion from A according to its schema":
      "server rendering and hydration (step 7)",
    "hydrates mutual recursion from B according to its schema":
      "server rendering and hydration (step 7)"
  },
  "Restore.test.ts": {
    "restore > saves what a function returns, skips false, and restores shared owners with collected reports on Back":
      "shared state (step 4, blocked on a seam)",
    "restore > restores every root on its first mount after a reload, and none on a remount":
      "kept children (step 4, blocked on a seam), shared state (step 4, blocked on a seam)",
    "restore > a scoped instance with restore: false ignores what an older entry saved of it, and restores its children":
      "kept children (step 4, blocked on a seam), shared state (step 4, blocked on a seam)",
    "restore > after a reload, a root's first mount takes its kept state and leaves another root's (Office first)":
      "kept children (step 4, blocked on a seam), shared state (step 4, blocked on a seam)",
    "restore > after a reload, a root's first mount takes its kept state and leaves another root's (App first)":
      "kept children (step 4, blocked on a seam), shared state (step 4, blocked on a seam)"
  },
  "Router.test.ts": {
    "Router > logs a navigation's update, route and outcome before the page it mounts":
      "head (step 6)",
    "Router > suppresses the matching initial route and keeps one subscription across navigation":
      "head (step 6)",
    "Router > reports an initial mismatch once, but accepts a delayed root after navigation":
      "head (step 6)",
    "Router > settles a navigation once the root has its route, not when its message is dropped":
      "head (step 6)",
    "Router > navigates by Command, back and forward, and the head follows the route":
      "head (step 6)",
    "Router > restores a page's Model on back and forward, and reruns every init Command":
      "head (step 6)",
    "Router > restores a Model written into the history entry after the Router is rebuilt, as on a reload":
      "head (step 6)",
    "Router > seeds a cold entry from a restored query field, stale, and refetches it once (success)":
      "head (step 6)",
    "Router > seeds a cold entry from a restored query field, stale, and refetches it once (failure)":
      "head (step 6)",
    "Router > drops a query result taken under a patch from the restored state":
      "head (step 6)",
    "Router > keeps the snapshot in memory and reports SnapshotWriteFailed when history.state rejects it":
      "head (step 6)",
    "Router > blocks navigation and reverts back and forward while Router.blocked runs":
      "head (step 6)",
    "Router > settles a navigation once the new page's Layer is built":
      "head (step 6)",
    "Router > canonicalises redirects and trailing slashes, and loads what the routes don't parse":
      "head (step 6)",
    "Router > settles with the head of the live tree when a title template fails its layout":
      "head (step 6)",
    "Router.prefetch > records watches only while a check after a push is outstanding":
      "differs: reads today's runtime's Instance (children, watched), which the kernel's has no equivalent of"
  },
  "html/BrowserRouter.test.ts": {
    "BrowserRouter > hydrates a server render when both sides take their props from their own Router":
      "server rendering and hydration (step 7)",
    "BrowserRouter > exempts hydrated hash roots, but checks client-only hash roots":
      "server rendering and hydration (step 7)",
    "BrowserRouter > exempts roots hydrated from a static render when only the search differs":
      "server rendering and hydration (step 7)",
    "BrowserRouter > checks hash roots that cannot adopt a server Model":
      "server rendering and hydration (step 7)",
    "BrowserRouter > navigates by link, back and forward, and the head and announcement follow":
      "head (step 6)",
    "BrowserRouter > clicking the current route notifies subscribers without scrolling, announcing or adding history":
      "head (step 6)",
    "BrowserRouter > repeating Slow after Back preserves the entry's pending scroll restoration":
      "head (step 6)",
    "BrowserRouter > a redirect reusing its route object announces only after the new visit settles":
      "head (step 6)",
    "BrowserRouter > leaves modified clicks, targets, downloads and other origins to the browser":
      "head (step 6)",
    "BrowserRouter > reports link intent after 50 ms of hover or focus, at once on touch, for the links a click follows":
      "head (step 6)",
    "BrowserRouter > follows a GET form the app has no submit handler for, and leaves a handled one alone":
      "head (step 6)",
    "BrowserRouter > restores the scroll position on back and forward between #hash entries":
      "head (step 6)",
    "BrowserRouter > goes to a link's #hash and moves focus there":
      "head (step 6)",
    "BrowserRouter > ignores links and reverts back and forward while blocked":
      "head (step 6)",
    "BrowserRouter > puts the shell's title back and removes the region when it closes":
      "head (step 6)",
    "BrowserRouter > allows one Router per document": "head (step 6)",
    "BrowserRouter > quiet navigations > a search patch announces nothing and leaves focus and scroll alone":
      "head (step 6)",
    "BrowserRouter > quiet navigations > a quiet push scrolls to the top when asked, and back restores the position, both quietly":
      "head (step 6)",
    "BrowserRouter > quiet navigations > throttles the search writes of typing to one per 200 ms, writing the latest":
      "head (step 6)",
    "BrowserRouter > quiet navigations > writes the pending search on pagehide, and stops listening when its Scope closes":
      "head (step 6)",
    "BrowserRouter > quiet navigations > writes the pending search before following an in-page #hash link":
      "head (step 6)",
    "BrowserRouter > quiet navigations > a link to its own page's search is loud":
      "head (step 6)",
    "BrowserRouter > keeps the route in the fragment with layerHash":
      "head (step 6)"
  },
  "html/HistoryRestore.test.ts": {
    "history restore of a page whose hydration hasn't settled > no snapshot holds the server's Model of the children of a excluded vault a push closed as it waited":
      "server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > no snapshot holds the server's Model of the children of a filtered vault a push closed as it waited":
      "server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > a push as a excluded slow form waits writes what its restore keeps into the entry":
      "server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > a push as a filtered slow form waits writes what its restore keeps into the entry":
      "server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > a push as a excluded scoped form waits writes what its restore keeps into the entry":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > a push as a filtered scoped form waits writes what its restore keeps into the entry":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > a push as a filtered late scoped waits writes what its restore keeps into the entry":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back runs a component with restore: false from init while another component waits":
      "server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores the server's Model of a scoped child whose state still decodes after that Back":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores a scoped child drawn by a scoped child":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores the server's Model of a slow form a push closed as it waited for its Layer":
      "server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores the server's Model of a scoped form a push closed as it waited for its Layer":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > a scoped child with restore: false the server kept undrawn starts from the server's Model when first drawn":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back runs a scoped child the server kept undrawn from init when a push closed its author as its state decoded":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > a second Back runs a scoped child the server kept undrawn from init, after a push closed its author as it waited":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores what the user typed in a form a push closed as an earlier Back's state decoded":
      "server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores all the user typed below a form a push closed after an earlier Back (open card, whose state still decoded: true)":
      "server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores all the user typed below a form a push closed after an earlier Back (open card, whose state still decoded: false)":
      "server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores all the user typed below a form a push closed after an earlier Back (late contact, whose state still decoded: true)":
      "server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores all the user typed below a form that crossed a push to another entry while its state decoded":
      "server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores all the user typed below a form that crossed a Back to another entry while its state decoded":
      "server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores none of a form its parent stopped drawing before a push after an earlier Back":
      "server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores none of a scoped child a push closed with its waiting author, when its predicate is false at that Back":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores what the user typed, over the server's Model, while another component waits":
      "server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores a Model the user set to null":
      "server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back runs a scoped child an author drew as a push closed it waiting from init, drawn again after the Back settles":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores a scoped child a push closed with its waiting author once: an author made again at its key starts it afresh":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores a scoped child of an author made before the Back settles":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores no scoped child of an author made after it settled, in a root that still hydrates":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)",
    "history restore of a page whose hydration hasn't settled > Back restores a scoped child once, in a root that still hydrates: an author made again at its key starts it afresh":
      "kept children (step 4, blocked on a seam), server rendering and hydration (step 7)"
  }
}
