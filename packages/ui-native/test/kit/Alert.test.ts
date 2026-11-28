import * as Alert from "@effect/ui-native/kit/Alert"
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
  it("maps Android buttons, defaults to OK, and handles dismissal and errors", async () => {
    const fake = android((_, onAction) => onAction("buttonClicked", -2))
    assert.strictEqual(
      await FakeDevice.run(
        fake.device,
        Alert.alert({
          title: "Delete?",
          buttons: [{ id: "x", text: "X" }, ...buttons]
        })
      ),
      "cancel"
    )
    assert.deepStrictEqual(fake.calls[1].slice(0, 2), ["showAlert", {
      title: "Delete?",
      message: "",
      cancelable: false,
      buttonPositive: "Delete",
      buttonNegative: "Cancel",
      buttonNeutral: "Later"
    }])

    assert.strictEqual(
      await FakeDevice.run(
        android((_, onAction) => onAction("buttonClicked", -1)).device,
        Alert.alert({ title: "Hi" })
      ),
      "ok"
    )
    assert.isUndefined(
      await FakeDevice.run(
        android((_, onAction) => onAction("dismissed")).device,
        Alert.alert({ title: "Hi", cancelable: true })
      )
    )
    const error = await FakeDevice.run(
      android((onError) => onError("No activity")).device,
      Effect.flip(Alert.alert({ title: "Hi" }))
    )
    assert.strictEqual(error.module, "DialogManagerAndroid")
  })

  it("presents iOS alerts and prompts, defaulting empty buttons and answering Commands", async () => {
    const styled = ios("2")
    assert.strictEqual(
      await FakeDevice.run(
        styled.device,
        Alert.alert({ title: "Delete?", message: "For good", buttons })
      ),
      "delete"
    )
    assert.deepInclude(styled.calls[0][1] as object, {
      title: "Delete?",
      message: "For good",
      buttons: [{ 0: "Later" }, { 1: "Cancel" }, { 2: "Delete" }],
      cancelButtonKey: "1",
      destructiveButtonKey: "2",
      preferredButtonKey: "2"
    })

    const empty = ios("0", "hello")
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
        Alert.prompt({ title: "Name", buttons: [] })
      ),
      { id: "ok", text: "hello" }
    )
    assert.deepStrictEqual(
      empty.calls.map(([, args]) => (args as any).buttons),
      [[{ 0: "OK" }], [{ 0: "OK" }]]
    )
    assert.deepStrictEqual(
      await FakeDevice.run(
        ios("0", { login: "me", password: "pw" }).device,
        Alert.prompt({ title: "Sign in", type: "login-password" })
      ),
      { id: "ok", text: "pw", login: "me" }
    )

    assert.deepStrictEqual(
      await FakeDevice.run(
        ios("0").device,
        Alert.Alert.make({ title: "Hi" }).effect
      ),
      Result.succeed("ok")
    )
    assert.isTrue(
      Result.isFailure(
        await FakeDevice.run(
          android(() => {}).device,
          Alert.Prompt.make({ title: "Name" }).effect
        )
      )
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
})
