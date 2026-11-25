import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { HexColorPicker, QrDesigner } from "./QrDesigner.ts"

describe("QrDesigner", () => {
  it.effect("the color picker edits the chosen color of the QR code", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(QrDesigner, {})
      const picker = Locator.tag("hex-color-picker")
      const qrCode = Locator.tag("sl-qr-code")

      scene
        .fireElement(HexColorPicker, picker, "color-changed", {
          value: "#1d4ed8"
        })
        .click("Background")
        .fireElement(HexColorPicker, picker, "color-changed", {
          value: "#fef3c7"
        })
        .type(HtmlLocator.label("Text"), "hello")

      assert.deepStrictEqual(scene.get(qrCode).props, {
        value: "hello",
        label: "QR code for hello",
        size: 256,
        fill: "#1d4ed8",
        background: "#fef3c7",
        radius: 0
      })
      assert.strictEqual(scene.get(picker).props?.color, "#fef3c7")
    }))
})
