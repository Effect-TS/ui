/**
 * URLs: opening them in other apps, and the ones that open this app.
 *
 * **Details**
 *
 * `openURL` opens a URL in the app that handles it, `canOpenURL` checks
 * that one does, and `openSettings` opens this app's page in the system
 * settings. `initialURL` is the URL that launched the app, and `onURL` is a
 * Subscription, and `urls` a Stream, of the URLs that open it while it runs.
 * `sendIntent` starts an Android intent.
 *
 * Each action fails with `Native.DeviceError` when native rejects it, and
 * each has a Command, such as `Open`, whose result is a `Result` of the
 * action.
 *
 * **Gotchas**
 *
 * - On iOS `canOpenURL` answers `false` for a scheme the app doesn't list
 *   under `LSApplicationQueriesSchemes` in its `Info.plist`. On Android 11
 *   and later it answers `false` for an intent the app doesn't declare in
 *   its manifest's `<queries>`.
 *
 * **Example** (Opening a link from a button)
 *
 * ```ts
 * import * as Native from "@effect/ui-native/Native"
 * import { Linking } from "@effect/ui-native/kit"
 * import { Command, UiSchema } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ PressedHelp: {} })
 *
 * const Help = Native.component({
 *   name: "Help",
 *   model: Schema.Struct({}),
 *   message: Message
 * }).make({
 *   init: () => ({}),
 *   update: {
 *     PressedHelp: ($) =>
 *       $.run(Linking.Open.make({ url: "https://effect.website" }).pipe(Command.asNoop))
 *   },
 *   view: (h) => h.view.on("press", Message.PressedHelp()).children(h.text.children("Help"))
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import type * as Subscription from "@effect/ui/Subscription"
import type * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import type * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import type * as Stream from "effect/Stream"
import type * as Native from "../Native.ts"
import * as device from "./internal/device.ts"

const nameOf = (d: Native.Device) =>
  d.os === "android" ? "IntentAndroid" : "LinkingManager"

/**
 * Opens `url` in the app that handles it, such as the browser for an
 * `https` URL. Fails when no app does.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const openURL = (url: string): Effect.Effect<void, Native.DeviceError> =>
  device.promise(nameOf, "openURL", (m) => m.openURL(url))

/**
 * Whether an installed app handles `url`.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const canOpenURL = (
  url: string
): Effect.Effect<boolean, Native.DeviceError> =>
  device.promise(nameOf, "canOpenURL", (m) => m.canOpenURL(url))

/**
 * Opens this app's page in the system settings.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const openSettings: Effect.Effect<void, Native.DeviceError> = device
  .promise(nameOf, "openSettings", (m) => m.openSettings())

/**
 * The URL that launched the app, or `undefined` when it launched another
 * way.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const initialURL: Effect.Effect<string | undefined, Native.DeviceError> =
  device.promise(
    nameOf,
    "getInitialURL",
    async (m) => (await m.getInitialURL()) || undefined
  )

/**
 * An extra of an Android intent.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Extra {
  readonly key: string
  readonly value: string | number | boolean
}

/**
 * Starts the Android intent `action`, such as
 * `"android.settings.APP_NOTIFICATION_SETTINGS"`, with `extras`. Fails off
 * Android.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const sendIntent = (
  action: string,
  extras?: ReadonlyArray<Extra>
): Effect.Effect<void, Native.DeviceError> =>
  device.promise(
    "IntentAndroid",
    "sendIntent",
    (m, d) => d.os === "android" ? m.sendIntent(action, extras) : undefined
  )

const listen = (d: Native.Device, listener: (url: string) => void) =>
  device.observe(d, nameOf(d), "url", (e: { url: string }) => listener(e.url))

/**
 * A Subscription that sends `handler`'s message with each URL that opens
 * the app while it runs. The URL that launched it is `initialURL`.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onURL = <Msg>(
  handler: View.Handler<Msg, string>
): Subscription.Subscription<Msg> =>
  device.subscription("@effect/ui-native/kit/Linking", handler, listen)

/**
 * The URLs that open the app while the Stream runs.
 *
 * @stability experimental
 * @category streams
 * @since 0.1.0
 */
export const urls: Stream.Stream<string> = device.events(listen)

/**
 * The Command behind `openURL`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Open: Command.Factory<
  { readonly url: string },
  Result.Result<void, Native.DeviceError>
> = Command.make(
  "Linking.openURL",
  { args: { url: Schema.String } },
  ({ url }) => Effect.result(openURL(url))
)

/**
 * The Command behind `canOpenURL`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const CanOpen: Command.Factory<
  { readonly url: string },
  Result.Result<boolean, Native.DeviceError>
> = Command.make(
  "Linking.canOpenURL",
  { args: { url: Schema.String } },
  ({ url }) => Effect.result(canOpenURL(url))
)

/**
 * The Command behind `openSettings`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const OpenSettings: Command.Factory<
  {},
  Result.Result<void, Native.DeviceError>
> = Command.make(
  "Linking.openSettings",
  {},
  () => Effect.result(openSettings)
)

/**
 * The Command behind `initialURL`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const InitialURL: Command.Factory<
  {},
  Result.Result<string | undefined, Native.DeviceError>
> = Command.make(
  "Linking.initialURL",
  {},
  () => Effect.result(initialURL)
)

/**
 * The Command behind `sendIntent`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const SendIntent: Command.Factory<
  {
    readonly action: string
    readonly extras?: ReadonlyArray<Extra> | undefined
  },
  Result.Result<void, Native.DeviceError>
> = Command.make(
  "Linking.sendIntent",
  {
    args: {
      action: Schema.String,
      extras: Schema.optional(Schema.Array(Schema.Struct({
        key: Schema.String,
        value: Schema.Union([Schema.String, Schema.Number, Schema.Boolean])
      })))
    }
  },
  ({ action, extras }) => Effect.result(sendIntent(action, extras))
)
