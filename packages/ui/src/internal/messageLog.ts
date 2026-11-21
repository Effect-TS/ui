/**
 * The `MessageLog` service and its no-op default, apart from `MessageLog`: a runtime reads the service
 * from here, so an app that provides no log doesn't ship that module's wire schema and encoder.
 */
import * as Context from "effect/Context"

import type * as Log from "../MessageLog.ts"

/** @internal */
export const noop: Log.MessageLog = { enabled: false, record: () => {} }

/** @internal */
export const MessageLog: Context.Reference<Log.MessageLog> = Context.Reference<Log.MessageLog>(
  "@effect/ui/MessageLog",
  { defaultValue: () => noop }
)
