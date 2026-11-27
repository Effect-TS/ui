import { PlatformColor } from "@effect/ui-native/kit"
import { assert, describe, it } from "vitest"

describe("PlatformColor", () => {
  it("carries both platforms' names, so each parser finds its own", () => {
    assert.deepStrictEqual(
      PlatformColor.make({
        ios: "label",
        android: ["?attr/a", "?attr/b"],
        fallback: "black"
      }) as unknown,
      {
        semantic: ["label"],
        resource_paths: ["?attr/a", "?attr/b"],
        fallback: "black"
      }
    )
  })

  it("leaves a platform without names empty, so it shows the fallback", () => {
    assert.deepStrictEqual(
      PlatformColor.make({ ios: ["systemBlue"] }) as unknown,
      {
        semantic: ["systemBlue"],
        resource_paths: []
      }
    )
  })

  it("makes an iOS dynamic colour that Android shows as its fallback, light by default", () => {
    assert.deepStrictEqual(
      PlatformColor.dynamic({ light: "white", dark: "black" }) as unknown,
      {
        dynamic: { light: "white", dark: "black" },
        resource_paths: [],
        fallback: "white"
      }
    )
    assert.deepStrictEqual(
      PlatformColor.dynamic({
        light: 0xffffffff,
        dark: "black",
        android: "gray"
      }) as unknown,
      {
        dynamic: { light: 0xffffffff, dark: "black" },
        resource_paths: [],
        fallback: "gray"
      }
    )
    assert.strictEqual(
      (PlatformColor.dynamic({ light: 0x00ff0080, dark: "black" }) as any)
        .fallback,
      "#00ff0080"
    )
  })

  it("asks for Android's colour when light is a native colour", () => {
    const label = PlatformColor.make({ ios: "label" })
    // @ts-expect-error Android can't show a NativeColor as its fallback.
    PlatformColor.dynamic({ light: label, dark: "black" })
    assert.strictEqual(
      (PlatformColor.dynamic({
        light: label,
        dark: "black",
        android: "black"
      }) as any).fallback,
      "black"
    )
  })
})
