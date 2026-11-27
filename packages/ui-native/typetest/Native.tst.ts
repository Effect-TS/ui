import { Native } from "@effect/ui-native"
import { describe, expect, it } from "tstyche"

describe("Native.Element.prop", () => {
  it("checks the props an element lists and takes any other name", () => {
    const input = Native.tags.input as Native.InputElement<never>
    expect(input.prop).type.toBeCallableWith("multiline", true)
    expect(input.prop).type.toBeCallableWith(
      "keyboardType",
      "ascii-capable-number-pad"
    )
    expect(input.prop).type.not.toBeCallableWith("multiline", 123)
    expect(input.prop).type.toBeCallableWith("customNativeProp", 123)
  })
})
