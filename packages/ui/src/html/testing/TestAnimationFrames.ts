/**
 * A fake `HtmlSubscription.AnimationFrames` for whole-app tests, so a test
 * fires animation frames without a window, in Node too.
 *
 * Provide `layer` next to `TestHost.layer()`, and fire a frame with
 * `fire`, giving the time since the last one. Every `onAnimationFrame`
 * of the mounted components runs. Run `TestHost.settle` after it to see
 * the update.
 *
 * **Example** (Two frames in a whole-app test)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlSubscription } from "@effect/ui/html"
 * import { TestAnimationFrames } from "@effect/ui/html/testing"
 * import { TestHost } from "@effect/ui/testing"
 * import { Effect, Layer, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ TickedFrame: { delta: Schema.Number } })
 *
 * const Clock = Html.component({
 *   name: "Clock",
 *   model: Schema.Number,
 *   message: Message
 * }).make({
 *   init: () => 0,
 *   update: { TickedFrame: ($, { delta }) => $.model + delta },
 *   view: (h, elapsed) => h.p(String(elapsed)),
 *   subscriptions: () => [HtmlSubscription.onAnimationFrame((delta) => Message.TickedFrame({ delta }))]
 * })
 *
 * Effect.gen(function*() {
 *   const root = yield* TestHost.mount(Clock, {})
 *   yield* TestHost.settle
 *   yield* TestAnimationFrames.fire(16)
 *   yield* TestAnimationFrames.fire(17)
 *   yield* TestHost.settle
 *   root.model() // => 33
 * }).pipe(Effect.provide(Layer.merge(TestHost.layer(), TestAnimationFrames.layer)), Effect.scoped, Effect.runPromise)
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HtmlSubscription from "../HtmlSubscription.ts"

/**
 * The `TestAnimationFrames` service: the fake's control.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface TestAnimationFrames {
  /**
   * Moves the fake's clock on by `delta` ms, `16` by default, and fires a
   * frame at the new time: every listener listening as it starts, in the
   * order it was added, but for one an earlier listener's message removed.
   */
  readonly fire: (delta?: number) => void
}

/**
 * The `TestAnimationFrames` service.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export const TestAnimationFrames: Context.Service<
  TestAnimationFrames,
  TestAnimationFrames
> = Context.Service<
  TestAnimationFrames
>("@effect/ui/html/testing/TestAnimationFrames")

/**
 * Makes a fake source and its control, with its clock at `0`. `layer`
 * provides a new one per build.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = ():
  & HtmlSubscription.AnimationFrames
  & TestAnimationFrames =>
{
  const listeners = new Set<{ readonly listener: (time: number) => void }>()
  let now = 0
  return {
    now: () => now,
    listen: (listener) => {
      const entry = { listener }
      listeners.add(entry)
      return () => {
        listeners.delete(entry)
      }
    },
    fire: (delta = 16) => {
      now += delta
      for (const entry of Array.from(listeners)) {
        if (listeners.has(entry)) entry.listener(now)
      }
    }
  }
}

/**
 * Provides a fake `HtmlSubscription.AnimationFrames` with its control,
 * `TestAnimationFrames`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer: Layer.Layer<TestAnimationFrames> = Layer.effectContext(
  Effect.sync(() => {
    const frames = make()
    return Context.make(TestAnimationFrames, frames).pipe(
      Context.add(HtmlSubscription.AnimationFrames, frames)
    )
  })
)

/**
 * Fires a frame `delta` ms after the last, `16` by default, through the
 * fake.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const fire = (
  delta?: number
): Effect.Effect<void, never, TestAnimationFrames> =>
  TestAnimationFrames.useSync((frames) => frames.fire(delta))
