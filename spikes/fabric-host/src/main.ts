// The measurement scripts read these logs from logcat.
// oxlint-disable no-console
/**
 * Boots an @effect/ui root on a Fabric surface without React.
 *
 * Native starts a surface by calling `RN$AppRegistry.runApplication` (see
 * `AppRegistryBinding.cpp`), so we install that global ourselves instead of
 * importing `AppRegistry`, whose `registerComponent` statically requires
 * React.
 */
import * as Renderer from "@effect/ui/Renderer"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import processColor from "react-native/Libraries/StyleSheet/processColor"
import Platform from "react-native/Libraries/Utilities/Platform"
import { now, runBench } from "./bench-runner.ts"
import { Bench } from "./Bench.ts"
import { Counter } from "./Counter.ts"
import * as FabricHost from "./FabricHost.ts"
import * as Spike from "./Spike.ts"

declare const global: any

const surfaces = new Map<number, Fiber.Fiber<unknown>>()

const runApplication = (
  _appKey: string,
  params: { readonly rootTag: number }
) => {
  const made = FabricHost.make({
    ui: global.nativeFabricUIManager,
    rootTag: params.rootTag,
    platform: Platform,
    processColor
  })
  let onCommit: (() => void) | undefined
  let firstCommit = true
  const host: Renderer.Host<FabricHost.FabricNode> = {
    ...made.host,
    commit() {
      made.host.commit!()
      if (firstCommit) {
        firstCommit = false
        console.log(
          `SPIKE_STARTUP ${
            JSON.stringify({
              bundleStartToFirstCommitMs: now() - global.__BUNDLE_START_TIME__
            })
          }`
        )
      }
      onCommit?.()
    }
  }
  const bench = process.env.EXPO_PUBLIC_SPIKE === "bench"
  const program = Effect.gen(function*() {
    const root = yield* Renderer.mount(
      (bench ? Bench : Counter) as typeof Counter,
      {},
      made.root
    )
    if (bench) {
      yield* Effect.promise(() =>
        runBench((message) =>
          new Promise<void>((resolve) => {
            onCommit = () => {
              onCommit = undefined
              resolve()
            }
            root.send(message as any)
          })
        )
      )
    }
    return yield* Effect.never
  }).pipe(
    Effect.scoped,
    Effect.provide(
      Layer.mergeAll(Renderer.layer(host), Layer.succeed(Spike.Host, {}))
    )
  )
  surfaces.set(params.rootTag, Effect.runFork(program))
}

// Native requestAnimationFrame reads `performance.now` for the frame time.
global.performance ??= { now }

// Native emits device events (keyboard, dimensions, appearance) through these
// callable modules. Without React Native's InitializeCore nothing registers
// them and the first emit aborts the app, so register no-op sinks.
const sink = { emit() {} }
global.RN$registerCallableModule("RCTDeviceEventEmitter", () => sink)
global.RN$registerCallableModule("RCTNativeAppEventEmitter", () => sink)

global.RN$AppRegistry = {
  runApplication,
  setSurfaceProps() {}
}
global.RN$stopSurface = (rootTag: number) => {
  const fiber = surfaces.get(rootTag)
  surfaces.delete(rootTag)
  if (fiber !== undefined) Effect.runFork(Fiber.interrupt(fiber))
}
