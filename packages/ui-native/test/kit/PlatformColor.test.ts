import * as PlatformColor from "@effect/ui-native/kit/PlatformColor"
import { assert, describe, it } from "vitest"

describe("PlatformColor", () => {
  it("builds semantic and resource_paths with optional fallback", () => {
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
    assert.deepStrictEqual(
      PlatformColor.make({ ios: ["systemBlue"] }) as unknown,
      { semantic: ["systemBlue"], resource_paths: [] }
    )
  })

  it("builds dynamic colours with an Android fallback and requires android when light is native", () => {
    assert.deepStrictEqual(
      PlatformColor.dynamic({ light: "white", dark: "black" }) as unknown,
      {
        dynamic: { light: "white", dark: "black" },
        resource_paths: [],
        fallback: "white"
      }
    )
    assert.strictEqual(
      (PlatformColor.dynamic({ light: 0x00ff0080, dark: "black" }) as any)
        .fallback,
      "#00ff0080"
    )
    const label = PlatformColor.make({ ios: "label" })
    // @ts-expect-error Android can't show a NativeColor as its fallback.
    PlatformColor.dynamic({ light: label, dark: "black" })
    assert.strictEqual(
      (PlatformColor.dynamic({
        light: label,
        dark: "black",
        android: "gray"
      }) as any).fallback,
      "gray"
    )
  })
})
