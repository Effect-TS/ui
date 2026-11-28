import * as Router from "@effect/ui/Router"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"

/**
 * Keeps the context's Router in `routers` under `key` while the Stream
 * runs, for a handler that gets no context, such as a press or a pan.
 *
 * @internal
 */
export const hold = <K>(
  routers: {
    set(key: K, router: Router.Router): unknown
    delete(key: K): unknown
  },
  key: K
): Stream.Stream<never, never, Router.Router> =>
  Stream.callback(() =>
    Router.Router.use((router) =>
      Effect.acquireRelease(
        Effect.sync(() => routers.set(key, router)),
        () => Effect.sync(() => routers.delete(key))
      )
    )
  )
