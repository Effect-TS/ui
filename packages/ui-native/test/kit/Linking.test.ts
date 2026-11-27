import { Linking } from "@effect/ui-native/kit"
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
  it("calls LinkingManager on iOS and IntentAndroid on Android", async () => {
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
    assert.deepStrictEqual(ios.calls, [["openURL", "https://a.test"]])
    assert.deepStrictEqual(android.calls, [["canOpenURL", "https://b.test"]])
  })

  it("fails with a DeviceError when native rejects, or the module is missing", async () => {
    const linking = FakeDevice.module(answers)
    const fake = FakeDevice.make("ios", { LinkingManager: linking.module })
    const rejected = await FakeDevice.run(
      fake.device,
      Effect.flip(Linking.openURL("mailto:a"))
    )
    assert.instanceOf(rejected, Native.DeviceError)
    assert.strictEqual(rejected.method, "openURL")
    const missing = await FakeDevice.run(
      FakeDevice.make("unknown").device,
      Effect.flip(Linking.openSettings)
    )
    assert.strictEqual(missing.module, "LinkingManager")
  })

  it("reads no initial URL as undefined", async () => {
    const linking = FakeDevice.module(answers)
    const fake = FakeDevice.make("android", { IntentAndroid: linking.module })
    assert.isUndefined(await FakeDevice.run(fake.device, Linking.initialURL))
  })

  it("sends intents only on Android", async () => {
    const linking = FakeDevice.module(answers)
    const android = FakeDevice.make("android", {
      IntentAndroid: linking.module
    })
    const ios = FakeDevice.make("ios", { IntentAndroid: linking.module })
    const extras = [{ key: "k", value: 1 }]
    await FakeDevice.run(
      android.device,
      Linking.sendIntent("action.VIEW", extras)
    )
    const failed = await FakeDevice.run(
      ios.device,
      Effect.flip(Linking.sendIntent("action.VIEW"))
    )
    assert.strictEqual(failed.method, "sendIntent")
    assert.deepStrictEqual(linking.calls, [[
      "sendIntent",
      "action.VIEW",
      extras
    ]])
  })

  it("sends the URLs that open the app, telling iOS's module of the listener", async () => {
    const linking = FakeDevice.module(answers)
    const fake = FakeDevice.make("ios", { LinkingManager: linking.module })
    const listener = await FakeDevice.listen(
      fake.device,
      (got) => Linking.onURL(got)
    )
    await listener.settle()
    fake.emit("url", { url: "app://a" })
    await listener.settle()
    assert.deepStrictEqual(listener.values(), ["app://a"])
    assert.deepStrictEqual(linking.calls, [["addListener", "url"]])
    await listener.close()
    assert.deepStrictEqual(linking.calls.at(-1), ["removeListeners", 1])
    assert.strictEqual(fake.listening("url"), 0)
  })

  it("streams the URLs", async () => {
    const fake = FakeDevice.make("android", {
      IntentAndroid: FakeDevice.module(answers).module
    })
    const urls = Effect.runPromise(
      Linking.urls.pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.provideService(Native.Device, fake.device)
      )
    )
    while (fake.listening("url") === 0) {
      await new Promise((r) => setTimeout(r, 1))
    }
    fake.emit("url", { url: "app://a" })
    fake.emit("url", { url: "app://b" })
    assert.deepStrictEqual(await urls, ["app://a", "app://b"])
  })

  it("answers its Commands with a Result", async () => {
    const linking = FakeDevice.module(answers)
    const fake = FakeDevice.make("ios", { LinkingManager: linking.module })
    const command = Linking.CanOpen.make({ url: "https://a.test" })
    assert.deepStrictEqual(command.args, { url: "https://a.test" })
    const open = await FakeDevice.run(
      fake.device,
      Linking.Open.make({ url: "mailto:a" }).effect
    )
    assert.isTrue(Result.isFailure(open))
  })
})
