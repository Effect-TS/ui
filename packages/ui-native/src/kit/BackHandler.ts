/**
 * Android's Back button.
 *
 * **Details**
 *
 * `onPress` is a Subscription that handles a press. A handler that returns
 * a message takes the press, and one that returns `undefined` passes it to
 * the Subscription that started before it. The latest Subscription gets the
 * press first, so a screen shown over another handles Back before it. When
 * none takes the press, the app runs Android's default, which closes it.
 *
 * `exit` runs that default, and `Exit` is its Command.
 *
 * Back exists only on Android, so off it `onPress` sends nothing and
 * `exit` does nothing.
 *
 * **Gotchas**
 *
 * - React Native's `BackHandler` and this module run the default when their
 *   own handlers don't take a press, so with both in an app, a press either
 *   one takes can still close it. Use one of them.
 *
 * **Example** (Closing a dialog with Back)
 *
 * ```ts
 * import * as Native from "@effect/ui-native/Native"
 * import { BackHandler } from "@effect/ui-native/kit"
 * import { UiSchema } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ Closed: {} })
 *
 * const Dialog = Native.component({
 *   name: "Dialog",
 *   model: Schema.Struct({ open: Schema.Boolean }),
 *   message: Message
 * }).make({
 *   init: () => ({ open: true }),
 *   update: { Closed: ($) => $.set({ open: false }) },
 *   // Back closes the dialog while it's open, and the app after.
 *   subscriptions: ({ model }) => [model.open && BackHandler.onPress(Message.Closed())],
 *   view: (h) => h.text.children("Dialog")
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import type * as Subscription from "@effect/ui/Subscription"
import type * as View from "@effect/ui/View"
import type * as Effect from "effect/Effect"
import * as Native from "../Native.ts"
import * as device from "./internal/device.ts"

// Each takes the press when it returns true.
type Entry = () => boolean

const exitWith = (d: Native.Device) =>
  d.module("DeviceEventManager")?.invokeDefaultBackPressHandler()

// The device listens only while a Subscription does, so the app runs the
// default without one.
const entries = device.perDevice((d) => {
  const stack: Array<Entry> = []
  let off: (() => void) | undefined
  const press = () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i]()) return
    }
    exitWith(d)
  }
  return (entry: Entry) => {
    stack.push(entry)
    off ??= d.on("hardwareBackPress", press)
    return () => {
      stack.splice(stack.indexOf(entry), 1)
      if (stack.length === 0) {
        off?.()
        off = undefined
      }
    }
  }
})

/**
 * A Subscription that handles Back while it runs. `handler` is a message,
 * which takes every press, or a function that returns one to take a press,
 * or `undefined` to pass it on.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onPress = <Msg>(
  handler: View.Handler<Msg, void>
): Subscription.Subscription<Msg> =>
  device.subscription(
    "@effect/ui-native/kit/BackHandler",
    handler,
    (d, press) => entries(d)(() => press(undefined))
  )

/**
 * Runs Android's default for Back, which closes the app.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const exit: Effect.Effect<void> = Native.Device.useSync(exitWith)

/**
 * The Command behind `exit`, for a story's `.resolve(BackHandler.Exit, undefined)`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Exit: Command.Factory<{}, void> = Command.make(
  "BackHandler.exit",
  {},
  () => exit
)
