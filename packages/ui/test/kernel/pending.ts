/**
 * The test files the kernel project runs against the new runtime, and the tests in them that need a
 * feature a later step ports, by `describe > test` name, each with that feature. `2b:` is the rest of
 * step 2. `differs:` is a test that counts what today's runtime does where the kernel does less, to
 * settle before step 9. The list shrinks with each step and goes away once the kernel replaces the
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
  "Runtime.test.ts"
]

export const pending: {
  readonly [file: string]: { readonly [test: string]: string }
} = {
  "Noop.test.ts": {
    "Component.noop > a silent Effect Command sends nothing, and CommandEnded says so with the run's span":
      "Commands (step 3)",
    "Component.noop > CommandEnded of a run that sent a message has its span ids, the same as the Update's source":
      "Commands (step 3)",
    "Component.noop > asNoop silences a Command that has a message":
      "Commands (step 3)",
    "Component.noop > a Stream's silent elements send nothing and the Stream carries on":
      "Commands (step 3)",
    "Component.noop > a Stream whose every element is silent is silent, and an empty Stream isn't":
      "Commands (step 3)",
    "Component.noop > queue: silent and message-bearing runs of one definition keep issue order":
      "Commands (step 3)",
    "Component.noop > a Service run ends with its instance, even with its Layer provided above, and maps nothing":
      "Commands (step 3), Layers (step 4)"
  },
  "Send.test.ts": {
    "$.send to an owner > delivers several sends in the order they were issued, each logged as a Send":
      "headless components and shared state (step 8)",
    "Story and sends > fromLog reports a divergence when a send changes, from entries and from the Wire":
      "headless components and shared state (step 8)"
  },
  "DuplicatePaths.test.ts": {
    "duplicate child paths > in a child's fallback > fail the parent with source view when a fallback renders two children at one path":
      "2b: checking the child paths of fallbacks",
    "duplicate child paths > in a child's fallback > fail the parent with source view when a fallback renders a child at a sibling child's path":
      "2b: checking the child paths of fallbacks",
    "duplicate child paths > in a child's fallback > fail the parent with source view when a fallback renders a child at the path of another fallback's child":
      "2b: checking the child paths of fallbacks",
    "duplicate child paths > in a child's fallback > fail the parent when a child that fails after it rendered shows a fallback at a sibling's path":
      "2b: checking the child paths of fallbacks",
    "duplicate child paths > in a nested fallback > fail the parent when a nested fallback renders two children with one key":
      "2b: checking the child paths of fallbacks"
  },
  "Keyed.test.ts": {
    "Keyed query fields > N cold keys start N fetches in one batch, and its results are one message with N changes":
      "queries (step 5)",
    "Keyed query fields > a typed failure for one key in a batch is one entry of the one message":
      "queries (step 5)",
    "Keyed query fields > a mount over N warm keys folds one message with N changes before the first render":
      "queries (step 5)",
    "Keyed query fields > a mount over warm keys calls the view once, with the values":
      "queries (step 5)",
    "Keyed query fields > a kept child's new props over a warm key send its message before the child's one view":
      "queries (step 5)",
    "Keyed query fields > a mount over stale keys sends the stale values, then the waiting ones, in one committed frame":
      "queries (step 5)",
    "Keyed query fields > two prunes before one flush are one message":
      "queries (step 5)",
    "Keyed query fields > a prune then a patch before one flush are one message, with the patch as its change":
      "queries (step 5)",
    "Keyed query fields > patches separated by a prune before one flush are one message with both changes":
      "queries (step 5)",
    "Keyed query fields > a prune whose update prunes again is sent in a second round, before the view":
      "queries (step 5)",
    "Keyed query fields > each keyed query runs once per Model change":
      "queries (step 5)",
    "Keyed query fields > a prune: a removed key leaves the result, and onChange gets no changes":
      "queries (step 5)",
    "Keyed query fields > a prune is written once, and not again until the result holds a key the query no longer returns":
      "queries (step 5)",
    "Keyed query fields > a reorder or an added duplicate sends nothing, and the view follows the query's order":
      "queries (step 5)",
    "Keyed query fields > an added warm key is the only change, and an added cold key sends nothing until it loads":
      "queries (step 5)",
    "Keyed query fields > refetchInterval: each of N keys refetches on its own timer, and sends its own message":
      "queries (step 5)",
    "Keyed query fields > a resolver with a longer delay batches the N cold keys of one pass into one runAll and one message":
      "queries (step 5)",
    "Keyed query fields > an optimistic patch on one key reaches a second keyed field before the flush that renders the issuing update":
      "queries (step 5)",
    "Keyed query fields > two patches issued before one flush are one message per field, in that flush's frame":
      "queries (step 5)",
    "Keyed query fields > a single field over a key of the batch doesn't split the keyed field's message":
      "queries (step 5)",
    "Keyed query fields > a defect on one key fails the instance holding the field, and not one sharing its batch":
      "queries (step 5)",
    "Keyed query fields > an empty array is disabled: no fetch, no message, and an empty view":
      "queries (step 5)",
    "Keyed query fields > get finds one entry by its args": "queries (step 5)",
    "Keyed results > encode to the single form's tuples, and a duplicate args key fails to decode":
      "queries (step 5)",
    "Keyed results > fails the instance when its queryMany query's args don't return an array":
      "queries (step 5)",
    "Keyed redaction > Schema.Redacted in a keyed query's args and success: the log is redacted, the state is not":
      "queries (step 5)",
    "Keyed selection repaired by the prune handler > the runtime never renders the selection outside the collection":
      "queries (step 5)",
    "Keyed history restore > a membership change and a push in one update save the pruned collection in the entry left":
      "Commands (step 3), queries (step 5)",
    "Keyed history restore > drops each tuple taken under a patch and seeds the rest, stale":
      "Subscriptions (step 3), Commands (step 3)"
  },
  "RenderTiming.test.ts": {
    "render timing > a query's onChange reads new props before the flush":
      "queries (step 5)",
    "render timing > a query fetches the args of every Model before the flush":
      "Commands (step 3), queries (step 5)",
    "render timing > the instance a message is on its way to renders once, in the flush":
      "2b: rendering dirty ancestors before a message is delivered",
    "causedBy > the entries of the first mount name the session's start":
      "2b: the full message log (causedBy)",
    "causedBy > two messages rendered by one flush: each instance's entries name the last to change it":
      "2b: the full message log (causedBy)",
    "causedBy > a message a Command resolves with names nothing, and an interrupted run names what cut it":
      "2b: the full message log (causedBy), Commands (step 3)",
    "TestHost.formatTimeline > lists each fact with what followed from it under it, whichever flush logged it":
      "2b: the full message log (causedBy)",
    "TestHost.formatTimeline > an entry whose fact isn't among the entries is listed as one, naming it":
      "2b: the full message log (causedBy)",
    "TestHost.layer flush > first renders before the scheduler's other tasks, and last after them":
      "Commands (step 3)",
    "TestHost.layer flush > a seed gives the same order every time":
      "Commands (step 3)",
    "TestHost.layer flush > EFFECT_UI_TEST_FLUSH sets it when the option is unset":
      "Commands (step 3)"
  },
  "Runtime.test.ts": {
    "Runtime > rejects a different shared owner with the same name at mount":
      "headless components and shared state (step 8)",
    "Runtime > an event reaches a handler below thousands of elements":
      "2b: create recurses once per element, and 3000 levels overflow the stack",
    "Runtime > keyed list > adds, removes and reorders children, closing the Scopes of the removed ones":
      "Commands (step 3)",
    "Runtime > keyed list > closing the mount's Scope unmounts every instance":
      "Commands (step 3)",
    "Runtime > keyed list > a child made again at its path before the old one closes is still its parent's child":
      "Commands (step 3)",
    "Runtime > keyed list > rows added or removed at the end touch no other node":
      "differs: the kernel keeps the unkeyed row after the list, which today makes again, so one insert fewer",
    "Runtime > keyed list > a row inserted or removed in the middle leaves the rows around it alone":
      "differs: the kernel keeps the unkeyed row after the list, which today makes again, so one insert fewer",
    "Runtime > failures > a defect in a Command fails its instance":
      "Commands (step 3)",
    "Runtime > a provided Layer factory and a fallback's child > a throwing factory fails only that child":
      "Layers (step 4)",
    "Runtime > a provided Layer factory and a fallback's child > with onFailure, a throwing factory becomes a message":
      "Layers (step 4)",
    "Runtime > Commands > switch interrupts the running run, and results come back as messages":
      "Commands (step 3)",
    "Runtime > Commands > a ref resolves within the issuing instance after the render is committed":
      "Commands (step 3), refs and mounts (step 6)",
    "Runtime > run owners > a save ends with its instance: the running run is interrupted, the queued one never starts":
      "Subscriptions (step 3), Commands (step 3), Layers (step 4)",
    "Runtime > run owners > a removed branch doesn't start a queued Stream Command while a sibling's cleanup holds its close":
      "Commands (step 3), Layers (step 4)",
    "Runtime > run owners > a Command issued just before its instance is removed doesn't begin while the instance's Layer cleans up":
      "Commands (step 3), Layers (step 4)",
    "Runtime > run owners > closing the root waits for a run that was already interrupted":
      "Commands (step 3)",
    "Runtime > run owners > closing the root waits for an unmounted instance's close that is still running":
      "Commands (step 3)",
    "Runtime > run owners > closing the root waits for the run of an unmounted instance to exit":
      "Commands (step 3)",
    "Runtime > run owners > closing the root waits for a run that ends with its instance":
      "Commands (step 3)",
    "Runtime > run owners > an instance's close waits for its run before its Layer is released":
      "Layers (step 4)",
    "Runtime > run owners > an instance's close waits for its run before its Layer is released, when its parent's Layer was late":
      "Commands (step 3), Layers (step 4)",
    "Runtime > run owners > switch runs, Stream Commands and Command.make Commands end with their instance":
      "Commands (step 3), Layers (step 4)",
    "Runtime > run owners > siblings close newest first, even when an older one subscribes after it mounts":
      "Commands (step 3), Subscriptions (step 3)",
    "Runtime > run owners > h.isRunning ends when an interrupted run's fiber exits, and the instance re-renders":
      "Subscriptions (step 3), Commands (step 3), Layers (step 4)",
    "Runtime > run owners > queue: an interrupted run holds h.isRunning and its group until its cleanup finishes":
      "Commands (step 3)",
    "Runtime > run owners > switch: an interrupted run holds h.isRunning and its group until its cleanup finishes":
      "Commands (step 3)",
    "Runtime > run owners > a defect in the cleanup of a run switch cut is reported as CleanupFailed, and the next run starts":
      "Commands (step 3)",
    "Runtime > run owners > a run's Scope closes with the run's own exit, while its instance stays mounted":
      "Commands (step 3), Layers (step 4)",
    "Runtime > run owners > a write lands in its entry without a request, and changes never shows the patch":
      "Subscriptions (step 3), Layers (step 4)",
    "Runtime > run owners > the query mount option sets how long an unwatched entry stays":
      "Subscriptions (step 3), Layers (step 4)",
    "Runtime > Subscriptions > are diffed by key, closing the old key before starting the new one":
      "Subscriptions (step 3)",
    "Runtime > Subscriptions > log the name and deps their key was built from, in memory and on the Wire":
      "Subscriptions (step 3)",
    "Runtime > Subscriptions > two entries with one key fail the instance":
      "Subscriptions (step 3)",
    "Runtime > Subscriptions > a Stream's message is dropped when rendering the ancestors first removes its key":
      "Subscriptions (step 3)",
    "Runtime > provided Layers > Commands wait for a Layer that builds in the background":
      "Layers (step 4)",
    "Runtime > provided Layers > a Layer value is built once per Env and closed by its last user":
      "Layers (step 4)",
    "Runtime > provided Layers > onFailure turns a failed build into a message, and the component stays mounted":
      "Commands (step 3), Layers (step 4)",
    "Runtime > provided Layers > a memoised sub-Layer > is shared by every provide that resolves from the same Env, and closed by its last user":
      "Layers (step 4)",
    "Runtime > provided Layers > a memoised sub-Layer > is built again under an Env that provides different dependencies":
      "Commands (step 3), Layers (step 4)",
    "Runtime > provided Layers > a memoised sub-Layer > its first builder unmounting mid-build leaves every other user to mount normally":
      "Layers (step 4)",
    "Runtime > provided Layers > a memoised sub-Layer > a build whose users unmount while it waits to start again ends there, and isn't started":
      "Layers (step 4)",
    "Runtime > provided Layers > a memoised sub-Layer > a Layer that interrupts itself fails once, though another build was interrupted meanwhile":
      "Layers (step 4)",
    "Runtime > features > a feature child shows its fallback until the Layer above it is ready":
      "Layers (step 4)",
    "Runtime > features > stub records props and emits what the test sends":
      "Subscriptions (step 3)",
    "Runtime > MessageLog > a message whose update throws is on its Failed entry, and crosses the Wire":
      "2b: the full message log (Failed.update)",
    "Runtime > MessageLog > an instance logs Unmounted as it leaves the tree, and a Command's end once its fiber has exited":
      "Commands (step 3)",
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
      "Layers (step 4), refs and mounts (step 6)",
    "Runtime > Renderer.mount closes every instance before it removes the root nodes":
      "Layers (step 4)",
    "Runtime > Renderer.mount stopped at any yield point leaves nothing behind once its Scope closes":
      "queries (step 5)",
    "Runtime > Renderer.mount whose owner a setup callback closes mounts nothing, and cleans up in order":
      "Layers (step 4), queries (step 5), server rendering and hydration (step 7)",
    "Runtime > a LayerMap shares one build per key between unrelated components":
      "Commands (step 3), Layers (step 4)",
    "Runtime > a keyed provide > an update that leaves the key equal, though a new object, doesn't call layer or build anything":
      "Layers (step 4)",
    "Runtime > a keyed provide > a key change calls layer once, keeps the Model, and runs the flush's Commands against the new services":
      "Layers (step 4)",
    "Runtime > a keyed provide > a key change remounts descendants and interrupts the instance's in-flight Command":
      "Commands (step 3), Layers (step 4)",
    "Runtime > a keyed provide > the old Layer is released once the new one is built, and the current one at unmount":
      "Layers (step 4)",
    "Runtime > a keyed provide > two instances on one LayerMap key share its build, and moving one leaves the other's service alive":
      "Layers (step 4)",
    "Runtime > a keyed provide > a failed reselection goes to onFailure, isn't retried for an unchanged key, and a later key builds again":
      "Commands (step 3), Layers (step 4)",
    "Runtime > a keyed provide > after a handled failed selection, a new Command runs against the parent's services, and fails the instance if it needs a selected one":
      "Commands (step 3), Layers (step 4)",
    "Runtime > a keyed provide > after a handled failed selection, a Subscription that uses only the parent's services waits too, and starts on the next selection":
      "Subscriptions (step 3), Layers (step 4)",
    "Runtime > a keyed provide > a key change keeps the query cache: a query gets the old selection's entry unless the key is in its args":
      "Layers (step 4), queries (step 5)",
    "Runtime > a keyed provide > an old selection is released only after the cleanup of a Command the key change interrupted, at unmount too":
      "Commands (step 3), Layers (step 4)",
    "Runtime > a keyed provide > cleanup still running from an earlier flush is waited for before a key change releases the services it may use":
      "Subscriptions (step 3), Layers (step 4)",
    "Runtime > a keyed provide > an unmount waits for the cleanup of a selection still building before the parent's services are released":
      "Layers (step 4)",
    "Runtime > a keyed provide > a keyed provide removed in the flush that changes its key, while its Layer cleans up, doesn't select again":
      "Layers (step 4)",
    "Runtime > a keyed provide > a keyed provide in a removed branch selects nothing and starts no Command while a sibling's cleanup holds the close":
      "Commands (step 3), Layers (step 4)",
    "Runtime > each provided Layer build is stamped with the flush it began in":
      "Layers (step 4)",
    "Runtime > settle fails with the log's tail when work never stops":
      "Commands (step 3)",
    "Runtime > prerenders the tree as nodes: an instance's elements and text in a Range under its path":
      "server rendering and hydration (step 7)"
  },
  "SlotStatus.test.ts": {
    "slot status > a keyed slot shows fallback while rebuilding and replays an immediately ready selection after pending or failure":
      "Layers (step 4)",
    "slot status > Story.fromLog renders each slot against its provider before and after LayerReady":
      "Layers (step 4)",
    "slot status > h.isRunning counts a stopping run until its fiber exits, in the runtime and in Story.fromLog's view":
      "Commands (step 3)"
  },
  "Slots.test.ts": {
    "slots > content resolves services where the parent declared the child, not from the child's Layer":
      "Layers (step 4)",
    "slots > content passed after the child mounted belongs to the parent too":
      "Layers (step 4)",
    "slots > a DOM ref in content resolves for the parent that wrote it":
      "Commands (step 3), refs and mounts (step 6)",
    "placing a slot twice fails the receiver > once in a headless child's closure":
      "headless components and shared state (step 8)",
    "placing a slot twice fails the receiver > but not when it forwards the slot through a headless closure in a child's content":
      "headless components and shared state (step 8)",
    "a mistake in content fails the parent that wrote it > two elements with one key":
      "2b: a mistake in slot content fails the parent that wrote it",
    "a mistake in content fails the parent that wrote it > a fallback at a sibling's path":
      "2b: a mistake in slot content fails the parent that wrote it",
    "a mistake in content fails the parent that wrote it > text forwarded to a slot placed where the vocabulary allows none":
      "2b: a mistake in slot content fails the parent that wrote it"
  }
}
