import * as I18nManager from "@effect/ui-native/kit/I18nManager"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"

describe("I18nManager", () => {
  it("reads layout constants, defaults to LTR off a device, and updates layout flags", async () => {
    const i18n = FakeDevice.module({
      getConstants: () => ({
        isRTL: true,
        doLeftAndRightSwapInRTL: false,
        localeIdentifier: "ar_EG"
      })
    })
    const fake = FakeDevice.make("android", { I18nManager: i18n.module })
    assert.deepStrictEqual(
      await FakeDevice.run(fake.device, I18nManager.get),
      {
        isRTL: true,
        doLeftAndRightSwapInRTL: false,
        localeIdentifier: "ar_EG"
      }
    )
    assert.deepStrictEqual(
      await FakeDevice.run(FakeDevice.make("unknown").device, I18nManager.get),
      {
        isRTL: false,
        doLeftAndRightSwapInRTL: true,
        localeIdentifier: undefined
      }
    )

    const writer = FakeDevice.module()
    const ios = FakeDevice.make("ios", { I18nManager: writer.module })
    await FakeDevice.run(ios.device, I18nManager.allowRTL(false))
    await FakeDevice.run(
      ios.device,
      I18nManager.ForceRTL.make({ value: true }).effect
    )
    await FakeDevice.run(ios.device, I18nManager.swapLeftAndRightInRTL(true))
    assert.deepStrictEqual(writer.calls, [
      ["allowRTL", false],
      ["forceRTL", true],
      ["swapLeftAndRightInRTL", true]
    ])
  })
})
