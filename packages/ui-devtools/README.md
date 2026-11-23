# @effect/ui-devtools

A read-only inspector for the message log of an [`@effect/ui`](../ui) app.

For now the package holds the inspector's core, `Inspector`, with no UI. It reads the log's Wire entries and answers the questions a devtools view asks: which entry a number stands for, what an entry was caused by and what it caused, which Command run an `update` issued and how that run ended, and what an instance has going.

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

The inspector reads Wire frames only, so a `Schema.Redacted` value reaches it as the encoder's placeholder. A Subscription's key and deps and the message text of an error have no Schema to mark them, and are sent in clear: see `MessageLog.Wire`.

```sh
pnpm add @effect/ui-devtools @effect/ui effect
```

The package is experimental: its API may change in any release.
