/**
 * Whether the app is in the foreground, and the system's memory warnings.
 *
 * **Details**
 *
 * `get` reads the state, `onChange` is a Subscription that sends it when it
 * starts and on each change, and `changes` is a Stream of the changes.
 * `layerVisibility` makes `Query.Visibility` follow it, so queries refetch
 * when the app comes back to the foreground.
 *
 * Off a device the state is `"active"`.
 *
 * **Example** (Refetching queries when the app returns to the foreground)
 *
 * ```ts
 * import * as NativeApp from "@effect/ui-native/NativeApp"
 * import { AppState } from "@effect/ui-native/kit"
 * import { Layer } from "effect"
 * import { App } from "./App.ts"
 *
 * NativeApp.register(
 *   NativeApp.mount(App, {}).pipe(Layer.provide(AppState.layerVisibility))
 * )
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Query from "@effect/ui/Query"
import type * as Subscription from "@effect/ui/Subscription"
import type * as View from "@effect/ui/View"
import type * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Stream from "effect/Stream"
import * as Native from "../Native.ts"
import * as device from "./internal/device.ts"

/**
 * The app's state: `"active"` in the foreground, `"background"` behind
 * another app or the home screen, and on iOS `"inactive"` while switching
 * apps or showing a system dialog.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type State = "active" | "background" | "inactive" | "unknown"

const name = "AppState"

type Changed = { readonly app_state: State }

const state = device.source<State>(
  (d) => d.module(name)?.getConstants().initialAppState ?? "active",
  (d, set) => {
    let changed = false
    device.observe(d, name, "appStateDidChange", (e: Changed) => {
      changed = true
      set(e.app_state)
    })
    // The constant is the state at launch, which may have changed since. An
    // event that arrives before the answer is newer than it.
    d.module(name)?.getCurrentAppState((e: Changed) => {
      if (!changed) set(e.app_state)
    }, () => {})
  }
)

/**
 * The current state.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const get: Effect.Effect<State> = device.get(state)

/**
 * A Subscription that sends `handler`'s message with the state when it
 * starts, then with each change.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onChange = <Msg>(
  handler: View.Handler<Msg, State>
): Subscription.Subscription<Msg> =>
  device.onSource("@effect/ui-native/kit/AppState", state, handler)

/**
 * The state each time it changes.
 *
 * @stability experimental
 * @category streams
 * @since 0.1.0
 */
export const changes: Stream.Stream<State> = device.changes(state)

/**
 * A Subscription that sends `message` when the system is low on memory, so
 * the app can drop caches.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onMemoryWarning = <Msg>(
  message: Msg | (() => Msg | undefined)
): Subscription.Subscription<Msg> =>
  device.subscription<void, Msg>(
    "@effect/ui-native/kit/AppState/memoryWarning",
    message as View.Handler<Msg, void>,
    (d, listener) =>
      device.observe(d, name, "memoryWarning", () => listener(undefined))
  )

/**
 * A Subscription that sends `handler`'s message with `true` when the app's
 * window gains focus and `false` when it loses it, such as to the
 * notification shade. Android only: iOS never sends it.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onFocusChange = <Msg>(
  handler: View.Handler<Msg, boolean>
): Subscription.Subscription<Msg> =>
  device.subscription(
    "@effect/ui-native/kit/AppState/focusChange",
    handler,
    (d, listener) => d.on("appStateFocusChange", listener)
  )

/**
 * Provides `Query.Visibility`, true while the app is `"active"`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layerVisibility: Layer.Layer<never> = Layer.effect(
  Query.Visibility,
  Native.Device.useSync((d): Query.Signal => ({
    get: () => state(d).get() === "active",
    subscribe: (listener) =>
      state(d).subscribe((value) => listener(value === "active"))
  }))
)
