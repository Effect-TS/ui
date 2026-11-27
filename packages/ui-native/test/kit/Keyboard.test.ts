import { Keyboard } from "@effect/ui-native/kit"
import * as Native from "@effect/ui-native/Native"
import * as Command from "@effect/ui/Command"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"
import * as FakeFabric from "../utils/FakeFabric.ts"

const frame = (screenY: number, height = 300) => ({
  endCoordinates: { screenX: 0, screenY, width: 390, height },
  duration: 250,
  easing: "keyboard"
})

const setup = (os: string) => {
  const observer = FakeDevice.module()
  const deviceInfo = FakeDevice.module({
    getConstants: () => ({
      Dimensions: {
        window: { width: 390, height: 844, scale: 3, fontScale: 1 }
      }
    })
  })
  const fake = FakeDevice.make(os, {
    KeyboardObserver: observer.module,
    DeviceInfo: deviceInfo.module
  })
  return { ...fake, calls: observer.calls }
}

describe("Keyboard", () => {
  it("sends iOS's frame as the keyboard starts to move, and again only when it differs", async () => {
    const fake = setup("ios")
    const listener = await FakeDevice.listen(
      fake.device,
      (got) =>
        Keyboard.onChange((k) => got(k === undefined ? "hidden" : k.screenY))
    )
    await listener.settle()
    assert.includeDeepMembers(fake.calls, [
      ["addListener", "keyboardWillShow"],
      ["addListener", "keyboardDidHide"]
    ])
    fake.emit("keyboardWillShow", frame(544))
    fake.emit("keyboardDidShow", frame(544))
    fake.emit("keyboardWillChangeFrame", frame(500, 344))
    // Dismissed interactively: the frame moves off the screen.
    fake.emit("keyboardWillChangeFrame", frame(844))
    fake.emit("keyboardWillHide", frame(844))
    await listener.settle()
    assert.deepStrictEqual(listener.values(), ["hidden", 544, 500, "hidden"])
    assert.deepStrictEqual(
      await FakeDevice.run(fake.device, Keyboard.get),
      undefined
    )
    await listener.close()
  })

  it("reads Android's frame once the keyboard has moved", async () => {
    const fake = setup("android")
    fake.emit("keyboardDidShow", {
      endCoordinates: { screenX: 0, screenY: 500, width: 390, height: 344 }
    })
    assert.isUndefined(await FakeDevice.run(fake.device, Keyboard.get))
    fake.emit("keyboardDidShow", {
      endCoordinates: { screenX: 0, screenY: 500, width: 390, height: 344 }
    })
    assert.deepStrictEqual(await FakeDevice.run(fake.device, Keyboard.get), {
      screenX: 0,
      screenY: 500,
      width: 390,
      height: 344,
      duration: 0,
      easing: "keyboard"
    })
    // Android sends its events without counting listeners.
    assert.deepStrictEqual(fake.calls, [])
  })

  it("dismisses from a Command, which runs on the app's device", async () => {
    const fake = setup("ios")
    const Message = UiSchema.TaggedEnum({ Done: {} })
    const Form = Native.component({
      name: "Form",
      model: Schema.Struct({}),
      message: Message
    }).make({
      init: () => ({}),
      update: {
        Done: ($) => $.run(Keyboard.Dismiss.make().pipe(Command.asNoop))
      },
      view: (h) => h.text.children("form")
    })
    const mounted = await FakeFabric.mount((root) =>
      Effect.provideService(
        Renderer.mount(Form, {}, root),
        Native.Device,
        fake.device
      )
    )
    mounted.root.send(Message.Done())
    await mounted.settle()
    await new Promise((r) => setTimeout(r, 10))
    assert.strictEqual(fake.state.blurs, 1)
    await mounted.close()
  })
})
