import * as Native from "@effect/ui-native/Native"
import * as NativeApp from "@effect/ui-native/NativeApp"
import * as Subscription from "@effect/ui/Subscription"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { afterAll, assert, describe, it, vi } from "vitest"
import * as FakeFabric from "./utils/FakeFabric.ts"

// React Native ships Flow sources, so the modules NativeApp reaches into
// are stood in for.
const native = vi.hoisted(() => {
  const listeners = new Map<string, Array<(payload: unknown) => void>>()
  const state = {
    backPresses: 0,
    emitter: {
      addListener(type: string, listener: (payload: unknown) => void) {
        listeners.set(type, [...(listeners.get(type) ?? []), listener])
        return {
          remove: () =>
            listeners.set(
              type,
              listeners.get(type)!.filter((l) => l !== listener)
            )
        }
      },
      listenerCount: (type: string) => listeners.get(type)?.length ?? 0,
      emit(type: string, payload?: unknown) {
        for (const listener of listeners.get(type) ?? []) listener(payload)
      }
    },
    modules: {
      DeviceEventManager: {
        invokeDefaultBackPressHandler: () => state.backPresses++
      }
    } as Record<string, unknown>
  }
  return state
})
vi.mock(
  "react-native/Libraries/EventEmitter/RCTDeviceEventEmitter",
  () => ({ default: native.emitter })
)
vi.mock(
  "react-native/Libraries/TurboModule/TurboModuleRegistry",
  () => ({ get: (name: string) => native.modules[name] ?? null })
)
vi.mock(
  "react-native/Libraries/StyleSheet/processColor",
  () => ({ default: (color: unknown) => color })
)
vi.mock(
  "react-native/Libraries/Utilities/Platform",
  () => ({ default: { OS: "android" } })
)
vi.mock(
  "react-native/Libraries/Core/Devtools/getDevServer",
  () => ({ default: () => ({ fullBundleUrl: null }) })
)
vi.mock(
  "react-native/Libraries/Utilities/DevSettings",
  () => ({ default: { reload() {}, onFastRefresh() {} } })
)
vi.mock(
  "react-native/Libraries/WebSocket/WebSocket",
  () => ({ default: function WebSocket() {} })
)

const global = globalThis as any

const Greeting = Native.component({
  name: "Greeting",
  props: Schema.Struct({ name: Schema.String }),
  model: Schema.Struct({ name: Schema.String }),
  message: UiSchema.TaggedEnum({ Cleared: {} })
}).make({
  init: ($) => ({ name: $.props.name }),
  update: { Cleared: ($) => $.evolve({ name: () => "" }) },
  view: (h, model) => h.text.children(`Hello, ${model.name}`)
})

const Named = Native.component({
  name: "Named",
  props: Schema.Struct({ name: Schema.String }),
  model: Schema.Struct({}),
  message: Schema.Never
}).make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) => h.text.children(`Hello, ${h.props.name}`)
})

const settle = () => new Promise((r) => setTimeout(r, 10))

// Each test registers the app on the same globals.
describe("NativeApp", { concurrent: false }, () => {
  const fabric = FakeFabric.make()
  const modules = new Map<string, unknown>()
  global.nativeFabricUIManager = fabric.ui
  global.RN$registerCallableModule = (name: string, factory: () => unknown) =>
    modules.set(name, factory())
  afterAll(() => {
    for (
      const key of [
        "nativeFabricUIManager",
        "RN$registerCallableModule",
        "RN$AppRegistry",
        "RN$stopSurface"
      ]
    ) {
      delete global[key]
    }
  })

  it("mounts the app on each surface native starts, until native stops it", async () => {
    NativeApp.register(
      NativeApp.mount(
        Greeting,
        NativeApp.Surface.useSync(({ props }) => ({
          name: String(props.name)
        }))
      )
    )
    assert.includeMembers([...modules.keys()], [
      "RCTDeviceEventEmitter",
      "RCTNativeAppEventEmitter",
      "RCTLog",
      "HMRClient"
    ])
    assert.isFunction(global.performance.now)

    global.RN$AppRegistry.runApplication("main", {
      rootTag: 11,
      initialProps: { name: "Tim" }
    })
    await settle()
    assert.strictEqual(
      FakeFabric.print(fabric.committed()),
      "<RCTText>Hello, Tim</>"
    )

    global.RN$stopSurface(11)
    await settle()
    assert.strictEqual(FakeFabric.print(fabric.committed()), "")
  })

  it("passes replaced props to the root with Native.Host, skipping equal ones", async () => {
    const runs: Array<unknown> = []
    NativeApp.register(
      NativeApp.mount(
        Named,
        Native.Host.use(() =>
          NativeApp.Surface.useSync(({ props }) => {
            runs.push(props)
            return { name: String(props.name) }
          })
        )
      )
    )
    global.RN$AppRegistry.runApplication("main", {
      rootTag: 21,
      initialProps: { name: "Tim", nested: { a: 1, b: [2] } }
    })
    await settle()
    assert.strictEqual(
      FakeFabric.print(fabric.committed()),
      "<RCTText>Hello, Tim</>"
    )

    // A display mode change sends equal props in new objects.
    global.RN$AppRegistry.setSurfaceProps("main", {
      rootTag: 21,
      initialProps: { nested: { b: [2], a: 1 }, name: "Tim" }
    }, 1)
    await settle()
    assert.strictEqual(runs.length, 1)

    global.RN$AppRegistry.setSurfaceProps("main", {
      rootTag: 21,
      initialProps: { name: "Ann" }
    })
    await settle()
    assert.strictEqual(runs.length, 2)
    assert.strictEqual(
      FakeFabric.print(fabric.committed()),
      "<RCTText>Hello, Ann</>"
    )

    global.RN$stopSurface(21)
    await settle()
  })

  it("replaces the first run of props with props native sends during it", async () => {
    let release: () => void = () => {}
    const gate = Effect.callback<void>((resume) => {
      release = () => resume(Effect.void)
    })
    let runs = 0
    NativeApp.register(
      NativeApp.mount(
        Named,
        NativeApp.Surface.use(({ props }) => {
          const name = { name: String(props.name) }
          return runs++ === 0 ? Effect.as(gate, name) : Effect.succeed(name)
        })
      )
    )
    global.RN$AppRegistry.runApplication("main", {
      rootTag: 41,
      initialProps: { name: "Tim" }
    })
    await settle()
    global.RN$AppRegistry.setSurfaceProps("main", {
      rootTag: 41,
      initialProps: { name: "Ann" }
    })
    await settle()
    assert.strictEqual(
      FakeFabric.print(fabric.committed()),
      "<RCTText>Hello, Ann</>"
    )
    release()
    await settle()
    assert.strictEqual(runs, 2)
    global.RN$stopSurface(41)
    await settle()
  })

  it("provides the device to the app's components", async () => {
    const seen: Array<string> = []
    const Probe = Native.component({
      name: "Probe",
      model: Schema.Struct({}),
      message: Schema.Never
    }).make({
      init: () => ({}),
      update: ($) => $.model,
      subscriptions: () => [
        Subscription.direct<undefined, never>(
          "device",
          undefined,
          undefined,
          (context) => {
            const device = Context.get(context, Native.Device)
            seen.push(device.os)
            return device.on("probe", (payload) => seen.push(payload))
          }
        )
      ],
      view: (h) => h.text.children("probe")
    })
    NativeApp.register(NativeApp.mount(Probe, {}))
    global.RN$AppRegistry.runApplication("main", { rootTag: 31 })
    await settle()
    native.emitter.emit("probe", "event")
    assert.deepStrictEqual(seen, ["android", "event"])
    global.RN$stopSurface(31)
    await settle()
    native.emitter.emit("probe", "after")
    assert.deepStrictEqual(seen, ["android", "event"])
  })

  it("runs Android's default Back action unless another listener handles it", () => {
    native.emitter.emit("hardwareBackPress")
    assert.strictEqual(native.backPresses, 1)
    native.emitter.addListener("hardwareBackPress", () => {})
    native.emitter.emit("hardwareBackPress")
    assert.strictEqual(native.backPresses, 1)
  })

  it("installs queueMicrotask when missing", async () => {
    const original = global.queueMicrotask
    const installWithout = async (
      microtasks?: { readonly queueMicrotask: (task: () => void) => void }
    ) => {
      vi.resetModules()
      const Fresh = await import("@effect/ui-native/NativeApp")
      if (microtasks === undefined) delete native.modules.NativeMicrotasksCxx
      else native.modules.NativeMicrotasksCxx = microtasks
      delete global.queueMicrotask
      Fresh.register(Layer.empty)
      const installed = global.queueMicrotask as (task: () => void) => void
      global.queueMicrotask = original
      return installed
    }
    try {
      const nativeQueue = () => {}
      const installed = await installWithout({ queueMicrotask: nativeQueue })
      assert.strictEqual(installed, nativeQueue)

      const fallback = await installWithout()
      assert.isFunction(fallback)
      const order: Array<string> = []
      await new Promise<void>((resolve) => {
        fallback(() => {
          order.push("microtask")
          resolve()
        })
        order.push("sync")
      })
      assert.deepStrictEqual(order, ["sync", "microtask"])
    } finally {
      global.queueMicrotask = original
      delete native.modules.NativeMicrotasksCxx
    }
  })
})
