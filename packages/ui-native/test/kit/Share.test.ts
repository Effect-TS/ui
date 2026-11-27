import { Share } from "@effect/ui-native/kit"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"

describe("Share", () => {
  it("shares text on Android, with the URL after the message", async () => {
    const module = FakeDevice.module({
      share: () => Promise.resolve({ action: "sharedAction" })
    })
    const fake = FakeDevice.make("android", { ShareModule: module.module })
    const shared = await FakeDevice.run(
      fake.device,
      Share.share({
        message: "Effect",
        url: "https://effect.website",
        title: "Hi",
        dialogTitle: "Share"
      })
    )
    assert.deepStrictEqual(shared, {
      action: "shared",
      activityType: undefined
    })
    assert.deepStrictEqual(module.calls, [[
      "share",
      { title: "Hi", message: "Effect https://effect.website" },
      "Share"
    ]])
  })

  it("passes iOS the message, URL and processed tint, and reports the activity", async () => {
    const sheets = FakeDevice.module({
      showShareActionSheetWithOptions: (_options, _onError, onDone) =>
        onDone(true, "com.apple.UIKit.activity.Mail")
    })
    const fake = FakeDevice.make("ios", { ActionSheetManager: sheets.module })
    const shared = await FakeDevice.run(
      fake.device,
      Share.share({
        url: "https://effect.website",
        subject: "Look",
        tintColor: "red"
      })
    )
    assert.deepStrictEqual(shared, {
      action: "shared",
      activityType: "com.apple.UIKit.activity.Mail"
    })
    assert.deepInclude(sheets.calls[0][1] as object, {
      url: "https://effect.website",
      subject: "Look",
      tintColor: { processed: "red" }
    })
  })

  it("reports a dismissed sheet, and fails on iOS's error", async () => {
    const dismissed = FakeDevice.make("ios", {
      ActionSheetManager: FakeDevice.module({
        showShareActionSheetWithOptions: (_options, _onError, onDone) =>
          onDone(false, null)
      }).module
    })
    assert.deepStrictEqual(
      await FakeDevice.run(dismissed.device, Share.share({ message: "Hi" })),
      { action: "dismissed" }
    )
    const failed = FakeDevice.make("ios", {
      ActionSheetManager: FakeDevice.module({
        showShareActionSheetWithOptions: (_options, onError) =>
          onError({ message: "No" })
      }).module
    })
    const error = await FakeDevice.run(
      failed.device,
      Effect.flip(Share.share({ message: "Hi" }))
    )
    assert.strictEqual(error.method, "showShareActionSheetWithOptions")
  })

  it("answers its Command with a Result, failing without the module", async () => {
    const fake = FakeDevice.make("android")
    const shared = await FakeDevice.run(
      fake.device,
      Share.Share.make({ message: "Hi" }).effect
    )
    assert.isTrue(Result.isFailure(shared))
  })
})
