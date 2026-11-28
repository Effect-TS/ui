import * as Linking from "@effect/ui-native/kit/Linking"
import * as Native from "@effect/ui-native/Native"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import * as Stream from "effect/Stream"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"

const answers = {
  openURL: (url: string) =>
    url.startsWith("https:")
      ? Promise.resolve()
      : Promise.reject(new Error("No app")),
  canOpenURL: (url: string) => Promise.resolve(url.startsWith("https:")),
  getInitialURL: () => Promise.resolve(null),
  sendIntent: () => Promise.resolve()
}

describe("Linking", () => {
  it("calls platform modules, sends Android intents, and surfaces failures as DeviceError and Result", async () => {
    const ios = FakeDevice.module(answers)
    const android = FakeDevice.module(answers)
    const iosDevice =
      FakeDevice.make("ios", { LinkingManager: ios.module }).device
    const androidDevice =
      FakeDevice.make("android", { IntentAndroid: android.module }).device

    await FakeDevice.run(iosDevice, Linking.openURL("https://a.test"))
    assert.isTrue(
      await FakeDevice.run(androidDevice, Linking.canOpenURL("https://b.test"))
    )
    assert.isUndefined(await FakeDevice.run(androidDevice, Linking.initialURL))
    const extras = [{ key: "k", value: 1 }]
    await FakeDevice.run(
      androidDevice,
      Linking.sendIntent("action.VIEW", extras)
    )
    assert.deepStrictEqual(ios.calls, [["openURL", "https://a.test"]])
    assert.deepStrictEqual(android.calls, [
      ["canOpenURL", "https://b.test"],
      ["getInitialURL"],
      ["sendIntent", "action.VIEW", extras]
    ])

    const rejected = await FakeDevice.run(
      iosDevice,
      Effect.flip(Linking.openURL("mailto:a"))
    )
    assert.instanceOf(rejected, Native.DeviceError)
    assert.strictEqual(rejected.method, "openURL")
    assert.strictEqual(
      (await FakeDevice.run(
        iosDevice,
        Effect.flip(Linking.sendIntent("action.VIEW"))
      )).method,
      "sendIntent"
    )
    assert.strictEqual(
      (await FakeDevice.run(
        FakeDevice.make("unknown").device,
        Effect.flip(Linking.openSettings)
      )).module,
      "LinkingManager"
    )
    assert.deepStrictEqual(
      Linking.CanOpen.make({ url: "https://a.test" }).args,
      { url: "https://a.test" }
    )
    assert.isTrue(
      Result.isFailure(
        await FakeDevice.run(
          iosDevice,
          Linking.Open.make({ url: "mailto:a" }).effect
        )
      )
    )
  })

  it("delivers incoming URLs via onURL and urls stream with iOS listener cleanup", async () => {
    const linking = FakeDevice.module(answers)
    const ios = FakeDevice.make("ios", { LinkingManager: linking.module })
    const listener = await FakeDevice.listen(
      ios.device,
      (got) => Linking.onURL(got)
    )
    await listener.settle()
    ios.emit("url", { url: "app://a" })
    await listener.settle()
    assert.deepStrictEqual(listener.values(), ["app://a"])
    assert.deepStrictEqual(linking.calls, [["addListener", "url"]])
    await listener.close()
    assert.deepStrictEqual(linking.calls.at(-1), ["removeListeners", 1])
    assert.strictEqual(ios.listening("url"), 0)

    const android = FakeDevice.make("android", {
      IntentAndroid: FakeDevice.module(answers).module
    })
    const urls = Effect.runPromise(
      Linking.urls.pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.provideService(Native.Device, android.device)
      )
    )
    while (android.listening("url") === 0) {
      await new Promise((r) => setTimeout(r, 1))
    }
    android.emit("url", { url: "app://a" })
    android.emit("url", { url: "app://b" })
    assert.deepStrictEqual(await urls, ["app://a", "app://b"])
  })
})
