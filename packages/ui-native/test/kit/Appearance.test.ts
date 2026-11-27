import { Appearance } from "@effect/ui-native/kit"
import * as Effect from "effect/Effect"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"

const setup = () => {
  let scheme = "dark"
  const appearance = FakeDevice.module({
    getColorScheme: () => scheme,
    setColorScheme: (next) => {
      if (next !== "auto") scheme = next
    }
  })
  const fake = FakeDevice.make("ios", { Appearance: appearance.module })
  return { ...fake, calls: appearance.calls }
}

describe("Appearance", () => {
  it("sends the scheme when it starts, then each change, while iOS counts its listener", async () => {
    const fake = setup()
    const listener = await FakeDevice.listen(
      fake.device,
      (got) => Appearance.onChange(got)
    )
    await listener.settle()
    assert.deepStrictEqual(fake.calls.filter(([m]) => m === "addListener"), [[
      "addListener",
      "appearanceChanged"
    ]])
    fake.emit("appearanceChanged", { colorScheme: "light" })
    await listener.settle()
    assert.deepStrictEqual(listener.values(), ["dark", "light"])
    await listener.close()
  })

  it("overrides the scheme and tells listeners", async () => {
    const fake = setup()
    const listener = await FakeDevice.listen(
      fake.device,
      (got) => Appearance.onChange(got)
    )
    await listener.settle()
    await FakeDevice.run(
      fake.device,
      Effect.andThen(
        Appearance.setColorScheme("light"),
        Appearance.setColorScheme("auto")
      )
    )
    await listener.settle()
    assert.deepStrictEqual(listener.values(), ["dark", "light"])
    assert.deepStrictEqual(fake.calls.filter(([m]) => m === "setColorScheme"), [
      ["setColorScheme", "light"],
      ["setColorScheme", "auto"]
    ])
    await listener.close()
  })

  it("is light off a device", async () => {
    assert.strictEqual(
      await FakeDevice.run(FakeDevice.make("unknown").device, Appearance.get),
      "light"
    )
  })
})
