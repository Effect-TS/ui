/**
 * The system's accessibility settings, and the screen reader.
 *
 * **Details**
 *
 * `isEnabled` reads a `Setting`, such as whether a screen reader runs or
 * the user asked for less motion. `onChange` is a Subscription that sends
 * it once read and on each change, and `changes` is a Stream of the
 * changes. `announce` has the screen reader speak, `focus` moves its
 * focus to a view, and `recommendedTimeout` is how long to show a
 * message that hides itself. `Announce` and `Focus` are Commands.
 *
 * A setting a platform doesn't have is `false` there, such as
 * `"boldText"` on Android.
 *
 * **Example** (Skipping an animation for reduced motion)
 *
 * ```ts
 * import * as Native from "@effect/ui-native/Native"
 * import { AccessibilityInfo } from "@effect/ui-native/kit"
 * import { UiSchema } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ ChangedReduceMotion: { enabled: Schema.Boolean } })
 *
 * const Banner = Native.component({
 *   name: "Banner",
 *   model: Schema.Struct({ reduceMotion: Schema.Boolean }),
 *   message: Message
 * }).make({
 *   init: () => ({ reduceMotion: false }),
 *   update: { ChangedReduceMotion: ($, { enabled }) => $.set({ reduceMotion: enabled }) },
 *   subscriptions: () => [
 *     AccessibilityInfo.onChange("reduceMotion", (enabled) => Message.ChangedReduceMotion({ enabled }))
 *   ],
 *   view: (h) => h.text.children(h.model.reduceMotion ? "Welcome" : "Welcome!")
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import * as Renderer from "@effect/ui/Renderer"
import type * as Subscription from "@effect/ui/Subscription"
import type * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as Stream from "effect/Stream"
import * as Native from "../Native.ts"
import type { NativeNode } from "../NativeHost.ts"
import * as device from "./internal/device.ts"

/**
 * An accessibility setting.
 *
 * **Details**
 *
 * - `"screenReader"`: VoiceOver or TalkBack runs.
 * - `"reduceMotion"`: the user asked for less motion.
 * - `"invertColors"`, `"grayscale"`: the screen's colours are inverted, or
 *   grey.
 * - `"boldText"`, `"reduceTransparency"`, `"darkerSystemColors"`: iOS
 *   only.
 * - `"highTextContrast"`, `"accessibilityService"`: Android only. An
 *   accessibility service is any app that reads or controls the screen,
 *   such as TalkBack or Switch Access.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Setting =
  | "screenReader"
  | "reduceMotion"
  | "invertColors"
  | "grayscale"
  | "boldText"
  | "reduceTransparency"
  | "darkerSystemColors"
  | "highTextContrast"
  | "accessibilityService"

// Each setting's getter and event, on Android then iOS.
const settings: Record<
  Setting,
  readonly [
    android: readonly [string, string] | undefined,
    ios?: readonly [string, string]
  ]
> = {
  screenReader: [
    ["isTouchExplorationEnabled", "touchExplorationDidChange"],
    ["getCurrentVoiceOverState", "screenReaderChanged"]
  ],
  reduceMotion: [
    ["isReduceMotionEnabled", "reduceMotionDidChange"],
    ["getCurrentReduceMotionState", "reduceMotionChanged"]
  ],
  invertColors: [
    ["isInvertColorsEnabled", "invertColorDidChange"],
    ["getCurrentInvertColorsState", "invertColorsChanged"]
  ],
  grayscale: [
    ["isGrayscaleEnabled", "grayscaleModeDidChange"],
    ["getCurrentGrayscaleState", "grayscaleChanged"]
  ],
  boldText: [undefined, ["getCurrentBoldTextState", "boldTextChanged"]],
  reduceTransparency: [undefined, [
    "getCurrentReduceTransparencyState",
    "reduceTransparencyChanged"
  ]],
  darkerSystemColors: [undefined, [
    "getCurrentDarkerSystemColorsState",
    "darkerSystemColorsChanged"
  ]],
  highTextContrast: [[
    "isHighTextContrastEnabled",
    "highTextContrastDidChange"
  ]],
  accessibilityService: [[
    "isAccessibilityServiceEnabled",
    "accessibilityServiceDidChange"
  ]]
}

const android = (d: Native.Device) => d.os === "android"

const nameOf = (d: Native.Device) =>
  android(d) ? "AccessibilityInfo" : "AccessibilityManager"

const entry = (d: Native.Device, setting: Setting) =>
  settings[setting][android(d) ? 0 : 1]

const read = (
  d: Native.Device,
  setting: Setting,
  answer: (enabled: boolean) => void
) => {
  const getter = entry(d, setting)?.[0]
  const method = getter && d.module(nameOf(d))?.[getter]
  if (method === undefined) return answer(false)
  const yes = (enabled: boolean) => answer(enabled === true)
  // Android's getters take only the success callback, and its bridge
  // rejects a call with more arguments than the method has.
  if (android(d)) method(yes)
  else method(yes, () => answer(false))
}

/**
 * Whether `setting` is on.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const isEnabled = (setting: Setting): Effect.Effect<boolean> =>
  Native.Device.use((d) =>
    Effect.callback<boolean>((resume) => {
      read(d, setting, (enabled) => resume(Effect.succeed(enabled)))
    })
  )

const listen = (setting: Setting) =>
(
  d: Native.Device,
  listener: (enabled: boolean) => void
) => {
  const event = entry(d, setting)?.[1]
  if (event === undefined) return () => {}
  return device.observe(d, nameOf(d), event, listener)
}

/**
 * A Subscription that sends `handler`'s message with whether `setting` is
 * on, once native answers, then with each change.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onChange = <Msg>(
  setting: Setting,
  handler: View.Handler<Msg, boolean>
): Subscription.Subscription<Msg> =>
  device.subscription(
    `@effect/ui-native/kit/AccessibilityInfo/${setting}`,
    handler,
    (d, listener) => {
      // A change that arrives first is newer than the answer.
      let changed = false
      const off = listen(setting)(d, (enabled) => {
        changed = true
        listener(enabled)
      })
      read(d, setting, (enabled) => {
        if (!changed) listener(enabled)
      })
      return off
    }
  )

/**
 * Whether `setting` is on, each time it changes.
 *
 * @stability experimental
 * @category streams
 * @since 0.1.0
 */
export const changes = (setting: Setting): Stream.Stream<boolean> =>
  device.events(listen(setting))

/**
 * How an iOS announcement queues: `queue` waits for the screen reader to
 * finish speaking, and `priority` decides which of several announcements
 * speaks first.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface AnnounceOptions {
  readonly queue?: boolean | undefined
  readonly priority?: "low" | "default" | "high" | undefined
}

/**
 * Has the screen reader speak `announcement`. Does nothing while none runs.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const announce = (
  announcement: string,
  options?: AnnounceOptions
): Effect.Effect<void> =>
  Native.Device.useSync((d) => {
    const module = d.module(nameOf(d))
    if (options !== undefined && module?.announceForAccessibilityWithOptions) {
      module.announceForAccessibilityWithOptions(announcement, options)
    } else {
      module?.announceForAccessibility(announcement)
    }
  })

/**
 * What iOS reports when the screen reader finishes an announcement:
 * `success` is `false` when something interrupted it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Announced {
  readonly announcement: string
  readonly success: boolean
}

/**
 * A Subscription that sends `handler`'s message each time iOS's screen
 * reader finishes an announcement. It sends nothing on Android.
 *
 * @stability experimental
 * @category subscriptions
 * @since 0.1.0
 */
export const onAnnouncementFinished = <Msg>(
  handler: View.Handler<Msg, Announced>
): Subscription.Subscription<Msg> =>
  device.subscription(
    "@effect/ui-native/kit/AccessibilityInfo/announcementFinished",
    handler,
    (d, listener) =>
      android(d)
        ? () => {}
        : device.observe(d, nameOf(d), "announcementFinished", listener)
  )

/**
 * Moves the screen reader's focus to `ref`'s view. Succeeds with whether
 * the view is mounted.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const focus = (
  ref: Renderer.Ref<NativeNode>
): Effect.Effect<boolean, never, Renderer.Refs | Native.Host> =>
  Effect.flatMap(
    Renderer.Refs.use((refs) => refs.lookup(ref)),
    (node) =>
      Native.Host.useSync((host) => {
        if (Option.isNone(node)) return false
        host.accessibilityEvent(node.value, "focus")
        return true
      })
  )

/**
 * How long to show a message that hides itself, such as a toast, for one
 * that would show `milliseconds`: Android lets the user ask for longer.
 * Elsewhere it's `milliseconds`.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const recommendedTimeout = (
  milliseconds: number
): Effect.Effect<number> =>
  Native.Device.use((d) => {
    const module = android(d) ? d.module("AccessibilityInfo") : undefined
    return module?.getRecommendedTimeoutMillis === undefined
      ? Effect.succeed(milliseconds)
      : Effect.callback<number>((resume) => {
        module.getRecommendedTimeoutMillis(
          milliseconds,
          (timeout: number) => resume(Effect.succeed(timeout))
        )
      })
  })

/**
 * The Command behind `announce`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Announce: Command.Factory<
  {
    readonly announcement: string
    readonly options?: AnnounceOptions | undefined
  },
  void
> = Command.make(
  "AccessibilityInfo.announce",
  {
    args: {
      announcement: Schema.String,
      options: Schema.optional(Schema.Struct({
        queue: Schema.optional(Schema.Boolean),
        priority: Schema.optional(Schema.Literals(["low", "default", "high"]))
      }))
    }
  },
  ({ announcement, options }) => announce(announcement, options)
)

/**
 * The Command behind `focus`, for a story's
 * `.resolve(AccessibilityInfo.Focus, true)`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Focus: Command.Factory<
  { readonly ref: Renderer.Ref<NativeNode> },
  boolean
> = Command.make(
  "AccessibilityInfo.focus",
  { args: { ref: Renderer.Ref } },
  ({ ref }) => focus(ref)
)
