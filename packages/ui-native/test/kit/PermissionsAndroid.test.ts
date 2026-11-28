import * as PermissionsAndroid from "@effect/ui-native/kit/PermissionsAndroid"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"

const camera = "android.permission.CAMERA"

const setup = (rationale: boolean) => {
  const permissions = FakeDevice.module({
    checkPermission: () => Promise.resolve(true),
    shouldShowRequestPermissionRationale: () => Promise.resolve(rationale),
    requestPermission: () => Promise.resolve("granted"),
    requestMultiplePermissions: (list: ReadonlyArray<string>) =>
      Promise.resolve(
        Object.fromEntries(list.map((p) => [p, "never_ask_again"]))
      )
  })
  const dialogs = FakeDevice.module({
    showAlert: (_options, _onError, onAction) => onAction("buttonClicked", -1)
  })
  const fake = FakeDevice.make("android", {
    PermissionsAndroid: permissions.module,
    DialogManagerAndroid: dialogs.module
  })
  return { ...fake, permissions: permissions.calls, dialogs: dialogs.calls }
}

const rationale = {
  title: "Camera",
  message: "To scan codes",
  buttonPositive: "OK"
}

describe("PermissionsAndroid", () => {
  it("checks, requests single and multiple permissions, and shows rationale only when suggested", async () => {
    const noRationale = setup(false)
    assert.isTrue(
      await FakeDevice.run(noRationale.device, PermissionsAndroid.check(camera))
    )
    assert.strictEqual(
      await FakeDevice.run(
        noRationale.device,
        PermissionsAndroid.request(camera, rationale)
      ),
      "granted"
    )
    assert.deepStrictEqual(noRationale.dialogs, [])
    const statuses = await FakeDevice.run(
      noRationale.device,
      PermissionsAndroid.requestMultiple([
        camera,
        "android.permission.RECORD_AUDIO"
      ])
    )
    const audio: PermissionsAndroid.Status =
      statuses["android.permission.RECORD_AUDIO"]
    assert.strictEqual(audio, "never_ask_again")
    assert.strictEqual(statuses[camera], "never_ask_again")

    const withRationale = setup(true)
    await FakeDevice.run(
      withRationale.device,
      PermissionsAndroid.request(camera, rationale)
    )
    assert.deepStrictEqual(
      withRationale.permissions.map(([method]) => method),
      ["shouldShowRequestPermissionRationale", "requestPermission"]
    )
    assert.deepStrictEqual(withRationale.dialogs[0].slice(0, 2), [
      "showAlert",
      rationale
    ])
  })

  it("denies off Android without calling native", async () => {
    const permissions = FakeDevice.module()
    const ios = FakeDevice.make("ios", {
      PermissionsAndroid: permissions.module
    })
    assert.isFalse(
      await FakeDevice.run(ios.device, PermissionsAndroid.check(camera))
    )
    assert.strictEqual(
      await FakeDevice.run(ios.device, PermissionsAndroid.request(camera)),
      "denied"
    )
    assert.deepStrictEqual(
      await FakeDevice.run(
        ios.device,
        PermissionsAndroid.requestMultiple([camera])
      ),
      { [camera]: "denied" }
    )
    assert.deepStrictEqual(permissions.calls, [])
  })

  it("fails on native rejection and answers Commands with a Result", async () => {
    const fake = FakeDevice.make("android", {
      PermissionsAndroid: FakeDevice.module({
        checkPermission: () => Promise.reject(new Error("No"))
      }).module
    })
    assert.strictEqual(
      (await FakeDevice.run(
        fake.device,
        Effect.flip(PermissionsAndroid.check(camera))
      )).method,
      "checkPermission"
    )
    assert.deepStrictEqual(
      await FakeDevice.run(
        setup(false).device,
        PermissionsAndroid.Request.make({ permission: camera }).effect
      ),
      Result.succeed("granted" as const)
    )
  })
})
