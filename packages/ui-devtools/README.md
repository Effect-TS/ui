# @effect/ui-devtools

A read-only inspector for the message log of an [`@effect/ui`](../ui) app.

## The overlay

`DevTools.layer` provides the app's `MessageLog` and mounts an inspector overlay in a corner of the page, for as long as the Layer is built:

```ts
import { DevTools } from "@effect/ui-devtools"
import { BrowserHost } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { App } from "./App.ts"

const Main = BrowserHost.mount(App, {}, document.getElementById("app")!).pipe(
  Layer.provide(import.meta.env.DEV ? DevTools.layer({ position: "BottomRight" }) : Layer.empty)
)

Effect.runFork(Layer.launch(Main))
```

The overlay starts as a button. Opened, it shows:

- the timeline, newest first, filtered by kind or by instance, with a rail marking the selected entry's chain
- the instances, each with how its Command runs ended: ended, interrupted with a reason, failed, running, or unmounted
- the causal chain of the selected entry, from what sent the message to where each Command it issued stopped and what stopped it, every `#n` a link to that entry
- the entry's Model with what changed since that instance's previous entry, marked with `~`, a struck-out old value and a CHANGED badge, so it reads without colour; its message, Commands, events and raw frame
- the lifecycle of the instance: its Layer build, Subscriptions, mounts and Command runs, open or with how they ended

### Time travel

**Time travel**, at the top of a selected entry, opens the time travel slider at that entry and paints the page as it was there. The root's container is hidden and an `inert` copy is painted beside it from each instance's Model, query results and props at that point, while the live app keeps running unseen. The header reads _Paused at #n_ with a **Resume** button, and a slider moves the painted page through the timeline's rows, as filtered, that it can show. Selecting another entry while paused paints that one. When it belongs to another root, that root is paused and the first one comes back. Resume, or Follow latest, removes the copy and shows the live page again, as does unmounting the paused root.

The copy runs no Command, Subscription, query or Layer build, and takes no events. A provided Layer isn't built in the copy, so a feature slot whose service comes from one shows its fallback, and the bar lists the path of each instance that shows one. An instance with no recorded state at that entry starts from `init`, and the bar lists it too. With the panel closed, the launcher shows the Paused badge and Resume. A modal dialog or an auto popover in the copy shows as a manual popover, so the copy never blocks the panel or closes the live page's popovers, and the panel stays above it.

The overlay keeps the raw entries, alongside the Wire frames, to paint from. The entries before the oldest one it holds are folded into the state it starts from, so it can show any entry it still lists. Only roots mounted with `BrowserHost.mount` or `mountEffect` under the Layer can be shown. To combine the overlay with another log, use `MessageLog.fanout`, which keeps the roots reaching the overlay.

### Other details

It follows the latest entry until one is selected. It is mounted in an iframe with `MessageLog.noop`, so the page's styles don't reach it, a key pressed or a click in it never reaches the app's document and window listeners, and it never logs its own updates. Its theme follows `prefers-color-scheme`. It keeps the last 1,000 entries of each session.

## The core

`Inspector` is the overlay's core, with no UI. It reads the log's Wire entries and answers the questions a devtools view asks: which entry a number stands for, what an entry was caused by and what it caused, which Command run an `update` issued and how that run ended, and what an instance has going.

```ts
import { MessageLog } from "@effect/ui"
import { Inspector } from "@effect/ui-devtools"
import { Effect, Layer } from "effect"

const inspector = Inspector.make()

// Provide this to `BrowserHost.mount` to feed the inspector from a running app.
const InspectorLog = Layer.effect(
  MessageLog.MessageLog,
  MessageLog.makeEncoded((batch) => Effect.sync(() => inspector.ingest(batch)))
)

// Later: follow each Command run of the first session to where it ended.
for (const session of inspector.sessions()) {
  for (const record of session.records()) {
    if (record.kind !== "command" || record.end === undefined) continue
    console.log(record.name, record.reason, session.resolve(record.end))
  }
}
```

The inspector reads Wire frames only, and the overlay shows only what it reads, so a `Schema.Redacted` value reaches them, and a copied frame, as the encoder's placeholder. The raw entries the overlay keeps to paint the page stay in memory and are only handed to the app's own views. A Subscription's key and deps and the message text of an error have no Schema to mark them, and are sent in clear: see `MessageLog.Wire`.

```sh
pnpm add @effect/ui-devtools @effect/ui effect
```

The package is experimental: its API may change in any release.
