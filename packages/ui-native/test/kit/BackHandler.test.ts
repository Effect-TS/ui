import { BackHandler } from "@effect/ui-native/kit"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"

const setup = () => {
  const manager = FakeDevice.module()
  const fake = FakeDevice.make("android", {
    DeviceEventManager: manager.module
  })
  const exits = () =>
    manager.calls.filter(([method]) =>
      method === "invokeDefaultBackPressHandler"
    ).length
  return { ...fake, exits }
}

describe("BackHandler", () => {
  it("gives a press to the latest handler first, which passes it on with undefined", async () => {
    const fake = setup()
    let taking = false
    const first = await FakeDevice.listen(
      fake.device,
      (got) => BackHandler.onPress(got("first"))
    )
    const second = await FakeDevice.listen(
      fake.device,
      (got) => BackHandler.onPress(() => taking ? got("second") : undefined)
    )
    fake.emit("hardwareBackPress")
    taking = true
    fake.emit("hardwareBackPress")
    await first.settle()
    await second.settle()
    assert.deepStrictEqual(first.values(), ["first"])
    assert.deepStrictEqual(second.values(), ["second"])
    assert.strictEqual(fake.exits(), 0)
    await first.close()
    await second.close()
  })

  it("runs the default when no handler takes the press, and stops listening with the last", async () => {
    const fake = setup()
    const passing = await FakeDevice.listen(
      fake.device,
      (got) => BackHandler.onPress<ReturnType<typeof got>>(() => undefined)
    )
    fake.emit("hardwareBackPress")
    assert.strictEqual(fake.exits(), 1)
    await passing.close()
    assert.strictEqual(fake.listening("hardwareBackPress"), 0)
  })

  it("exits on request, and does nothing without the native module", async () => {
    const fake = setup()
    await FakeDevice.run(fake.device, BackHandler.exit)
    assert.strictEqual(fake.exits(), 1)
    await FakeDevice.run(FakeDevice.make("ios").device, BackHandler.exit)
  })
})
