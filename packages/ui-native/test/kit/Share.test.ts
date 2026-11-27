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

  it("passes iOS the message, URL and processed tint number, and reports the activity", async () => {
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
      tintColor: 0xffff0000
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

  it("fails without a message or URL, or with an unknown tint, before calling iOS", async () => {
    const sheets = FakeDevice.module()
    const fake = FakeDevice.make("ios", { ActionSheetManager: sheets.module })
    // @ts-expect-error A message or a URL is required.
    const empty: Share.Options = { subject: "Hi" }
    const error = await FakeDevice.run(
      fake.device,
      Effect.flip(Share.share(empty))
    )
    assert.strictEqual(error.module, "ActionSheetManager")
    const command = await FakeDevice.run(
      fake.device,
      Share.Share.make({ subject: "Hi" } as any).effect
    )
    assert.isTrue(Result.isFailure(command))
    assert.deepStrictEqual(sheets.calls, [])
  })

  it("leaves out a tint React Native can't process", async () => {
    const sheets = FakeDevice.module({
      showShareActionSheetWithOptions: (_options, _onError, onDone) =>
        onDone(false, null)
    })
    const fake = FakeDevice.make("ios", { ActionSheetManager: sheets.module })
    await FakeDevice.run(
      fake.device,
      Share.share({ message: "Hi", tintColor: "nope" })
    )
    assert.isUndefined((sheets.calls[0][1] as any).tintColor)
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
