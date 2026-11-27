import { AppState } from "@effect/ui-native/kit"
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
  it("reads the current state over the one at launch, and sends each change", async () => {
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
  })

  it("keeps a change that arrives before native answers with the current state", async () => {
    let answer: (e: unknown) => void = () => {}
    const fake = FakeDevice.make("ios", {
      AppState: FakeDevice.module({
        getConstants: () => ({ initialAppState: "active" }),
        getCurrentAppState: (success) => (answer = success)
      }).module
    })
    assert.strictEqual(
      await FakeDevice.run(fake.device, AppState.get),
      "active"
    )
    fake.emit("appStateDidChange", { app_state: "background" })
    answer({ app_state: "active" })
    assert.strictEqual(
      await FakeDevice.run(fake.device, AppState.get),
      "background"
    )
  })

  it("sends memory warnings and Android's focus changes", async () => {
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

  it("makes Query.Visibility follow it", async () => {
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
  })

  it("is active off a device", async () => {
    const { device } = FakeDevice.make("unknown")
    assert.strictEqual(await FakeDevice.run(device, AppState.get), "active")
    assert.isTrue(
      await Effect.runPromise(
        Effect.provide(
          Query.Visibility.useSync((s) => s.get()),
          Layer.provide(
            AppState.layerVisibility,
            Layer.succeed(Native.Device, device)
          )
        )
      )
    )
  })
})
