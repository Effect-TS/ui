/**
 * The app's colour scheme, light or dark, and a way to override the
 * system's.
 *
 * **Details**
 *
 * `get` reads the scheme, `onChange` is a Subscription that sends it when
 * it starts and on each change, and `changes` is a Stream of the changes.
 * `setColorScheme` overrides the system's for this app, and `"auto"`
 * follows the system again. `SetColorScheme` is its Command.
 *
 * Off a device the scheme is `"light"`.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import type * as Subscription from "@effect/ui/Subscription"
import type * as View from "@effect/ui/View"
import type * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import type * as Stream from "effect/Stream"
import * as device from "./internal/device.ts"

/**
 * A colour scheme.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ColorScheme = "light" | "dark"

const scheme = device.source<ColorScheme>(
  (d) => d.module("Appearance")?.getColorScheme() ?? "light",
  (d, set) =>
    device.observe(
      d,
      "Appearance",
      "appearanceChanged",
      (e) => set(e.colorScheme ?? "light")
    )
)

/**
 * The current colour scheme.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const get: Effect.Effect<ColorScheme> = device.get(scheme)

/**
 * A Subscription that sends `handler`'s message with the colour scheme when
 * it starts, then with each change.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onChange = <Msg>(
  handler: View.Handler<Msg, ColorScheme>
): Subscription.Subscription<Msg> =>
  device.onSource("@effect/ui-native/kit/Appearance", scheme, handler)

/**
 * The colour scheme each time it changes.
 *
 * @stability experimental
 * @category streams
 * @since 0.1.0
 */
export const changes: Stream.Stream<ColorScheme> = device.changes(scheme)

/**
 * Overrides the system's colour scheme for this app, or follows it again
 * with `"auto"`. It changes the app's native views, such as an alert's, and
 * not the system's.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const setColorScheme = (
  colorScheme: ColorScheme | "auto"
): Effect.Effect<void> =>
  device.withDevice((d) => {
    const appearance = d.module("Appearance")
    if (appearance === undefined) return
    appearance.setColorScheme(colorScheme)
    scheme(d).set(
      colorScheme === "auto"
        ? appearance.getColorScheme() ?? "light"
        : colorScheme
    )
  })

/**
 * The Command behind `setColorScheme`, for a story's
 * `.resolve(Appearance.SetColorScheme, undefined)`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const SetColorScheme: Command.Factory<
  { readonly colorScheme: ColorScheme | "auto" },
  void
> = Command.make(
  "Appearance.setColorScheme",
  { args: { colorScheme: Schema.Literals(["light", "dark", "auto"]) } },
  ({ colorScheme }) => setColorScheme(colorScheme)
)
