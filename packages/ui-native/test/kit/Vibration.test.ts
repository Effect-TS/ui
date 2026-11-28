import * as Vibration from "@effect/ui-native/kit/Vibration"
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
  it("vibrates once and is a no-op off a device", async () => {
    const fake = setup("android")
    await FakeDevice.run(fake.device, Vibration.vibrate())
    await FakeDevice.run(
      fake.device,
      Vibration.Vibrate.make({ duration: 50 }).effect
    )
    assert.deepStrictEqual(fake.calls, [["vibrate", 400], ["vibrate", 50]])
    await FakeDevice.run(
      FakeDevice.make("unknown").device,
      Vibration.pattern([0, 5])
    )
  })

  it("runs Android patterns and stops repeating ones on interrupt, cancel, or replacement", async () => {
    const fake = setup("android")
    await FakeDevice.run(fake.device, Vibration.pattern([0, 5, 5, 5]))
    assert.deepStrictEqual(fake.calls, [["vibrateByPattern", [0, 5, 5, 5], -1]])

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
    assert.deepStrictEqual(fake.calls.slice(1).map(([m]) => m), [
      "vibrateByPattern",
      "cancel",
      "vibrateByPattern",
      "vibrateByPattern",
      "cancel"
    ])
  })

  it("times iOS pattern pauses and stops repeating on cancel", async () => {
    const fake = setup("ios")
    await FakeDevice.run(fake.device, Vibration.pattern([0, 5, 5]))
    assert.deepStrictEqual(fake.calls, [
      ["vibrate", 400],
      ["vibrate", 400],
      ["vibrate", 400]
    ])

    const done = FakeDevice.run(
      fake.device,
      Vibration.pattern([2], { repeat: true })
    )
    await sleep(15)
    await FakeDevice.run(fake.device, Vibration.cancel)
    await done
    const count = fake.calls.length
    assert.isAbove(count, 4)
    await sleep(10)
    assert.strictEqual(fake.calls.length, count)
  })
})
