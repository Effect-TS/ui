import * as StatusBar from "@effect/ui-native/kit/StatusBar"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"

const setup = (os: string) => {
  const manager = FakeDevice.module({ getConstants: () => ({ HEIGHT: 24 }) })
  const fake = FakeDevice.make(os, { StatusBarManager: manager.module })
  return { ...fake, calls: manager.calls }
}

describe("StatusBar", () => {
  it("reads height and sends platform-specific style and hidden arguments", async () => {
    assert.strictEqual(
      await FakeDevice.run(setup("android").device, StatusBar.height),
      24
    )
    assert.strictEqual(
      await FakeDevice.run(FakeDevice.make("unknown").device, StatusBar.height),
      0
    )

    const ios = setup("ios")
    await FakeDevice.run(
      ios.device,
      StatusBar.setStyle("light-content", { animated: true })
    )
    await FakeDevice.run(
      ios.device,
      StatusBar.SetHidden.make({ hidden: true, animation: "fade" }).effect
    )
    assert.deepStrictEqual(ios.calls, [
      ["setStyle", "light-content", true],
      ["setHidden", true, "fade"]
    ])

    const android = setup("android")
    await FakeDevice.run(android.device, StatusBar.setStyle("default"))
    await FakeDevice.run(android.device, StatusBar.setHidden(true))
    assert.deepStrictEqual(android.calls, [
      ["setStyle", "default"],
      ["setHidden", true]
    ])
  })

  it("stacks configure Subscriptions and restores previous or imperative values on close", async () => {
    const fake = setup("android")
    await FakeDevice.run(fake.device, StatusBar.setStyle("dark-content"))
    const outer = await FakeDevice.listen(
      fake.device,
      () => StatusBar.configure({ style: "light-content" })
    )
    const inner = await FakeDevice.listen(
      fake.device,
      () => StatusBar.configure({ hidden: true })
    )
    assert.deepStrictEqual(fake.calls, [
      ["setStyle", "dark-content"],
      ["setStyle", "light-content"],
      ["setHidden", true]
    ])
    // Imperative updates apply once no configure overrides that field.
    await FakeDevice.run(fake.device, StatusBar.setStyle("default"))
    assert.deepStrictEqual(fake.calls.at(-1), ["setStyle", "light-content"])
    await inner.close()
    assert.deepStrictEqual(fake.calls.at(-1), ["setHidden", false])
    const before = fake.calls.length
    await outer.close()
    assert.deepStrictEqual(fake.calls.slice(before), [["setStyle", "default"]])
  })
})
