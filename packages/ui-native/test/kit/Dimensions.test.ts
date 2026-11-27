import * as Dimensions from "@effect/ui-native/kit/Dimensions"
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
  it("reads iOS points, converts Android pixels, rounds to pixels, and defaults off a device", async () => {
    assert.deepStrictEqual(
      await FakeDevice.run(
        device("ios", { window: { ...size(390, 844), extra: 1 } }).device,
        Dimensions.get
      ),
      { window: size(390, 844), screen: size(390, 844) }
    )
    assert.deepStrictEqual(
      await FakeDevice.run(
        device("android", {
          window: size(1, 1),
          windowPhysicalPixels: size(780, 1600),
          screenPhysicalPixels: size(780, 1688)
        }).device,
        Dimensions.get
      ),
      { window: size(390, 800), screen: size(390, 844) }
    )
    assert.deepStrictEqual(
      await FakeDevice.run(FakeDevice.make("unknown").device, Dimensions.get),
      {
        window: { width: 0, height: 0, scale: 1, fontScale: 1 },
        screen: { width: 0, height: 0, scale: 1, fontScale: 1 }
      }
    )
    assert.strictEqual(Dimensions.roundToPixel(10.3, 3), 31 / 3)
    assert.strictEqual(Dimensions.toPixels(10.3, 3), 31)
  })

  it("delivers initial dimensions and updates via onChange and changes stream", async () => {
    const fake = device("ios", { window: size(390, 844) })
    const listener = await FakeDevice.listen(
      fake.device,
      (got) => Dimensions.onChange((d) => got(d.window.width))
    )
    const fiber = Effect.runFork(
      Effect.provideService(
        Stream.runCollect(Stream.take(Dimensions.changes, 1)),
        Native.Device,
        fake.device
      )
    )
    await listener.settle()
    fake.emit("didUpdateDimensions", { window: size(844, 390) })
    await listener.settle()
    const [changed] = await Effect.runPromise(Fiber.join(fiber))
    assert.deepStrictEqual(listener.values(), [390, 844])
    assert.strictEqual(changed.window.height, 390)
    assert.deepStrictEqual(
      await FakeDevice.run(fake.device, Dimensions.get),
      { window: size(844, 390), screen: size(844, 390) }
    )
    await listener.close()
  })
})
