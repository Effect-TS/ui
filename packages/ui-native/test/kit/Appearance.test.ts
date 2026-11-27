import * as Appearance from "@effect/ui-native/kit/Appearance"
import * as Effect from "effect/Effect"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"

describe("Appearance", () => {
  it("tracks scheme changes and overrides with iOS listener counting, defaulting to light off a device", async () => {
    let scheme = "dark"
    const appearance = FakeDevice.module({
      getColorScheme: () => scheme,
      setColorScheme: (next) => {
        if (next !== "auto") scheme = next
      }
    })
    const fake = FakeDevice.make("ios", { Appearance: appearance.module })
    const listener = await FakeDevice.listen(
      fake.device,
      (got) => Appearance.onChange(got)
    )
    await listener.settle()
    assert.deepStrictEqual(
      appearance.calls.filter(([m]) => m === "addListener"),
      [["addListener", "appearanceChanged"]]
    )
    fake.emit("appearanceChanged", { colorScheme: "light" })
    await FakeDevice.run(
      fake.device,
      Effect.andThen(
        Appearance.setColorScheme("dark"),
        Appearance.setColorScheme("auto")
      )
    )
    await listener.settle()
    assert.deepStrictEqual(listener.values(), ["dark", "light", "dark"])
    assert.deepStrictEqual(
      appearance.calls.filter(([m]) => m === "setColorScheme"),
      [["setColorScheme", "dark"], ["setColorScheme", "auto"]]
    )
    await listener.close()
    assert.strictEqual(
      await FakeDevice.run(FakeDevice.make("unknown").device, Appearance.get),
      "light"
    )
  })
})
