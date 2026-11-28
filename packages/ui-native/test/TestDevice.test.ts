import * as AccessibilityInfo from "@effect/ui-native/kit/AccessibilityInfo"
import * as Alert from "@effect/ui-native/kit/Alert"
import * as Appearance from "@effect/ui-native/kit/Appearance"
import * as AppState from "@effect/ui-native/kit/AppState"
import * as BackHandler from "@effect/ui-native/kit/BackHandler"
import * as Dimensions from "@effect/ui-native/kit/Dimensions"
import * as Keyboard from "@effect/ui-native/kit/Keyboard"
import * as Linking from "@effect/ui-native/kit/Linking"
import * as PermissionsAndroid from "@effect/ui-native/kit/PermissionsAndroid"
import * as Share from "@effect/ui-native/kit/Share"
import * as StatusBar from "@effect/ui-native/kit/StatusBar"
import * as Vibration from "@effect/ui-native/kit/Vibration"
import * as Native from "@effect/ui-native/Native"
import { TestDevice } from "@effect/ui-native/testing"
import { Play, TestHost } from "@effect/ui/testing"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { assert, describe, it } from "vitest"

const run = <A, E>(
  platform: TestDevice.Platform,
  test: (device: TestDevice.TestDevice) => Effect.Effect<A, E, any>
) =>
  Effect.runPromise(
    TestDevice.TestDevice.use(test).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(TestHost.layer(), TestDevice.layer(platform)))
    ) as Effect.Effect<A, E>
  )

const open = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.forkChild(effect, { startImmediately: true })

describe("TestDevice", () => {
  describe.each(["android", "ios"] as const)("on %s", (platform) => {
    const android = platform === "android"

    it("reports what the test sets", () =>
      run(platform, (device) =>
        Effect.gen(function*() {
          const size = { width: 390, height: 844, scale: 3, fontScale: 1 }
          assert.deepStrictEqual(yield* Dimensions.get, {
            window: size,
            screen: size
          })
          device.resize({ width: 844, height: 390 }, {
            width: 844,
            height: 400,
            scale: 2
          })
          device.setFontScale(1.5)
          assert.deepStrictEqual(yield* Dimensions.get, {
            window: { width: 844, height: 390, scale: 3, fontScale: 1.5 },
            screen: { width: 844, height: 400, scale: 2, fontScale: 1.5 }
          })

          assert.strictEqual(yield* Appearance.get, "light")
          device.setColorScheme("dark")
          assert.strictEqual(yield* Appearance.get, "dark")
          yield* Appearance.setColorScheme("light")
          device.setColorScheme("dark")
          assert.strictEqual(yield* Appearance.get, "light")
          yield* Appearance.setColorScheme("auto")
          assert.strictEqual(yield* Appearance.get, "dark")

          assert.strictEqual(yield* AppState.get, "active")
          device.setAppState("background")
          assert.strictEqual(yield* AppState.get, "background")

          assert.isUndefined(yield* Keyboard.get)
          device.showKeyboard(300)
          assert.deepStrictEqual(yield* Keyboard.get, {
            screenX: 0,
            screenY: 100,
            width: 844,
            height: 300,
            duration: android ? 0 : 250,
            easing: "keyboard"
          })
          yield* Keyboard.dismiss
          assert.isUndefined(yield* Keyboard.get)

          device.setInitialURL("app://start")
          assert.strictEqual(yield* Linking.initialURL, "app://start")
          device.setOpenable((url) => url.startsWith("https:"))
          assert.isFalse(yield* Linking.canOpenURL("mailto:ada@example.com"))
          const error = yield* Effect.flip(
            Linking.openURL("mailto:ada@example.com")
          )
          assert.strictEqual(error._tag, "DeviceError")

          device.setPermission("android.permission.CAMERA", "granted")
          assert.strictEqual(
            yield* PermissionsAndroid.check("android.permission.CAMERA"),
            android
          )
          assert.deepStrictEqual(
            yield* PermissionsAndroid.requestMultiple([
              "android.permission.CAMERA",
              "android.permission.RECORD_AUDIO"
            ]),
            {
              "android.permission.CAMERA": android ? "granted" : "denied",
              "android.permission.RECORD_AUDIO": "denied"
            }
          )

          device.setAccessibility("reduceMotion", true)
          device.setAccessibility("boldText", true)
          assert.isTrue(yield* AccessibilityInfo.isEnabled("reduceMotion"))
          assert.strictEqual(
            yield* AccessibilityInfo.isEnabled("boldText"),
            !android
          )
        })))

    it("sends events to Subscriptions", () =>
      run(platform, (device) =>
        Effect.gen(function*() {
          const Message = UiSchema.TaggedEnum({ Got: { value: Schema.String } })
          const got = (value: string) => Message.Got({ value })
          const Listener = Native.component({
            name: "Listener",
            model: Schema.Array(Schema.String),
            message: Message
          }).make({
            init: () => [],
            update: { Got: ($, { value }) => [...$.model, value] },
            subscriptions: () => [
              Appearance.onChange(got),
              AppState.onMemoryWarning(got("memory")),
              Linking.onURL(got),
              AccessibilityInfo.onChange("screenReader", (on) =>
                got(`screenReader ${on}`)),
              BackHandler.onPress(got("back"))
            ],
            view: (h) =>
              h.text.children("listening")
          })
          const play = yield* Play.make(Listener, {})
          device.setColorScheme("dark")
          if (android) {
            assert.throws(() => device.memoryWarning(), /no memory warning/)
          } else {
            device.memoryWarning()
          }
          device.receiveURL("app://note/1")
          device.setAccessibility("screenReader", true)
          if (android) device.pressBack()
          yield* TestHost.settle
          assert.deepStrictEqual(play.root.model(), [
            "screenReader false",
            "light",
            "dark",
            ...(android ? [] : ["memory"]),
            "app://note/1",
            "screenReader true",
            ...(android ? ["back"] : [])
          ])
        })))

    it("opens dialogs until answered, and logs what the app asked", () =>
      run(platform, (device) =>
        Effect.gen(function*() {
          const buttons = [
            { id: "later", text: "Later" },
            { id: "cancel", text: "Cancel", style: "cancel" },
            { id: "delete", text: "Delete", style: "destructive" }
          ] as const
          const alert = yield* open(
            Alert.alert({ title: "Delete?", buttons, cancelable: true })
          )
          assert.throws(() => device.answerAlert("Keep"), /no button "Keep"/)
          device.answerAlert("Cancel")
          assert.strictEqual(yield* Fiber.join(alert), "cancel")

          // Buttons with the same text, which only an id tells apart.
          const four = [
            { id: "first", text: "OK" },
            { id: "later", text: "Later" },
            { id: "save", text: "OK" },
            { id: "discard", text: "OK", style: "destructive" }
          ] as const
          const leave = yield* open(
            Alert.alert({ title: "Leave?", buttons: four })
          )
          assert.throws(() => device.answerAlert("OK"), /several "OK" buttons/)
          if (android) {
            assert.throws(
              () => device.answerAlert({ buttons: four, id: "first" }),
              /only the last three buttons/
            )
          }
          device.answerAlert({ buttons: four, id: "discard" })
          assert.strictEqual(yield* Fiber.join(leave), "discard")

          const dismissed = yield* open(
            Alert.alert({ title: "Hi", cancelable: true })
          )
          if (android) {
            // Back goes to the alert, and a new alert dismisses the open one.
            device.pressBack()
            assert.isUndefined(yield* Fiber.join(dismissed))
            const stuck = yield* open(Alert.alert({ title: "Hi" }))
            device.pressBack()
            assert.throws(() => device.dismissAlert(), /isn't cancelable/)
            const next = yield* open(
              Alert.alert({
                title: "Next",
                buttons: [{ id: "next", text: "Next" }]
              })
            )
            assert.isUndefined(yield* Fiber.join(stuck))
            assert.throws(() => device.answerAlert("OK"), /no button "OK"/)
            device.answerAlert("Next")
            assert.strictEqual(yield* Fiber.join(next), "next")
            device.pressBack()
          } else {
            assert.throws(() => device.dismissAlert(), /only with a button/)
            device.answerAlert("OK")
            assert.strictEqual(yield* Fiber.join(dismissed), "ok")
          }

          const prompt = yield* open(
            Effect.result(
              Alert.prompt({ title: "Sign in", type: "login-password" })
            )
          )
          if (android) {
            assert.throws(
              () => device.answerPrompt("OK", "secret"),
              /No prompt is open/
            )
            assert.isTrue(Result.isFailure(yield* Fiber.join(prompt)))
          } else {
            device.answerPrompt({ buttons: [], id: "ok" }, "secret", "ada")
            assert.deepStrictEqual(
              yield* Fiber.join(prompt),
              Result.succeed({
                id: "ok" as const,
                text: "secret",
                login: "ada"
              })
            )
          }

          const share = yield* open(
            Share.share({ message: "Hi", url: "https://effect.website" })
          )
          if (android) {
            assert.throws(() => device.answerShare(), /once the sheet opens/)
          } else {
            device.answerShare("com.apple.mail")
          }
          assert.deepStrictEqual(yield* Fiber.join(share), {
            action: "shared",
            activityType: android ? undefined : "com.apple.mail"
          })
          if (!android) {
            const unshared = yield* open(Share.share({ message: "Hi" }))
            device.dismissShare()
            assert.deepStrictEqual(yield* Fiber.join(unshared), {
              action: "dismissed"
            })
          }

          yield* Linking.openURL("https://effect.website")
          yield* Linking.openSettings
          yield* PermissionsAndroid.request("android.permission.CAMERA")
          yield* Vibration.vibrate(100)
          const pattern = yield* open(Vibration.pattern([100]))
          yield* Vibration.cancel
          yield* Fiber.join(pattern)
          yield* StatusBar.setStyle("light-content")
          yield* StatusBar.setHidden(true)
          yield* AccessibilityInfo.announce("Saved")
          yield* Appearance.setColorScheme("dark")
          yield* BackHandler.exit

          const alerts: ReadonlyArray<TestDevice.Entry> = android
            ? [
              {
                _tag: "Alert",
                title: "Delete?",
                buttons: ["Later", "Cancel", "Delete"]
              },
              {
                _tag: "Alert",
                title: "Leave?",
                buttons: ["Later", "OK", "OK"]
              },
              { _tag: "Alert", title: "Hi", buttons: ["OK"] },
              { _tag: "Alert", title: "Hi", buttons: ["OK"] },
              { _tag: "Alert", title: "Next", buttons: ["Next"] },
              { _tag: "Exit" },
              { _tag: "Share", message: "Hi https://effect.website" }
            ]
            : [
              {
                _tag: "Alert",
                title: "Delete?",
                buttons: ["Later", "Cancel", "Delete"]
              },
              {
                _tag: "Alert",
                title: "Leave?",
                buttons: ["OK", "Later", "OK", "OK"]
              },
              { _tag: "Alert", title: "Hi", buttons: ["OK"] },
              {
                _tag: "Prompt",
                title: "Sign in",
                buttons: ["OK"],
                type: "login-password"
              },
              { _tag: "Share", message: "Hi", url: "https://effect.website" },
              { _tag: "Share", message: "Hi" }
            ]
          assert.deepStrictEqual(device.log(), [
            ...alerts,
            { _tag: "OpenURL", url: "https://effect.website" },
            { _tag: "OpenSettings" },
            ...(android
              ? [
                {
                  _tag: "RequestPermissions",
                  permissions: ["android.permission.CAMERA"]
                } as const
              ]
              : []),
            { _tag: "Vibrate", duration: 100 },
            ...(android
              ? [
                {
                  _tag: "VibratePattern",
                  pattern: [100],
                  repeat: false
                } as const,
                { _tag: "CancelVibration" } as const
              ]
              : []),
            { _tag: "StatusBarStyle", style: "light-content" },
            { _tag: "StatusBarHidden", hidden: true },
            { _tag: "Announce", announcement: "Saved" },
            { _tag: "SetColorScheme", colorScheme: "dark" },
            ...(android ? [{ _tag: "Exit" } as const] : [])
          ])
        })))
  })
})
