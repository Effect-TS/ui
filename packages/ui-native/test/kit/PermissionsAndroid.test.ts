import { PermissionsAndroid } from "@effect/ui-native/kit"
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
  it("checks and requests on Android", async () => {
    const fake = setup(false)
    assert.isTrue(
      await FakeDevice.run(fake.device, PermissionsAndroid.check(camera))
    )
    assert.strictEqual(
      await FakeDevice.run(fake.device, PermissionsAndroid.request(camera)),
      "granted"
    )
    assert.deepStrictEqual(fake.permissions, [["checkPermission", camera], [
      "requestPermission",
      camera
    ]])
  })

  it("explains first when Android suggests it", async () => {
    const fake = setup(true)
    await FakeDevice.run(
      fake.device,
      PermissionsAndroid.request(camera, rationale)
    )
    assert.deepStrictEqual(fake.permissions.map(([method]) => method), [
      "shouldShowRequestPermissionRationale",
      "requestPermission"
    ])
    assert.deepStrictEqual(fake.dialogs[0].slice(0, 2), [
      "showAlert",
      rationale
    ])
  })

  it("skips the rationale when Android doesn't suggest it", async () => {
    const fake = setup(false)
    await FakeDevice.run(
      fake.device,
      PermissionsAndroid.request(camera, rationale)
    )
    assert.deepStrictEqual(fake.dialogs, [])
  })

  it("requests several, keeping their types", async () => {
    const fake = setup(false)
    const statuses = await FakeDevice.run(
      fake.device,
      PermissionsAndroid.requestMultiple([
        camera,
        "android.permission.RECORD_AUDIO"
      ])
    )
    const audio: PermissionsAndroid.Status =
      statuses["android.permission.RECORD_AUDIO"]
    assert.strictEqual(audio, "never_ask_again")
    assert.strictEqual(statuses[camera], "never_ask_again")
  })

  it("holds no permission off Android, without calling native", async () => {
    const fake = setup(false)
    const ios = FakeDevice.make("ios", {
      PermissionsAndroid: FakeDevice.module().module
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
    assert.deepStrictEqual(fake.permissions, [])
  })

  it("fails when native rejects, and answers its Commands with a Result", async () => {
    const fake = FakeDevice.make("android", {
      PermissionsAndroid: FakeDevice.module({
        checkPermission: () => Promise.reject(new Error("No"))
      }).module
    })
    const error = await FakeDevice.run(
      fake.device,
      Effect.flip(PermissionsAndroid.check(camera))
    )
    assert.strictEqual(error.method, "checkPermission")
    const requested = await FakeDevice.run(
      setup(false).device,
      PermissionsAndroid.Request.make({ permission: camera }).effect
    )
    assert.deepStrictEqual(requested, Result.succeed("granted"))
  })
})
