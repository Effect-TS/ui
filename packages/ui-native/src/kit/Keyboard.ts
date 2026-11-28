/**
 * The software keyboard: where it is while it shows, and a way to hide it.
 *
 * **Details**
 *
 * `get` reads the keyboard, `undefined` while it's hidden. `onChange` is a
 * Subscription that sends it when it starts and on each change, and
 * `changes` is a Stream of the changes. `dismiss` hides it by blurring the
 * focused `input`, and `Dismiss` is its Command.
 *
 * iOS reports a change as the keyboard starts to move, with the animation's
 * `duration` and `easing`, and again once it has. The second report is
 * sent only when the frame differs. Android reports once the keyboard has
 * moved, with a `duration` of 0, and again when its height changes.
 *
 * The keyboard is tracked from the first use of this module, so a keyboard
 * already showing then reads as hidden until it moves.
 *
 * **Example** (Hiding the keyboard from a button)
 *
 * ```ts
 * import { Command, UiSchema } from "@effect/ui"
 * import * as Native from "@effect/ui-native/Native"
 * import { Keyboard } from "@effect/ui-native/kit"
 * import { Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ PressedDone: {} })
 *
 * const Done = Native.component({
 *   name: "Done",
 *   model: Schema.Struct({}),
 *   message: Message
 * }).make({
 *   init: () => ({}),
 *   update: { PressedDone: ($) => $.run(Keyboard.Dismiss.make().pipe(Command.asNoop)) },
 *   view: (h) => h.view.on("press", Message.PressedDone()).children(h.text.children("Done"))
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
import type * as Stream from "effect/Stream"
import * as Native from "../Native.ts"
import * as device from "./internal/device.ts"
import { dimensions } from "./internal/dimensions.ts"

/**
 * The keyboard while it shows: its frame on the screen in points, and the
 * animation that moves it there.
 *
 * **Details**
 *
 * `screenY` is the keyboard's top edge, from the top of the screen.
 * `easing` is iOS's animation curve, such as `"keyboard"`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Keyboard {
  readonly screenX: number
  readonly screenY: number
  readonly width: number
  readonly height: number
  readonly duration: number
  readonly easing: string
}

const events = [
  "keyboardWillShow",
  "keyboardDidShow",
  "keyboardWillChangeFrame",
  "keyboardDidChangeFrame",
  "keyboardWillHide",
  "keyboardDidHide"
]

const sameFrame = (a: Keyboard | undefined, b: Keyboard | undefined) =>
  a === b ||
  (a !== undefined && b !== undefined && a.screenX === b.screenX &&
    a.screenY === b.screenY && a.width === b.width && a.height === b.height)

// iOS reports a keyboard dismissed interactively, or moved off the screen,
// as a frame change rather than a hide.
const offScreen = (d: Native.Device, frame: any) => {
  const screen = dimensions(d).get().screen.height
  return frame == null || frame.height <= 0 ||
    (screen > 0 && frame.screenY >= screen)
}

const keyboard = device.source<Keyboard | undefined>(
  () => undefined,
  (d, set) => {
    for (const event of events) {
      const hide = event.endsWith("Hide")
      device.observe(d, "KeyboardObserver", event, (e) => {
        const frame = e?.endCoordinates
        set(
          hide || offScreen(d, frame)
            ? undefined
            : {
              screenX: frame.screenX,
              screenY: frame.screenY,
              width: frame.width,
              height: frame.height,
              duration: e.duration ?? 0,
              easing: e.easing ?? "keyboard"
            }
        )
      })
    }
  },
  sameFrame
)

/**
 * The keyboard, or `undefined` while it's hidden.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const get: Effect.Effect<Keyboard | undefined> = device.get(keyboard)

/**
 * A Subscription that sends `handler`'s message with the keyboard when it
 * starts, then with each change. It gets `undefined` while the keyboard is
 * hidden.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onChange = <Msg>(
  handler: View.Handler<Msg, Keyboard | undefined>
): Subscription.Subscription<Msg> =>
  device.onSource("@effect/ui-native/kit/Keyboard", keyboard, handler)

/**
 * The keyboard each time it changes, `undefined` when it hides.
 *
 * @stability experimental
 * @category streams
 * @since 0.1.0
 */
export const changes: Stream.Stream<Keyboard | undefined> = device.changes(
  keyboard
)

/**
 * Hides the keyboard by blurring the focused `input`. Does nothing when no
 * `input` has focus.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const dismiss: Effect.Effect<void> = Native.Device.useSync((d) =>
  d.blur()
)

/**
 * The Command behind `dismiss`, for a story's
 * `.resolve(Keyboard.Dismiss, undefined)`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Dismiss: Command.Factory<{}, void> = Command.make(
  "Keyboard.dismiss",
  {},
  () => dismiss
)
