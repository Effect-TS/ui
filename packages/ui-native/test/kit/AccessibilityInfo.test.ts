import * as AccessibilityInfo from "@effect/ui-native/kit/AccessibilityInfo"
import * as Native from "@effect/ui-native/Native"
import * as Command from "@effect/ui/Command"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"
import * as FakeFabric from "../utils/FakeFabric.ts"

describe("AccessibilityInfo", () => {
  it("reads settings per platform, falling back to false when unsupported or unavailable", async () => {
    const info = FakeDevice.module({
      isTouchExplorationEnabled: (ok) => ok(true)
    }, { isTouchExplorationEnabled: 1 })
    const manager = FakeDevice.module({
      getCurrentReduceMotionState: (ok) => ok(true),
      getCurrentGrayscaleState: (_ok, fail) => fail({})
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
    assert.isFalse(
      await FakeDevice.run(
        android.device,
        AccessibilityInfo.isEnabled("boldText")
      )
    )
    assert.isTrue(
      await FakeDevice.run(
        ios.device,
        AccessibilityInfo.isEnabled("reduceMotion")
      )
    )
    assert.isFalse(
      await FakeDevice.run(ios.device, AccessibilityInfo.isEnabled("grayscale"))
    )
    assert.isFalse(
      await FakeDevice.run(
        FakeDevice.make("unknown").device,
        AccessibilityInfo.isEnabled("grayscale")
      )
    )
  })

  it("sends the setting once read, ignores stale answers, and cleans up", async () => {
    let iosAnswer: (enabled: boolean) => void = () => {}
    const ios = FakeDevice.make("ios", {
      AccessibilityManager: FakeDevice.module({
        getCurrentVoiceOverState: (ok) => (iosAnswer = ok)
      }).module
    })
    const iosListener = await FakeDevice.listen(
      ios.device,
      (got) => AccessibilityInfo.onChange("screenReader", got)
    )
    iosAnswer(true)
    ios.emit("screenReaderChanged", false)
    await iosListener.settle()
    assert.deepStrictEqual(iosListener.values(), [true, false])
    await iosListener.close()
    assert.strictEqual(ios.listening("screenReaderChanged"), 0)

    let androidAnswer: (enabled: boolean) => void = () => {}
    const android = FakeDevice.make("android", {
      AccessibilityInfo: FakeDevice.module({
        isReduceMotionEnabled: (ok) => (androidAnswer = ok)
      }).module
    })
    const androidListener = await FakeDevice.listen(
      android.device,
      (got) => AccessibilityInfo.onChange("reduceMotion", got)
    )
    android.emit("reduceMotionDidChange", true)
    androidAnswer(false)
    await androidListener.settle()
    assert.deepStrictEqual(androidListener.values(), [true])
    await androidListener.close()
  })

  it("announces, reports finished announcements on iOS, and queries Android timeout", async () => {
    const manager = FakeDevice.module()
    const ios = FakeDevice.make("ios", { AccessibilityManager: manager.module })
    await FakeDevice.run(ios.device, AccessibilityInfo.announce("Saved"))
    await FakeDevice.run(
      ios.device,
      AccessibilityInfo.Announce.make({
        announcement: "Sent",
        options: { queue: true }
      }).effect
    )
    assert.deepStrictEqual(manager.calls, [
      ["announceForAccessibility", "Saved"],
      ["announceForAccessibilityWithOptions", "Sent", { queue: true }]
    ])

    const finished = await FakeDevice.listen(
      ios.device,
      (got) => AccessibilityInfo.onAnnouncementFinished(got)
    )
    ios.emit("announcementFinished", { announcement: "Saved", success: true })
    await finished.settle()
    assert.deepStrictEqual(finished.values(), [{
      announcement: "Saved",
      success: true
    }])
    await finished.close()

    const android = FakeDevice.make("android", {
      AccessibilityInfo: FakeDevice.module({
        getRecommendedTimeoutMillis: (ms, ok) => ok(ms * 2)
      }).module
    })
    assert.strictEqual(
      await FakeDevice.run(
        android.device,
        AccessibilityInfo.recommendedTimeout(3000)
      ),
      6000
    )
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
