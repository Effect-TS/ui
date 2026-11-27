import { I18nManager } from "@effect/ui-native/kit"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"

describe("I18nManager", () => {
  it("reads native's layout once", async () => {
    const i18n = FakeDevice.module({
      getConstants: () => ({
        isRTL: true,
        doLeftAndRightSwapInRTL: false,
        localeIdentifier: "ar_EG"
      })
    })
    const fake = FakeDevice.make("android", { I18nManager: i18n.module })
    const expected = {
      isRTL: true,
      doLeftAndRightSwapInRTL: false,
      localeIdentifier: "ar_EG"
    }
    assert.deepStrictEqual(
      await FakeDevice.run(fake.device, I18nManager.get),
      expected
    )
    assert.deepStrictEqual(
      await FakeDevice.run(fake.device, I18nManager.get),
      expected
    )
    assert.strictEqual(i18n.calls.length, 1)
  })

  it("lays out left to right off a device", async () => {
    assert.deepStrictEqual(
      await FakeDevice.run(FakeDevice.make("unknown").device, I18nManager.get),
      {
        isRTL: false,
        doLeftAndRightSwapInRTL: true,
        localeIdentifier: undefined
      }
    )
  })

  it("sets the layout for the next launch", async () => {
    const i18n = FakeDevice.module()
    const fake = FakeDevice.make("ios", { I18nManager: i18n.module })
    await FakeDevice.run(fake.device, I18nManager.allowRTL(false))
    await FakeDevice.run(
      fake.device,
      I18nManager.ForceRTL.make({ value: true }).effect
    )
    await FakeDevice.run(fake.device, I18nManager.swapLeftAndRightInRTL(true))
    assert.deepStrictEqual(i18n.calls, [
      ["allowRTL", false],
      ["forceRTL", true],
      ["swapLeftAndRightInRTL", true]
    ])
  })
})
