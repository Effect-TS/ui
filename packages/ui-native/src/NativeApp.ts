/**
 * Starts an `@effect/ui` app on React Native, without React.
 *
 * Native starts each surface, such as an Android activity's root view, by
 * calling `RN$AppRegistry.runApplication`. {@link register} installs that
 * global, and the rest of what React Native's own startup would: the event
 * emitters native sends device events through, `performance`,
 * `queueMicrotask`, and in development the Fast Refresh client.
 *
 * Networking globals such as `fetch` are not installed by {@link register}.
 * Import `@effect/ui-native/networking` from the entry module if your app
 * makes network requests.
 *
 * @example
 * ```ts
 * import * as NativeApp from "@effect/ui-native/NativeApp"
 * import { Counter } from "./Counter.ts"
 *
 * NativeApp.register(NativeApp.mount(Counter, {}))
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as dev from "#dev"
import type * as Component from "@effect/ui/Component"
import * as Renderer from "@effect/ui/Renderer"
import type * as View from "@effect/ui/View"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Scope from "effect/Scope"
import RCTDeviceEventEmitter from "react-native/Libraries/EventEmitter/RCTDeviceEventEmitter"
import processColor from "react-native/Libraries/StyleSheet/processColor"
import * as TurboModuleRegistry from "react-native/Libraries/TurboModule/TurboModuleRegistry"
import Platform from "react-native/Libraries/Utilities/Platform"
import { type Cell, cell } from "./internal/cell.ts"
import { blurFocused } from "./internal/focus.ts"
import * as Native from "./Native.ts"
import * as NativeHost from "./NativeHost.ts"

declare const global: any

/**
 * The surface an app was started on, as native passes it.
 *
 * **Details**
 *
 * `props` are the surface's initial props, such as the ones an Android
 * activity passes in `getLaunchOptions`. Native can replace them while the
 * surface runs, and `props` always reads the latest. `onProps` calls
 * `listener` with each replacement that differs from the props before it,
 * until the returned function is called.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export class Surface extends Context.Service<Surface, {
  readonly appKey: string
  readonly rootTag: number
  readonly props: Readonly<Record<string, unknown>>
  readonly onProps: (
    listener: (props: Readonly<Record<string, unknown>>) => void
  ) => () => void
}>()("@effect/ui-native/NativeApp/Surface") {}

/**
 * Passes when a root component renders native elements or is host-neutral,
 * and otherwise names the host its vocabulary requires.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type NativeRoot<V> = [Renderer.HostOf<V>] extends [Native.Host] ? unknown
  : {
    readonly "NativeApp.mount shows native elements. This root's vocabulary needs":
      Renderer.HostOf<V>
  }

/**
 * Options accepted by {@link mount} and {@link mountEffect}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MountOptions<
  V extends View.Elements,
  RF = never,
  Events = unknown
> {
  /** Receives the root's events in emission order, as for `Renderer.mount`. */
  readonly onEmit?: ((event: Events) => void) | undefined
  readonly fallback?:
    | ((
      failure: AsyncResult.Failure<never, unknown>,
      h: View.WithTags<never, {}, V>
    ) => View.Content<never, RF>)
    | undefined
  readonly query?: Renderer.QueryOptions | undefined
  /** Called after every commit to Fabric. */
  readonly onCommit?: (() => void) | undefined
}

/**
 * Mounts `component` on the current surface for the life of the Scope.
 *
 * **Details**
 *
 * When `props` is an Effect, it runs before the first render, and again
 * whenever native replaces the surface's props, so it can read them from
 * `Surface`. Each run's props go to the root, which skips props equal to its
 * current ones. A run still going when the next starts is interrupted.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const mountEffect = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component:
    & Component.Members<Name, Props, Model, Msg, Events, R, V, any>
    & NativeRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  options?: MountOptions<V, RF, Events> | undefined
): Effect.Effect<
  Renderer.Root<Model, Msg, Props>,
  never,
  Exclude<R | RF | RP, Native.Host> | Surface | Scope.Scope
> =>
  Surface.use((surface) => {
    const made = NativeHost.make({
      ui: global.nativeFabricUIManager,
      rootTag: surface.rootTag,
      device,
      onCommit: options?.onCommit
    })
    const services = Context.make(Renderer.Renderer, { host: made.host }).pipe(
      Context.add(Native.Host, made.operations)
    )
    const mount = (props: unknown) =>
      Effect.provideContext(
        Renderer.mount(component as any, props as any, made.root, options),
        services
      ) as Effect.Effect<Renderer.Root<Model, Msg, Props>, never, any>
    if (!Effect.isEffect(props)) return mount(props)
    // Listens before mounting. Props native sends during the first run of
    // `props` replace that run, and ones sent while the root mounts run it
    // again once the root exists.
    return Effect.flatMap(Effect.context<any>(), (outer) => {
      const context = Context.merge(outer, services)
      let root: Renderer.Root<Model, Msg, Props> | undefined
      let missed = false
      let replace: (() => void) | undefined
      let fiber: Fiber.Fiber<unknown> | undefined
      const run = (root: Renderer.Root<Model, Msg, Props>) => {
        fiber?.interruptUnsafe()
        fiber = Effect.runForkWith(context)(Effect.map(props, root.setProps))
      }
      const first: Effect.Effect<Props, never, RP> = Effect.suspend(() => {
        missed = false
        return Effect.raceFirst(
          Effect.map(props, (value) => ({ value })),
          Effect.callback<undefined>((resume) => {
            replace = () => resume(Effect.succeed(undefined))
          })
        )
      }).pipe(Effect.flatMap((ran) => {
        replace = undefined
        return ran === undefined ? first : Effect.succeed(ran.value)
      }))
      return Effect.acquireRelease(
        Effect.sync(() =>
          surface.onProps(() => {
            if (root !== undefined) return run(root)
            missed = true
            replace?.()
          })
        ),
        (off) =>
          Effect.sync(() => {
            off()
            fiber?.interruptUnsafe()
          })
      ).pipe(
        Effect.andThen(mount(first)),
        Effect.tap((mounted) =>
          Effect.sync(() => {
            root = mounted
            if (missed) run(mounted)
          })
        )
      )
    })
  }) as any

/**
 * A Layer that mounts `component` on the current surface while it's alive.
 * Pass it to {@link register}.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const mount = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component:
    & Component.Members<Name, Props, Model, Msg, Events, R, V, any>
    & NativeRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  options?: MountOptions<V, RF, Events> | undefined
): Layer.Layer<never, never, Exclude<R | RF | RP, Native.Host> | Surface> =>
  Layer.effectDiscard(mountEffect(component, props, options))

const device: Native.Device = {
  os: Platform.OS,
  on(event, listener) {
    const subscription = RCTDeviceEventEmitter.addListener(event, listener)
    return () => subscription.remove()
  },
  module: (name) => TurboModuleRegistry.get(name) ?? undefined,
  blur: blurFocused,
  color: processColor
}

let installed = false

const install = () => {
  if (installed) return
  installed = true
  // Native's requestAnimationFrame reads the frame time from here.
  global.performance ??= { now: global.nativePerformanceNow ?? Date.now }
  // React Native's setUpTimers installs this from the same module.
  global.queueMicrotask ??=
    device.module("NativeMicrotasksCxx")?.queueMicrotask ??
      ((callback: () => void) => {
        void Promise.resolve().then(callback)
      })
  const register = (name: string, module: object) =>
    global.RN$registerCallableModule(name, () => module)
  // Native sends device events, such as the keyboard's and the network's,
  // through these. React Native's own emitter keeps its modules working.
  register("RCTDeviceEventEmitter", RCTDeviceEventEmitter)
  register("RCTNativeAppEventEmitter", RCTDeviceEventEmitter)
  register("RCTLog", {
    logIfNoNativeHook(level: string, ...args: ReadonlyArray<unknown>) {
      if (global.nativeLoggingHook !== undefined) return
      // oxlint-disable-next-line no-console
      console[level === "error" || level === "fatal" ? "error" : "log"](...args)
    }
  })
  // Android sends Back to JS first, and runs the activity's default action,
  // closing it, only when asked to. The kit's BackHandler and React Native's
  // ask when no handler consumes the press, so this asks only while neither
  // listens.
  RCTDeviceEventEmitter.addListener("hardwareBackPress", () => {
    if (RCTDeviceEventEmitter.listenerCount("hardwareBackPress") === 1) {
      device.module("DeviceEventManager")?.invokeDefaultBackPressHandler()
    }
  })
  dev.install(register)
}

/**
 * Runs `app` on every surface native starts, from the start until native
 * stops the surface, which closes the Layer's Scope. Call it once, from the
 * module the bundle starts at.
 *
 * **Details**
 *
 * `app` gets the `Surface`, and `Native.Device` for the device APIs in
 * `@effect/ui-native/kit`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const register = <A>(app: Layer.Layer<A, never, Surface>): void => {
  install()
  const surfaces = new Map<number, {
    readonly fiber: Fiber.Fiber<unknown>
    readonly props: Cell<Readonly<Record<string, unknown>>>
  }>()
  const stop = (rootTag: number) => {
    const running = surfaces.get(rootTag)
    surfaces.delete(rootTag)
    if (running !== undefined) Effect.runFork(Fiber.interrupt(running.fiber))
  }
  type Params = {
    readonly rootTag: number
    readonly initialProps?: Readonly<Record<string, unknown>> | null
  }
  global.RN$AppRegistry = {
    runApplication(appKey: string, params: Params) {
      stop(params.rootTag)
      const props = cell(params.initialProps ?? {}, Equal.equals)
      surfaces.set(params.rootTag, {
        props,
        fiber: Effect.runFork(
          Layer.launch(Layer.provide(
            app,
            Layer.succeedContext(
              Context.make(Surface, {
                appKey,
                rootTag: params.rootTag,
                get props() {
                  return props.get()
                },
                onProps: props.subscribe
              }).pipe(Context.add(Native.Device, device))
            )
          ))
        )
      })
    },
    // Native sends new props, and sends them again when the surface's
    // display mode changes.
    setSurfaceProps(_appKey: string, params: Params) {
      surfaces.get(params.rootTag)?.props.set(params.initialProps ?? {})
    }
  }
  global.RN$stopSurface = stop
}
