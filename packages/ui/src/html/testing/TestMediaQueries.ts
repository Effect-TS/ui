/**
 * A fake `HtmlSubscription.MediaQueries` for whole-app tests without a window.
 *
 * Provide `layer` next to `TestHost.layer()`, and update a query's match state
 * with `set`. Call `set` before mounting to choose a query's initial value
 * (`false` otherwise). Every `onMediaQuery` listening for that query receives
 * its current value when it starts, and each subsequent change. Run
 * `TestHost.settle` after `set` to see the update.
 *
 * **Example** (Toggling dark mode in a whole-app test)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlSubscription } from "@effect/ui/html"
 * import { TestMediaQueries } from "@effect/ui/html/testing"
 * import { TestHost } from "@effect/ui/testing"
 * import { Effect, Layer, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ ChangedScheme: { dark: Schema.Boolean } })
 *
 * const Theme = Html.component({
 *   name: "Theme",
 *   model: Schema.Boolean,
 *   message: Message
 * }).make({
 *   init: () => false,
 *   update: { ChangedScheme: (_, { dark }) => dark },
 *   view: (h, dark) => h.p(dark ? "dark" : "light"),
 *   subscriptions: () => [
 *     HtmlSubscription.onMediaQuery(
 *       "(prefers-color-scheme: dark)",
 *       (dark) => Message.ChangedScheme({ dark })
 *     )
 *   ]
 * })
 *
 * Effect.gen(function*() {
 *   const root = yield* TestHost.mount(Theme, {})
 *   yield* TestHost.settle
 *   yield* TestMediaQueries.set("(prefers-color-scheme: dark)", true)
 *   yield* TestHost.settle
 *   root.model() // => true
 * }).pipe(Effect.provide(Layer.merge(TestHost.layer(), TestMediaQueries.layer)), Effect.scoped, Effect.runPromise)
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
 * Controls the fake media query source.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface TestMediaQueries {
  /**
   * Sets whether `query` matches. On a change, notifies listeners registered
   * at the start of this call in registration order, skipping any removed
   * before their turn.
   */
  readonly set: (query: string, matches: boolean) => void
}

/**
 * The `TestMediaQueries` service.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export const TestMediaQueries: Context.Service<
  TestMediaQueries,
  TestMediaQueries
> = Context.Service<
  TestMediaQueries
>("@effect/ui/html/testing/TestMediaQueries")

interface Entry {
  readonly query: string
  readonly listener: (matches: boolean) => void
}

/**
 * Makes a fake source and its control, with every query initially `false`.
 * `layer` provides a new one per build.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = (): HtmlSubscription.MediaQueries & TestMediaQueries => {
  const values = new Map<string, boolean>()
  const listeners = new Set<Entry>()
  return {
    matches: (query) => values.get(query) ?? false,
    listen: (query, listener) => {
      const entry: Entry = { query, listener }
      listeners.add(entry)
      return () => {
        listeners.delete(entry)
      }
    },
    set: (query, matches) => {
      const previous = values.get(query) ?? false
      values.set(query, matches)
      if (previous === matches) return
      for (const entry of Array.from(listeners)) {
        if (entry.query === query && listeners.has(entry)) {
          entry.listener(matches)
        }
      }
    }
  }
}

/**
 * Provides a fake `HtmlSubscription.MediaQueries` with its control,
 * `TestMediaQueries`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer: Layer.Layer<TestMediaQueries> = Layer.effectContext(
  Effect.sync(() => {
    const media = make()
    return Context.make(TestMediaQueries, media).pipe(
      Context.add(HtmlSubscription.MediaQueries, media)
    )
  })
)

/**
 * Sets whether `query` matches through the fake, notifying listeners when the
 * value changes.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const set = (
  query: string,
  matches: boolean
): Effect.Effect<void, never, TestMediaQueries> =>
  TestMediaQueries.useSync((media) => media.set(query, matches))
