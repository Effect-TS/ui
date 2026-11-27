import { AccessibilityInfo } from "@effect/ui-native/kit"
import * as Native from "@effect/ui-native/Native"
import * as Command from "@effect/ui/Command"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"
import * as FakeFabric from "../utils/FakeFabric.ts"

describe("AccessibilityInfo", () => {
  it("reads a setting from each platform's module", async () => {
    const info = FakeDevice.module({
      isTouchExplorationEnabled: (ok) => ok(true)
    }, { isTouchExplorationEnabled: 1 })
    const manager = FakeDevice.module({
      getCurrentReduceMotionState: (ok) => ok(true)
    }, { getCurrentReduceMotionState: 2 })
    const android = FakeDevice.make("android", {
      AccessibilityInfo: info.module
    })
    const ios = FakeDevice.make("ios", { AccessibilityManager: manager.module })
    assert.isTrue(
      await FakeDevice.run(
        android.device,
        AccessibilityInfo.isEnabled("screenReader")
      )
    )
    assert.isTrue(
      await FakeDevice.run(
        ios.device,
        AccessibilityInfo.isEnabled("reduceMotion")
      )
    )
  })

  it("answers false for a setting the platform lacks, or without the module", async () => {
    const info = FakeDevice.module()
    const android = FakeDevice.make("android", {
      AccessibilityInfo: info.module
    })
    assert.isFalse(
      await FakeDevice.run(
        android.device,
        AccessibilityInfo.isEnabled("boldText")
      )
    )
    assert.deepStrictEqual(info.calls, [])
    const nothing = FakeDevice.make("unknown")
    assert.isFalse(
      await FakeDevice.run(
        nothing.device,
        AccessibilityInfo.isEnabled("grayscale")
      )
    )
    const failing = FakeDevice.make("ios", {
      AccessibilityManager:
        FakeDevice.module({ getCurrentGrayscaleState: (_ok, fail) => fail({}) })
          .module
    })
    assert.isFalse(
      await FakeDevice.run(
        failing.device,
        AccessibilityInfo.isEnabled("grayscale")
      )
    )
  })

  it("sends the setting once read, then each change", async () => {
    let answer: (enabled: boolean) => void = () => {}
    const manager = FakeDevice.module({
      getCurrentVoiceOverState: (ok) => (answer = ok)
    })
    const fake = FakeDevice.make("ios", {
      AccessibilityManager: manager.module
    })
    const listener = await FakeDevice.listen(
      fake.device,
      (got) => AccessibilityInfo.onChange("screenReader", got)
    )
    answer(true)
    fake.emit("screenReaderChanged", false)
    await listener.settle()
    assert.deepStrictEqual(listener.values(), [true, false])
    await listener.close()
    assert.strictEqual(fake.listening("screenReaderChanged"), 0)
  })

  it("ignores an answer that comes after a change", async () => {
    let answer: (enabled: boolean) => void = () => {}
    const info = FakeDevice.module({
      isReduceMotionEnabled: (ok) => (answer = ok)
    })
    const fake = FakeDevice.make("android", { AccessibilityInfo: info.module })
    const listener = await FakeDevice.listen(
      fake.device,
      (got) => AccessibilityInfo.onChange("reduceMotion", got)
    )
    fake.emit("reduceMotionDidChange", true)
    answer(false)
    await listener.settle()
    assert.deepStrictEqual(listener.values(), [true])
    await listener.close()
  })

  it("announces, with iOS's options when given", async () => {
    const manager = FakeDevice.module()
    const fake = FakeDevice.make("ios", {
      AccessibilityManager: manager.module
    })
    await FakeDevice.run(fake.device, AccessibilityInfo.announce("Saved"))
    await FakeDevice.run(
      fake.device,
      AccessibilityInfo.Announce.make({
        announcement: "Sent",
        options: { queue: true }
      }).effect
    )
    assert.deepStrictEqual(manager.calls, [
      ["announceForAccessibility", "Saved"],
      ["announceForAccessibilityWithOptions", "Sent", { queue: true }]
    ])
  })

  it("reports finished announcements on iOS", async () => {
    const fake = FakeDevice.make("ios", {
      AccessibilityManager: FakeDevice.module().module
    })
    const listener = await FakeDevice.listen(
      fake.device,
      (got) => AccessibilityInfo.onAnnouncementFinished(got)
    )
    fake.emit("announcementFinished", { announcement: "Saved", success: true })
    await listener.settle()
    assert.deepStrictEqual(listener.values(), [{
      announcement: "Saved",
      success: true
    }])
    await listener.close()
  })

  it("asks Android for a timeout, and keeps it elsewhere", async () => {
    const info = FakeDevice.module({
      getRecommendedTimeoutMillis: (ms, ok) => ok(ms * 2)
    })
    const android = FakeDevice.make("android", {
      AccessibilityInfo: info.module
    })
    assert.strictEqual(
      await FakeDevice.run(
        android.device,
        AccessibilityInfo.recommendedTimeout(3000)
      ),
      6000
    )
    const ios = FakeDevice.make("ios", {
      AccessibilityManager: FakeDevice.module().module
    })
    assert.strictEqual(
      await FakeDevice.run(
        ios.device,
        AccessibilityInfo.recommendedTimeout(3000)
      ),
      3000
    )
  })

  it("moves the screen reader's focus to a view", async () => {
    const Title = Native.ref("Title")
    const Message = UiSchema.TaggedEnum({
      Opened: {},
      Focused: { found: Schema.Boolean }
    })
    const Screen = Native.component({
      name: "Screen",
      model: Schema.Struct({ found: Schema.NullOr(Schema.Boolean) }),
      message: Message
    }).make({
      init: () => ({ found: null }),
      update: {
        Opened: ($) =>
          $.run(
            AccessibilityInfo.Focus.make({ ref: Title }).pipe(
              Command.map((found) => Message.Focused({ found }))
            )
          ),
        Focused: ($, { found }) => $.set({ found })
      },
      view: (h) => h.text.ref(Title).children("Settings")
    })
    const mounted = await FakeFabric.mount((root) =>
      Renderer.mount(Screen, {}, root)
    )
    mounted.root.send(Message.Opened())
    for (let i = 0; i < 3; i++) await mounted.settle()
    const title = mounted.find(FakeFabric.byName("RCTText"))
    assert.deepStrictEqual(mounted.fabric.accessibilityEvents, [[
      title.tag,
      "focus"
    ]])
    assert.isTrue(mounted.root.model()?.found)
    await mounted.close()
  })
})
