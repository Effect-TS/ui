/**
 * Boots an @effect/ui root on a Fabric surface without React. The entries
 * `main-counter.ts` and `main-bench.ts` each call `boot` with their app.
 *
 * Native starts a surface by calling `RN$AppRegistry.runApplication` (see
 * `AppRegistryBinding.cpp`), so we install that global ourselves instead of
 * importing `AppRegistry`, whose `registerComponent` statically requires
 * React.
 */
import * as Renderer from "@effect/ui/Renderer"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import type * as Scope from "effect/Scope"
import processColor from "react-native/Libraries/StyleSheet/processColor"
import Platform from "react-native/Libraries/Utilities/Platform"
import { committed, now } from "./bench-runner.ts"
import * as FabricHost from "./FabricHost.ts"

declare const global: any

/**
 * Installs the globals native starts a surface through. `app` mounts the
 * root in the surface's container, and the surface lives until native stops it.
 */
export const boot = (
  app: (
    container: FabricHost.FabricNode
  ) => Effect.Effect<unknown, never, Renderer.Renderer | Scope.Scope>
): void => {
  const surfaces = new Map<number, Fiber.Fiber<unknown>>()

  // Native requestAnimationFrame reads `performance.now` for the frame time.
  global.performance ??= { now }

  // Native emits device events (keyboard, dimensions, appearance) through
  // these callable modules. Without React Native's InitializeCore nothing
  // registers them and the first emit aborts the app, so register no-op sinks.
  const sink = { emit() {} }
  global.RN$registerCallableModule("RCTDeviceEventEmitter", () => sink)
  global.RN$registerCallableModule("RCTNativeAppEventEmitter", () => sink)

  global.RN$AppRegistry = {
    runApplication(_appKey: string, params: { readonly rootTag: number }) {
      const made = FabricHost.make({
        ui: global.nativeFabricUIManager,
        rootTag: params.rootTag,
        platform: Platform,
        processColor,
        onCommit: committed
      })
      surfaces.set(
        params.rootTag,
        Effect.runFork(
          Effect.andThen(app(made.root), Effect.never).pipe(
            Effect.scoped,
            Effect.provide(Renderer.layer(made.host))
          )
        )
      )
    },
    setSurfaceProps() {}
  }
  global.RN$stopSurface = (rootTag: number) => {
    const fiber = surfaces.get(rootTag)
    surfaces.delete(rootTag)
    if (fiber !== undefined) Effect.runFork(Fiber.interrupt(fiber))
  }
}
