import { Vibration } from "@effect/ui-native/kit"
import * as Native from "@effect/ui-native/Native"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"

const setup = (os: string) => {
  const vibration = FakeDevice.module()
  const fake = FakeDevice.make(os, { Vibration: vibration.module })
  return { ...fake, calls: vibration.calls }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("Vibration", () => {
  it("vibrates once", async () => {
    const fake = setup("android")
    await FakeDevice.run(fake.device, Vibration.vibrate())
    await FakeDevice.run(
      fake.device,
      Vibration.Vibrate.make({ duration: 50 }).effect
    )
    assert.deepStrictEqual(fake.calls, [["vibrate", 400], ["vibrate", 50]])
  })

  it("hands Android the pattern, and cancels it when interrupted", async () => {
    const fake = setup("android")
    await FakeDevice.run(fake.device, Vibration.pattern([0, 5, 5, 5]))
    assert.deepStrictEqual(fake.calls, [["vibrateByPattern", [0, 5, 5, 5], -1]])
    const fiber = Effect.runFork(
      Effect.provideService(
        Vibration.pattern([10, 10], { repeat: true }),
        Native.Device,
        fake.device
      )
    )
    await sleep(5)
    await Effect.runPromise(Fiber.interrupt(fiber))
    assert.deepStrictEqual(fake.calls.slice(1), [[
      "vibrateByPattern",
      [10, 10],
      0
    ], ["cancel"]])
  })

  it("finishes a repeating Android pattern when cancelled or replaced", async () => {
    const fake = setup("android")
    const start = () =>
      Effect.runFork(
        Effect.provideService(
          Vibration.pattern([10, 10], { repeat: true }),
          Native.Device,
          fake.device
        )
      )
    const cancelled = start()
    await sleep(5)
    await FakeDevice.run(fake.device, Vibration.cancel)
    await Effect.runPromise(Fiber.join(cancelled))
    const replaced = start()
    await sleep(5)
    const next = start()
    await Effect.runPromise(Fiber.join(replaced))
    await Effect.runPromise(Fiber.interrupt(next))
    assert.deepStrictEqual(fake.calls.map(([m]) => m), [
      "vibrateByPattern",
      "cancel",
      "vibrateByPattern",
      "vibrateByPattern",
      "cancel"
    ])
  })

  it("times iOS's pauses, vibrating at once for a first pause of 0", async () => {
    const fake = setup("ios")
    await FakeDevice.run(fake.device, Vibration.pattern([0, 5, 5]))
    assert.deepStrictEqual(fake.calls, [["vibrate", 400], ["vibrate", 400], [
      "vibrate",
      400
    ]])
  })

  it("stops a repeating iOS pattern on cancel", async () => {
    const fake = setup("ios")
    const done = FakeDevice.run(
      fake.device,
      Vibration.pattern([2], { repeat: true })
    )
    await sleep(15)
    await FakeDevice.run(fake.device, Vibration.cancel)
    await done
    const count = fake.calls.length
    assert.isAbove(count, 1)
    await sleep(10)
    assert.strictEqual(fake.calls.length, count)
  })

  it("does nothing off a device", async () => {
    await FakeDevice.run(
      FakeDevice.make("unknown").device,
      Vibration.pattern([0, 5])
    )
  })
})
