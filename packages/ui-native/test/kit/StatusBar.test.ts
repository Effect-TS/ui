import { StatusBar } from "@effect/ui-native/kit"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"

const setup = (os: string) => {
  const manager = FakeDevice.module({ getConstants: () => ({ HEIGHT: 24 }) })
  const fake = FakeDevice.make(os, { StatusBarManager: manager.module })
  return { ...fake, calls: manager.calls }
}

describe("StatusBar", () => {
  it("reads the height, 0 off a device", async () => {
    assert.strictEqual(
      await FakeDevice.run(setup("android").device, StatusBar.height),
      24
    )
    assert.strictEqual(
      await FakeDevice.run(FakeDevice.make("unknown").device, StatusBar.height),
      0
    )
  })

  it("passes iOS the animation, and Android only the value", async () => {
    const ios = setup("ios")
    await FakeDevice.run(
      ios.device,
      StatusBar.setStyle("light-content", { animated: true })
    )
    await FakeDevice.run(
      ios.device,
      StatusBar.SetHidden.make({ hidden: true, animation: "fade" }).effect
    )
    assert.deepStrictEqual(ios.calls, [["setStyle", "light-content", true], [
      "setHidden",
      true,
      "fade"
    ]])
    const android = setup("android")
    await FakeDevice.run(android.device, StatusBar.setStyle("dark-content"))
    await FakeDevice.run(android.device, StatusBar.setHidden(true))
    assert.deepStrictEqual(android.calls, [["setStyle", "dark-content"], [
      "setHidden",
      true
    ]])
  })

  it("lets the latest configure win for each field, and restores the one before", async () => {
    const fake = setup("android")
    const outer = await FakeDevice.listen(
      fake.device,
      () => StatusBar.configure({ style: "light-content" })
    )
    const inner = await FakeDevice.listen(
      fake.device,
      () => StatusBar.configure({ hidden: true })
    )
    assert.deepStrictEqual(fake.calls, [["setStyle", "light-content"], [
      "setHidden",
      true
    ]])
    await inner.close()
    assert.deepStrictEqual(fake.calls.at(-1), ["setHidden", false])
    await outer.close()
    assert.deepStrictEqual(fake.calls.at(-1), ["setStyle", "default"])
  })

  it("restores what the setters set once no configure runs", async () => {
    const fake = setup("android")
    await FakeDevice.run(fake.device, StatusBar.setStyle("dark-content"))
    const screen = await FakeDevice.listen(
      fake.device,
      () => StatusBar.configure({ style: "default" })
    )
    assert.deepStrictEqual(fake.calls.at(-1), ["setStyle", "default"])
    await FakeDevice.run(fake.device, StatusBar.setStyle("light-content"))
    assert.deepStrictEqual(fake.calls.at(-1), ["setStyle", "default"])
    const count = fake.calls.length
    await screen.close()
    assert.deepStrictEqual(fake.calls.slice(count), [[
      "setStyle",
      "light-content"
    ]])
  })

  it("reaches native from a setter that sets the default", async () => {
    const fake = setup("android")
    await FakeDevice.run(fake.device, StatusBar.setStyle("default"))
    assert.deepStrictEqual(fake.calls, [["setStyle", "default"]])
  })
})
