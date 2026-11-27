import { Alert } from "@effect/ui-native/kit"
import type * as Native from "@effect/ui-native/Native"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import { assert, describe, expectTypeOf, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"

const androidConstants = {
  buttonClicked: "buttonClicked",
  dismissed: "dismissed",
  buttonPositive: -1,
  buttonNegative: -2,
  buttonNeutral: -3
}

const android = (answer: (onError: any, onAction: any) => void) => {
  const dialogs = FakeDevice.module({
    getConstants: () => androidConstants,
    showAlert: (_config, onError, onAction) => answer(onError, onAction)
  })
  const fake = FakeDevice.make("android", {
    DialogManagerAndroid: dialogs.module
  })
  return { ...fake, calls: dialogs.calls }
}

const ios = (index: string, value?: unknown) => {
  const alerts = FakeDevice.module({
    alertWithArgs: (_args, callback) => callback(index, value)
  })
  const fake = FakeDevice.make("ios", { AlertManager: alerts.module })
  return { ...fake, calls: alerts.calls }
}

const buttons = [
  { id: "later", text: "Later" },
  { id: "cancel", text: "Cancel", style: "cancel" },
  { id: "delete", text: "Delete", style: "destructive", preferred: true }
] as const

describe("Alert", () => {
  it("maps Android's last three buttons to positive, negative and neutral", async () => {
    const fake = android((_, onAction) => onAction("buttonClicked", -2))
    const pressed = await FakeDevice.run(
      fake.device,
      Alert.alert({
        title: "Delete?",
        buttons: [{ id: "x", text: "X" }, ...buttons]
      })
    )
    assert.strictEqual(pressed, "cancel")
    assert.deepStrictEqual(fake.calls[1].slice(0, 2), ["showAlert", {
      title: "Delete?",
      message: "",
      cancelable: false,
      buttonPositive: "Delete",
      buttonNegative: "Cancel",
      buttonNeutral: "Later"
    }])
  })

  it("succeeds with undefined when Android's dialog is dismissed, and fails on its error", async () => {
    const dismissed = android((_, onAction) => onAction("dismissed"))
    assert.isUndefined(
      await FakeDevice.run(
        dismissed.device,
        Alert.alert({ title: "Hi", cancelable: true })
      )
    )
    const failed = android((onError) => onError("No activity"))
    const error = await FakeDevice.run(
      failed.device,
      Effect.flip(Alert.alert({ title: "Hi" }))
    )
    assert.strictEqual(error.module, "DialogManagerAndroid")
  })

  it("defaults to one OK button", async () => {
    const fake = android((_, onAction) => onAction("buttonClicked", -1))
    const pressed: "ok" | undefined = await FakeDevice.run(
      fake.device,
      Alert.alert({ title: "Hi" })
    )
    assert.strictEqual(pressed, "ok")
    const empty = ios("0", "hi")
    assert.strictEqual(
      await FakeDevice.run(
        empty.device,
        Alert.alert({ title: "Hi", buttons: [] })
      ),
      "ok"
    )
    assert.deepStrictEqual(
      await FakeDevice.run(
        empty.device,
        Alert.prompt({ title: "Hi", buttons: [] })
      ),
      { id: "ok", text: "hi" }
    )
    assert.deepStrictEqual(
      empty.calls.map(([, args]) => (args as any).buttons),
      [[{ 0: "OK" }], [{ 0: "OK" }]]
    )
  })

  it("types the id as the buttons', with \"ok\" unless one is required", () => {
    type Delete = Alert.Button<"delete">
    const one: readonly [Delete] = [{ id: "delete", text: "Delete" }]
    const some: Array<Delete> = []
    const optional: Alert.PromptOptions<readonly [Delete]> = { title: "Hi" }
    const success = <A>(_: Effect.Effect<A, Native.DeviceError>) =>
      expectTypeOf<A>()
    // Typed only, never run.
    const types = () => {
      success(Alert.alert({ title: "Hi" })).toEqualTypeOf<"ok" | undefined>()
      success(Alert.alert({ title: "Hi", buttons: one })).toEqualTypeOf<
        "delete" | undefined
      >()
      success(
        Alert.alert({ title: "Hi", buttons: [{ id: "yes", text: "Yes" }] })
      )
        .toEqualTypeOf<"yes" | undefined>()
      success(Alert.alert({ title: "Hi", buttons: some })).toEqualTypeOf<
        "delete" | "ok" | undefined
      >()
      success(Alert.prompt({ title: "Hi" })).toEqualTypeOf<
        Alert.Prompted<"ok">
      >()
      success(Alert.prompt({ title: "Hi", buttons: one })).toEqualTypeOf<
        Alert.Prompted<"delete">
      >()
      success(Alert.prompt(optional)).toEqualTypeOf<
        Alert.Prompted<"delete" | "ok">
      >()
    }
    assert.isFunction(types)
  })

  it("passes iOS the buttons by index, with their styles", async () => {
    const fake = ios("2")
    const pressed = await FakeDevice.run(
      fake.device,
      Alert.alert({ title: "Delete?", message: "For good", buttons })
    )
    assert.strictEqual(pressed, "delete")
    const [method, args] = fake.calls[0]
    assert.strictEqual(method, "alertWithArgs")
    assert.deepInclude(args as object, {
      title: "Delete?",
      message: "For good",
      buttons: [{ 0: "Later" }, { 1: "Cancel" }, { 2: "Delete" }],
      cancelButtonKey: "1",
      destructiveButtonKey: "2",
      preferredButtonKey: "2"
    })
  })

  it("prompts on iOS with the text entered", async () => {
    const plain = ios("0", "hello")
    assert.deepStrictEqual(
      await FakeDevice.run(plain.device, Alert.prompt({ title: "Name" })),
      { id: "ok", text: "hello" }
    )
    assert.strictEqual((plain.calls[0][1] as any).type, "plain-text")
    const login = ios("0", { login: "me", password: "pw" })
    assert.deepStrictEqual(
      await FakeDevice.run(
        login.device,
        Alert.prompt({ title: "Sign in", type: "login-password" })
      ),
      { id: "ok", text: "pw", login: "me" }
    )
  })

  it("fails to prompt off iOS, and answers its Command with a Result", async () => {
    const fake = android(() => {})
    const prompted = await FakeDevice.run(
      fake.device,
      Alert.Prompt.make({ title: "Name" }).effect
    )
    assert.isTrue(Result.isFailure(prompted))
    const alerted = await FakeDevice.run(
      ios("0").device,
      Alert.Alert.make({ title: "Hi" }).effect
    )
    assert.deepStrictEqual(alerted, Result.succeed("ok"))
  })
})
