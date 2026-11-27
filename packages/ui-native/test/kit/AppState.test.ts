import * as AppState from "@effect/ui-native/kit/AppState"
import * as Native from "@effect/ui-native/Native"
import * as Query from "@effect/ui/Query"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"

const setup = (os = "ios") => {
  const appState = FakeDevice.module({
    getConstants: () => ({ initialAppState: "background" }),
    getCurrentAppState: (success) => success({ app_state: "active" })
  })
  return FakeDevice.make(os, { AppState: appState.module })
}

describe("AppState", () => {
  it("tracks state changes, keeps changes ahead of initial read, and defaults to active off a device", async () => {
    const fake = setup()
    const listener = await FakeDevice.listen(
      fake.device,
      (got) => AppState.onChange(got)
    )
    await listener.settle()
    fake.emit("appStateDidChange", { app_state: "background" })
    fake.emit("appStateDidChange", { app_state: "background" })
    await listener.settle()
    assert.deepStrictEqual(listener.values(), ["active", "background"])
    await listener.close()

    let answer: (e: unknown) => void = () => {}
    const raced = FakeDevice.make("ios", {
      AppState: FakeDevice.module({
        getConstants: () => ({ initialAppState: "active" }),
        getCurrentAppState: (success) => (answer = success)
      }).module
    })
    assert.strictEqual(
      await FakeDevice.run(raced.device, AppState.get),
      "active"
    )
    raced.emit("appStateDidChange", { app_state: "background" })
    answer({ app_state: "active" })
    assert.strictEqual(
      await FakeDevice.run(raced.device, AppState.get),
      "background"
    )
    assert.strictEqual(
      await FakeDevice.run(FakeDevice.make("unknown").device, AppState.get),
      "active"
    )
  })

  it("sends memory warnings and Android focus changes until closed", async () => {
    const fake = setup("android")
    const warnings = await FakeDevice.listen(
      fake.device,
      (got) => AppState.onMemoryWarning(() => got("low"))
    )
    const focus = await FakeDevice.listen(
      fake.device,
      (got) => AppState.onFocusChange(got)
    )
    fake.emit("memoryWarning")
    fake.emit("appStateFocusChange", false)
    await warnings.settle()
    await focus.settle()
    assert.deepStrictEqual(warnings.values(), ["low"])
    assert.deepStrictEqual(focus.values(), [false])
    await warnings.close()
    await focus.close()
    assert.strictEqual(fake.listening("memoryWarning"), 0)
  })

  it("feeds Query.Visibility from app state", async () => {
    const fake = setup()
    const signal = await Effect.runPromise(
      Query.Visibility.useSync((signal) => signal).pipe(
        Effect.provide(AppState.layerVisibility),
        Effect.provideService(Native.Device, fake.device)
      )
    )
    const seen: Array<boolean> = []
    signal.subscribe((visible) => seen.push(visible))
    assert.isTrue(signal.get())
    fake.emit("appStateDidChange", { app_state: "background" })
    assert.isFalse(signal.get())
    assert.deepStrictEqual(seen, [false])

    assert.isTrue(
      await Effect.runPromise(
        Effect.provide(
          Query.Visibility.useSync((s) => s.get()),
          Layer.provide(
            AppState.layerVisibility,
            Layer.succeed(Native.Device, FakeDevice.make("unknown").device)
          )
        )
      )
    )
  })
})
