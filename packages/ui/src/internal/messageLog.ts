/**
 * The `MessageLog` service and its no-op default, apart from `MessageLog`: a runtime reads the service
 * from here, so an app that provides no log doesn't ship that module's wire schema and encoder.
 *
 * The recorder that builds entries is loaded by `MessageLog` too, so an app that never imports it
 * doesn't carry the recorder either: until then a mount records nothing.
 */
import type * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import type * as Log from "../MessageLog.ts"
import type * as Recorder from "./recorder.ts"

/** @internal */
export const noop: Log.MessageLog = { enabled: false, record: () => {} }

/** @internal */
export const MessageLog: Context.Reference<Log.MessageLog> = Context.Reference<
  Log.MessageLog
>(
  "@effect/ui/MessageLog",
  { defaultValue: () => noop }
)

const run = <A>(f: () => A): A => f()

/** @internal */
export const silent: Recorder.Recording = {
  record: () => undefined,
  step: run,
  session: run,
  follow: () => run,
  tree: () => {},
  numberOf: () => undefined
}

/** @internal */
export let recorder:
  | ((
    log: Log.MessageLog,
    clock: Clock.Clock,
    session: string,
    app: string
  ) => Recorder.Recording)
  | undefined

/** @internal */
export const load = (make: NonNullable<typeof recorder>): void => {
  recorder = make
}
