/**
 * The status bar at the top of the screen.
 *
 * **Details**
 *
 * `configure` is a Subscription that sets the status bar's style or hides
 * it while it runs, as React Native's `StatusBar` component does: the
 * latest one to start wins, for each of `style` and `hidden` it sets, and
 * the status bar goes back to the one before when it stops. `setStyle` and
 * `setHidden` set what shows under every `configure`, and `SetStyle` and
 * `SetHidden` are their Commands. `height` is its height.
 *
 * **Gotchas**
 *
 * - A `configure` whose options change starts again, so it then wins over
 *   one that started after it.
 *
 * **Example** (Light text over a dark screen)
 *
 * ```ts
 * import * as Native from "@effect/ui-native/Native"
 * import { StatusBar } from "@effect/ui-native/kit"
 * import { Schema } from "effect"
 *
 * const Player = Native.component({
 *   name: "Player",
 *   model: Schema.Struct({}),
 *   message: Schema.Never
 * }).make({
 *   init: () => ({}),
 *   update: ($) => $.model,
 *   subscriptions: () => [StatusBar.configure({ style: "light-content" })],
 *   view: (h) => h.view.style({ flex: 1, backgroundColor: "black" })
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import * as Subscription from "@effect/ui/Subscription"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Native from "../Native.ts"
import * as device from "./internal/device.ts"

/**
 * The colour of the status bar's text and icons: `"light-content"` for a
 * dark background, `"dark-content"` for a light one, and `"default"` for
 * the platform's choice.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Style = "default" | "light-content" | "dark-content"

/**
 * How iOS animates the status bar as it hides or shows.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Animation = "none" | "fade" | "slide"

const name = "StatusBarManager"

const ios = (d: Native.Device) => d.os === "ios"

/**
 * The status bar's height in points, 0 off a device.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const height: Effect.Effect<number> = device.withDevice((d) =>
  d.module(name)?.getConstants().HEIGHT ?? 0
)

const style = (d: Native.Device, value: Style, animated: boolean) =>
  ios(d)
    ? d.module(name)?.setStyle(value, animated)
    : d.module(name)?.setStyle(value)

const hide = (d: Native.Device, value: boolean, animation: Animation) =>
  ios(d)
    ? d.module(name)?.setHidden(value, animation)
    : d.module(name)?.setHidden(value)

/**
 * What a `configure` sets. A field it leaves out is the one before's.
 *
 * **Details**
 *
 * `animated` fades a change of style on iOS, and `animation` animates a
 * change of `hidden` there.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options {
  readonly style?: Style | undefined
  readonly hidden?: boolean | undefined
  readonly animated?: boolean | undefined
  readonly animation?: Animation | undefined
}

// The running `configure`s over the setters' `base`, latest last, and what
// native last got from them.
const stack = device.perDevice((d) => {
  const entries: Array<Options> = []
  const base = { style: "default" as Style, hidden: false }
  // `undefined` until native is known to show a value.
  const shown: { style?: Style | undefined; hidden?: boolean | undefined } = {
    ...base
  }
  const apply = (by: Options | undefined) => {
    let nextStyle = base.style
    let nextHidden = base.hidden
    for (const entry of entries) {
      if (entry.style !== undefined) nextStyle = entry.style
      if (entry.hidden !== undefined) nextHidden = entry.hidden
    }
    if (nextStyle !== shown.style) {
      shown.style = nextStyle
      style(d, nextStyle, by?.animated ?? false)
    }
    if (nextHidden !== shown.hidden) {
      shown.hidden = nextHidden
      hide(d, nextHidden, by?.animation ?? "none")
    }
  }
  return {
    // A setter reaches native even when it sets what's assumed shown, since
    // the app may start with another style.
    set: (options: Options) => {
      if (options.style !== undefined) {
        base.style = options.style
        shown.style = undefined
      }
      if (options.hidden !== undefined) {
        base.hidden = options.hidden
        shown.hidden = undefined
      }
      apply(options)
    },
    push: (options: Options) => {
      entries.push(options)
      apply(options)
      return () => {
        entries.splice(entries.indexOf(options), 1)
        apply(options)
      }
    }
  }
})

/**
 * Sets the status bar's style under every `configure`: it shows while none
 * sets a style. `animated` fades it on iOS.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const setStyle = (
  value: Style,
  options?: { readonly animated?: boolean | undefined }
): Effect.Effect<void> =>
  device.withDevice((d) => {
    stack(d).set({ style: value, animated: options?.animated })
  })

/**
 * Hides or shows the status bar under every `configure`, as `setStyle`
 * does, with iOS's `animation`.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const setHidden = (
  hidden: boolean,
  options?: { readonly animation?: Animation | undefined }
): Effect.Effect<void> =>
  device.withDevice((d) => {
    stack(d).set({ hidden, animation: options?.animation })
  })

/**
 * A Subscription that sets the status bar while it runs. When it stops,
 * the status bar goes back to the `configure` before it, or without one
 * to what `setStyle` and `setHidden` set: the default style, shown, until
 * they're used.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const configure = (
  options: Options
): Subscription.Subscription<never> =>
  Subscription.direct<undefined, never>(
    "@effect/ui-native/kit/StatusBar",
    [
      options.style ?? null,
      options.hidden ?? null,
      options.animated ?? null,
      options.animation ?? null
    ],
    undefined,
    (context) => stack(Context.get(context, Native.Device)).push(options)
  )

/**
 * The Command behind `setStyle`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const SetStyle: Command.Factory<
  { readonly style: Style; readonly animated?: boolean | undefined },
  void
> = Command.make(
  "StatusBar.setStyle",
  {
    args: {
      style: Schema.Literals(["default", "light-content", "dark-content"]),
      animated: Schema.optional(Schema.Boolean)
    }
  },
  ({ animated, style }) => setStyle(style, { animated })
)

/**
 * The Command behind `setHidden`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const SetHidden: Command.Factory<
  { readonly hidden: boolean; readonly animation?: Animation | undefined },
  void
> = Command.make(
  "StatusBar.setHidden",
  {
    args: {
      hidden: Schema.Boolean,
      animation: Schema.optional(Schema.Literals(["none", "fade", "slide"]))
    }
  },
  ({ animation, hidden }) => setHidden(hidden, { animation })
)
