import type { Native } from "@effect/ui-native"
import { Css } from "@effect/ui-native/kit"
import { describe, expect, it } from "tstyche"

declare const h: Native.H<never>

describe("Native.Element", () => {
  it("checks the value of a known prop and takes any value for others", () => {
    expect(h.view.prop).type.toBeCallableWith("role", "button")
    expect(h.view.prop).type.not.toBeCallableWith("role", "pushbutton")
    expect(h.view.prop).type.not.toBeCallableWith("accessible", "yes")
    expect(h.text.prop).type.toBeCallableWith("numberOfLines", 2)
    expect(h.text.prop).type.not.toBeCallableWith("numberOfLines", "2")
    expect(h.input.prop).type.toBeCallableWith("placeholderTextColor", "#999")
    expect(h.view.prop).type.toBeCallableWith(
      "keyboardShouldPersistTaps",
      "handled"
    )
  })

  it("takes only processed colours inside style values", () => {
    expect(h.view.style).type.not.toBeCallableWith({
      boxShadow: [{ offsetX: 0, offsetY: 2, color: "red" }]
    })
    expect(h.view.style).type.toBeCallableWith({
      boxShadow: [{ offsetX: 0, offsetY: 2, color: Css.color("red") }]
    })
    expect(h.view.style).type.not.toBeCallableWith({
      backgroundColor: Css.color("red")
    })
    expect(h.view.style).type.not.toBeCallableWith({
      transform: "rotate(45deg)"
    })
    expect(h.view.style).type.toBeCallableWith({
      transform: Css.transform("rotate(45deg)")
    })
  })
})
