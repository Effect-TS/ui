/**
 * A fake `HtmlSubscription.GlobalEvents` for whole-app tests, so a test fires
 * document and window events without a document, in Node too.
 *
 * Provide `layer` next to `TestHost.layer()`, and fire an event with
 * `fire`, or a custom one with `fireCustomEvent`. Every listener the mounted
 * components' `HtmlSubscription.onDocument`, `onCustomEvent` and `onWindow`
 * added runs, as the browser would run them. Both return whether one
 * cancelled the default. Run `TestHost.settle` after it to see the update.
 *
 * **Example** (Pressing Escape in a whole-app test)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlSubscription } from "@effect/ui/html"
 * import { TestGlobalEvents } from "@effect/ui/html/testing"
 * import { TestHost } from "@effect/ui/testing"
 * import { Effect, Layer, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ PressedEscape: {} })
 *
 * const Menu = Component.define({
 *   name: "Menu",
 *   scoped: false,
 *   model: Schema.Boolean,
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => true,
 *   update: { PressedEscape: () => false },
 *   view: (h, open) => h.p(open ? "open" : "closed"),
 *   subscriptions: ({ model: open }) => [
 *     open && HtmlSubscription.onDocument("keydown", ({ key }) =>
 *       key === "Escape" ? Message.PressedEscape() : undefined
 *     )
 *   ]
 * })
 *
 * Effect.gen(function*() {
 *   const root = yield* TestHost.mount(Menu, {})
 *   yield* TestHost.settle
 *   yield* TestGlobalEvents.fire("document", "keydown", { key: "Escape" })
 *   yield* TestHost.settle
 *   root.model() // => false
 * }).pipe(Effect.provide(Layer.merge(TestHost.layer(), TestGlobalEvents.layer)), Effect.scoped, Effect.runPromise)
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HtmlSubscription from "../HtmlSubscription.ts"
import * as fireGlobal from "../internal/fireGlobal.ts"

/**
 * The events `fire` takes for each target, with their payloads.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Targets {
  readonly document: HtmlSubscription.DocumentEvents
  readonly window: HtmlSubscription.WindowEvents
}

/**
 * The `TestGlobalEvents` service: the fake's control.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface TestGlobalEvents {
  /**
   * Fires `event` on `target`: the capture listeners, then the bubble
   * ones, each in the order it was added. A phase runs the listeners
   * listening as it starts, as in a browser, but for one an earlier
   * listener's message removed. Missing payload fields default as
   * `HtmlScene`'s `fireDocument` defaults them. Returns whether a
   * listener cancelled the default.
   */
  readonly fire: <T extends keyof Targets, K extends keyof Targets[T]>(
    target: T,
    event: K,
    payload?: Partial<HtmlSubscription.GlobalPayload<Targets[T][K]>>
  ) => boolean
  /**
   * Fires a custom `event` on the document, as `fire` does for built-in
   * document events. `detail` defaults to `null` and `defaultPrevented` to
   * `false`.
   */
  readonly fireCustomEvent: (
    event: string,
    payload?: Partial<HtmlSubscription.GlobalPayload<HtmlSubscription.CustomEventPayload>>
  ) => boolean
}

/**
 * The `TestGlobalEvents` service.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export const TestGlobalEvents: Context.Service<TestGlobalEvents, TestGlobalEvents> = Context.Service<
  TestGlobalEvents
>("@effect/ui/html/testing/TestGlobalEvents")

interface Entry {
  readonly target: string
  readonly event: string
  readonly capture: boolean
  readonly listener: fireGlobal.Listener
}

/**
 * Makes a fake source and its control. `layer` provides a new one per
 * build.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = (): HtmlSubscription.GlobalEvents & TestGlobalEvents => {
  const entries = new Set<Entry>()
  const fire = (target: string, event: string, payload: object | undefined) =>
    fireGlobal.fire(event, payload, function*(capture) {
      // Copied as the phase starts. A listener an earlier one's message removed is skipped.
      for (const entry of Array.from(entries)) {
        if (entry.target === target && entry.event === event && entry.capture === capture && entries.has(entry)) {
          yield entry.listener
        }
      }
    })
  return {
    listen: (target, event, { capture }, listener) => {
      const entry: Entry = { target, event, capture, listener }
      entries.add(entry)
      return () => {
        entries.delete(entry)
      }
    },
    fire: (target, event, payload) => fire(target, event as string, payload),
    fireCustomEvent: (event, payload) => fire("document", event, fireGlobal.custom(payload))
  }
}

/**
 * Provides a fake `HtmlSubscription.GlobalEvents` with its control,
 * `TestGlobalEvents`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer: Layer.Layer<TestGlobalEvents> = Layer.effectContext(
  Effect.sync(() => {
    const events = make()
    return Context.make(TestGlobalEvents, events).pipe(Context.add(HtmlSubscription.GlobalEvents, events))
  })
)

/**
 * Fires `event` on `target` through the fake, and returns whether a
 * listener cancelled the default.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const fire = <T extends keyof Targets, K extends keyof Targets[T]>(
  target: T,
  event: K,
  payload?: Partial<HtmlSubscription.GlobalPayload<Targets[T][K]>>
): Effect.Effect<boolean, never, TestGlobalEvents> =>
  TestGlobalEvents.useSync((events) => events.fire(target, event, payload))

/**
 * Fires a custom `event` on the document through the fake, and returns
 * whether a listener cancelled the default.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const fireCustomEvent = (
  event: string,
  payload?: Partial<HtmlSubscription.GlobalPayload<HtmlSubscription.CustomEventPayload>>
): Effect.Effect<boolean, never, TestGlobalEvents> =>
  TestGlobalEvents.useSync((events) => events.fireCustomEvent(event, payload))
