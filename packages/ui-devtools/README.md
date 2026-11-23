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

It follows the latest entry until one is selected. It is mounted in an iframe with `MessageLog.noop`, so the page's styles don't reach it, a key pressed or a click in it never reaches the app's document and window listeners, and it never logs its own updates. Its theme follows `prefers-color-scheme`. It keeps the last 1,000 entries of each session, or `buffer` of them.

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

The inspector, and the overlay, read Wire frames only, so a `Schema.Redacted` value reaches them, and a copied frame, as the encoder's placeholder. A Subscription's key and deps and the message text of an error have no Schema to mark them, and are sent in clear: see `MessageLog.Wire`.

```sh
pnpm add @effect/ui-devtools @effect/ui effect
```

The package is experimental: its API may change in any release.
