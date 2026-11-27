import { Dimensions } from "@effect/ui-native/kit"
import * as Native from "@effect/ui-native/Native"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Stream from "effect/Stream"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"

const size = (width: number, height: number) => ({
  width,
  height,
  scale: 2,
  fontScale: 1
})

const device = (os: string, constants: unknown) =>
  FakeDevice.make(os, {
    DeviceInfo: FakeDevice.module({
      getConstants: () => ({ Dimensions: constants })
    }).module
  })

describe("Dimensions", () => {
  it("reads iOS's points, and the window for a missing screen", async () => {
    const { device: d } = device("ios", {
      window: { ...size(390, 844), extra: 1 }
    })
    assert.deepStrictEqual(await FakeDevice.run(d, Dimensions.get), {
      window: size(390, 844),
      screen: size(390, 844)
    })
  })

  it("turns Android's pixels into points", async () => {
    const { device: d } = device("android", {
      window: size(1, 1),
      windowPhysicalPixels: size(780, 1600),
      screenPhysicalPixels: size(780, 1688)
    })
    assert.deepStrictEqual(await FakeDevice.run(d, Dimensions.get), {
      window: size(390, 800),
      screen: size(390, 844)
    })
  })

  it("sends the dimensions when it starts, then each change", async () => {
    const fake = device("ios", { window: size(390, 844) })
    const listener = await FakeDevice.listen(
      fake.device,
      (got) => Dimensions.onChange((d) => got(d.window.width))
    )
    await listener.settle()
    fake.emit("didUpdateDimensions", { window: size(844, 390) })
    await listener.settle()
    assert.deepStrictEqual(listener.values(), [390, 844])
    assert.deepStrictEqual(
      await FakeDevice.run(fake.device, Dimensions.get),
      { window: size(844, 390), screen: size(844, 390) }
    )
    await listener.close()
  })

  it("streams the changes", async () => {
    const fake = device("ios", { window: size(390, 844) })
    const fiber = Effect.runFork(
      Effect.provideService(
        Stream.runCollect(Stream.take(Dimensions.changes, 1)),
        Native.Device,
        fake.device
      )
    )
    await new Promise((r) => setTimeout(r, 0))
    fake.emit("didUpdateDimensions", { window: size(1, 2) })
    const [changed] = await Effect.runPromise(Fiber.join(fiber))
    assert.strictEqual(changed.window.height, 2)
  })

  it("is 0 by 0 at scale 1 off a device", async () => {
    const { device: d } = FakeDevice.make("unknown")
    assert.deepStrictEqual(await FakeDevice.run(d, Dimensions.get), {
      window: { width: 0, height: 0, scale: 1, fontScale: 1 },
      screen: { width: 0, height: 0, scale: 1, fontScale: 1 }
    })
  })

  it("rounds to pixels", () => {
    assert.strictEqual(Dimensions.roundToPixel(10.3, 3), 31 / 3)
    assert.strictEqual(Dimensions.toPixels(10.3, 3), 31)
  })
})
