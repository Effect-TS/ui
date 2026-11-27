/**
 * The device's vibration motor.
 *
 * **Details**
 *
 * `vibrate` vibrates once, and `pattern` vibrates in a pattern for as long
 * as it runs: interrupting it, or `cancel`, stops it. `Vibrate`, `Pattern`
 * and `Cancel` are their Commands.
 *
 * **Gotchas**
 *
 * - iOS vibrates for a fixed time of about 400ms, so it ignores
 *   `vibrate`'s duration, and a `pattern` lists only the pauses before
 *   each vibration.
 * - Android needs the `android.permission.VIBRATE` permission in the app's
 *   manifest.
 *
 * **Example** (Buzzing twice)
 *
 * ```ts
 * import { Vibration } from "@effect/ui-native/kit"
 *
 * // Android: wait 0ms, vibrate 200ms, wait 100ms, vibrate 200ms.
 * // iOS: vibrate now, then again after 100ms.
 * const buzz = Vibration.pattern([0, 200, 100, 200])
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Native from "../Native.ts"
import * as device from "./internal/device.ts"

// The pattern that runs, so a newer one or `cancel` stops an older one, and
// wakes it to finish.
const running = device.perDevice(() => ({
  id: 0,
  wake: undefined as (() => void) | undefined
}))

const stopRunning = (
  state: { id: number; wake?: (() => void) | undefined }
) => {
  state.id++
  const wake = state.wake
  state.wake = undefined
  wake?.()
}

/**
 * Vibrates once, for `duration` milliseconds on Android.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const vibrate = (duration = 400): Effect.Effect<void> =>
  Native.Device.useSync((d) => {
    d.module("Vibration")?.vibrate(duration)
  })

/**
 * Vibrates in `pattern` for as long as it runs, from the start again when
 * `repeat` is set. Interrupting it stops it.
 *
 * **Details**
 *
 * On Android the pattern alternates pauses and vibrations, in milliseconds,
 * starting with a pause. On iOS it's the pauses before each vibration, and
 * a first pause of 0 vibrates at once.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const pattern = (
  pattern: ReadonlyArray<number>,
  options?: { readonly repeat?: boolean | undefined }
): Effect.Effect<void> =>
  Native.Device.use((d) => {
    const module = d.module("Vibration")
    if (module === undefined || pattern.length === 0) return Effect.void
    const state = running(d)
    stopRunning(state)
    const id = state.id
    const repeat = options?.repeat === true
    const current = () => state.id === id
    const stop = Effect.sync(() => {
      if (!current()) return
      stopRunning(state)
      if (d.os === "android") module.cancel()
    })
    let run: Effect.Effect<void>
    if (d.os === "android") {
      module.vibrateByPattern(pattern, repeat ? 0 : -1)
      run = repeat
        ? Effect.never
        : Effect.sleep(pattern.reduce((a, b) => a + b, 0))
    } else {
      // iOS vibrates for a fixed time, so the pauses are timed here.
      const pauses = pattern[0] === 0 ? pattern.slice(1) : pattern
      if (pattern[0] === 0) module.vibrate(400)
      let i = 0
      const next: Effect.Effect<void> = Effect.suspend(() =>
        !current() || pauses.length === 0 || (i >= pauses.length && !repeat)
          ? Effect.void
          : Effect.flatMap(Effect.sleep(pauses[i++ % pauses.length]), () => {
            if (!current()) return Effect.void
            module.vibrate(400)
            return next
          })
      )
      run = next
    }
    const woken = Effect.callback<void>((resume) => {
      if (current()) state.wake = () => resume(Effect.void)
      else resume(Effect.void)
    })
    return Effect.raceFirst(run, woken).pipe(
      Effect.onInterrupt(() => stop),
      Effect.ensuring(Effect.sync(() => {
        if (current()) stopRunning(state)
      }))
    )
  })

/**
 * Stops the pattern that's running, and on Android the vibration.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const cancel: Effect.Effect<void> = Native.Device.useSync((d) => {
  stopRunning(running(d))
  if (d.os === "android") d.module("Vibration")?.cancel()
})

/**
 * The Command behind `vibrate`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Vibrate: Command.Factory<
  { readonly duration?: number | undefined },
  void
> = Command.make(
  "Vibration.vibrate",
  { args: { duration: Schema.optional(Schema.Number) } },
  ({ duration }) => vibrate(duration)
)

/**
 * The Command behind `pattern`. It finishes once the pattern has, so a
 * repeating one runs until `Cancel`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Pattern: Command.Factory<
  {
    readonly pattern: ReadonlyArray<number>
    readonly repeat?: boolean | undefined
  },
  void
> = Command.make(
  "Vibration.pattern",
  {
    args: {
      pattern: Schema.Array(Schema.Number),
      repeat: Schema.optional(Schema.Boolean)
    }
  },
  ({ pattern: p, repeat }) => pattern(p, { repeat })
)

/**
 * The Command behind `cancel`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Cancel: Command.Factory<{}, void> = Command.make(
  "Vibration.cancel",
  {},
  () => cancel
)
