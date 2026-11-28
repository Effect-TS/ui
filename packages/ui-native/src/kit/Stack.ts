/**
 * A stack of screens, such as the history entries of `NativeRouter`, with
 * the last one on top.
 *
 * **Details**
 *
 * `Stack` is a view function. It draws every entry on its own screen, keyed
 * by the entry's `id`, so a covered screen stays mounted: its Models,
 * scroll offsets and text keep their state, and Back shows it as it was.
 * Each screen fills the stack. A covered one is transparent, takes no
 * touches and is hidden from the screen reader.
 *
 * `screen` draws an entry with the screen's own `h`, so what it draws
 * sends no messages to the stack's parent: draw a component per route,
 * which navigates with `Link` or the Router's Commands. `screen` runs
 * whenever the parent renders.
 *
 * A covered screen keeps running its Subscriptions, so a page can gate the
 * work it only needs on top. Its `BackHandler.onPress` takes no press, nor
 * does one on a stack drawn inside it.
 * When a screen comes to the top after the first, the stack moves the
 * screen reader's focus to it.
 *
 * Screens switch at once. A `transition` moves them instead:
 * `StackSlide.slide` slides them in and out on the native driver, and can
 * add iOS swipe-back. A stack without one bundles neither `Animation` nor
 * `Pan`.
 *
 * **Example** (The screens of a NativeRouter)
 *
 * ```ts
 * import { Stack } from "@effect/ui-native/kit"
 *
 * Stack(h, {
 *   entries: model.stack,
 *   screen: (s, { route }) =>
 *     AppRoute.match(route, {
 *       Home: () => HomeScreen(s, { key: "home" }),
 *       Person: ({ params }) => PersonScreen(s, { key: "person", props: params })
 *     })
 * }).style({ backgroundColor: "white" })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Native from "../Native.ts"
import { type Draw, Screen } from "./internal/stack.ts"

/**
 * An entry of a stack: an `id` that stays the same while the entry is in
 * the stack, and what its screen draws.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface StackEntry<A> {
  readonly id: number
  readonly route: A
}

/**
 * The options of `Stack`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface StackOptions<A, R, T = never> {
  /** The entries, the top one last. */
  readonly entries: ReadonlyArray<StackEntry<A>>
  /** Draws an entry's screen. */
  readonly screen: (
    s: Native.H<never>,
    entry: StackEntry<A>
  ) => Native.NoTextInput<never, R>
  /** Moves screens on and off the top, such as `StackSlide.slide()`. */
  readonly transition?: StackTransition<T> | undefined
}

/**
 * How a stack moves screens on and off the top. Make one with
 * `StackSlide.slide`. `R` is what it needs from the context.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface StackTransition<R = never> {
  /** Draws the stack. */
  readonly draw: (
    h: Native.H<any>,
    entries: ReadonlyArray<StackEntry<unknown>>,
    screen: (s: Native.H<never>, entry: StackEntry<unknown>) => any
  ) => Native.ViewElement<any, any, Native.ViewEvents, "view">
  readonly "~requirements"?: ((_: never) => R) | undefined
}

/**
 * Draws `entries` as a stack of screens, the last on top.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Stack = <Msg, A, R = never, T = never>(
  h: Native.H<Msg>,
  options: StackOptions<A, R, T>
): Native.ViewElement<Msg, R | T, Native.ViewEvents, "view"> => {
  const { entries, transition } = options
  const screen = options.screen as Draw
  if (transition !== undefined) {
    return transition.draw(h, entries, screen) as any
  }
  const top = entries.length - 1
  return h.view.style({ flex: 1 }).children(
    entries.map((entry, index) =>
      Screen(h, {
        key: String(entry.id),
        props: { entry, index, covered: index < top, fade: true, draw: screen }
      })
    )
  ) as any
}
