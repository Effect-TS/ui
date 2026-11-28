/**
 * Right-to-left layout.
 *
 * **Details**
 *
 * `get` reads whether the app lays out right to left. `allowRTL`,
 * `forceRTL` and `swapLeftAndRightInRTL` change that, from the app's next
 * launch: native reads them as it starts. `AllowRTL`, `ForceRTL` and
 * `SwapLeftAndRightInRTL` are their Commands.
 *
 * Off a device the app lays out left to right.
 *
 * **Example** (Mirroring an arrow in right-to-left layout)
 *
 * ```ts
 * import { I18nManager } from "@effect/ui-native/kit"
 * import { Effect } from "effect"
 *
 * const arrow = Effect.map(I18nManager.get, ({ isRTL }) => isRTL ? "←" : "→")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import type * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Native from "../Native.ts"
import * as device from "./internal/device.ts"

/**
 * How the app lays out text and views.
 *
 * **Details**
 *
 * - `isRTL`: the app lays out right to left.
 * - `doLeftAndRightSwapInRTL`: in right-to-left layout, a style's `left`
 *   and `right` sides swap, as `start` and `end` do.
 * - `localeIdentifier`: the system's locale, such as `"en_US"`, when
 *   native reports it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Layout {
  readonly isRTL: boolean
  readonly doLeftAndRightSwapInRTL: boolean
  readonly localeIdentifier: string | undefined
}

const name = "I18nManager"

// Native reads these as it starts, so they're fixed until the next launch.
const layout = device.perDevice((d): Layout => {
  const constants = d.module(name)?.getConstants()
  return {
    isRTL: constants?.isRTL ?? false,
    doLeftAndRightSwapInRTL: constants?.doLeftAndRightSwapInRTL ?? true,
    localeIdentifier: constants?.localeIdentifier ?? undefined
  }
})

/**
 * How the app lays out.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const get: Effect.Effect<Layout> = Native.Device.useSync(layout)

const set = (method: string) => (value: boolean): Effect.Effect<void> =>
  Native.Device.useSync((d) => {
    d.module(name)?.[method](value)
  })

/**
 * Lets the app lay out right to left from its next launch, when the
 * system's language reads that way. React Native allows it by default on
 * Android, and iOS needs the app to list the language.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const allowRTL: (allow: boolean) => Effect.Effect<void> = set(
  "allowRTL"
)

/**
 * Makes the app lay out right to left from its next launch, whatever the
 * system's language. For testing a right-to-left layout.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const forceRTL: (force: boolean) => Effect.Effect<void> = set(
  "forceRTL"
)

/**
 * Sets whether `left` and `right` swap in right-to-left layout, from the
 * app's next launch.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const swapLeftAndRightInRTL: (swap: boolean) => Effect.Effect<void> =
  set("swapLeftAndRightInRTL")

const command = (
  method: string,
  f: (value: boolean) => Effect.Effect<void>
): Command.Factory<{ readonly value: boolean }, void> =>
  Command.make(
    `I18nManager.${method}`,
    { args: { value: Schema.Boolean } },
    ({ value }) => f(value)
  )

/**
 * The Command behind `allowRTL`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const AllowRTL: Command.Factory<{ readonly value: boolean }, void> =
  command("allowRTL", allowRTL)

/**
 * The Command behind `forceRTL`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const ForceRTL: Command.Factory<{ readonly value: boolean }, void> =
  command("forceRTL", forceRTL)

/**
 * The Command behind `swapLeftAndRightInRTL`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const SwapLeftAndRightInRTL: Command.Factory<
  { readonly value: boolean },
  void
> = command("swapLeftAndRightInRTL", swapLeftAndRightInRTL)
