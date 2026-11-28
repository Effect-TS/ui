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
 * Screens switch without a transition.
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
import * as Component from "@effect/ui/Component"
import * as Head from "@effect/ui/Head"
import * as Mount from "@effect/ui/Mount"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Native from "../Native.ts"
import type { NativeNode } from "../NativeHost.ts"
import { ScreenState } from "./internal/screen.ts"

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
export interface StackOptions<A, R> {
  /** The entries, the top one last. */
  readonly entries: ReadonlyArray<StackEntry<A>>
  /** Draws an entry's screen. */
  readonly screen: (
    s: Native.H<never>,
    entry: StackEntry<A>
  ) => Native.NoTextInput<never, R>
}

const Track = Mount.makeStream(
  "Screen",
  { args: { covered: Schema.Boolean, index: Schema.Number } },
  (node: NativeNode, args, changes) =>
    Stream.callback<never, never, ScreenState | Native.Host>(() =>
      Effect.gen(function*() {
        const screen = yield* ScreenState
        const host = yield* Native.Host
        // Focus moves to a screen that comes to the top: one that was
        // covered, or one pushed over the first.
        const show = (covered: boolean) => {
          if (screen.covered && !covered) host.accessibilityEvent(node, "focus")
          screen.covered = covered
        }
        screen.covered = args.index > 0
        show(args.covered)
        yield* Effect.forkScoped(
          Stream.runForEach(
            changes,
            ({ covered }) => Effect.sync(() => show(covered))
          )
        )
      })
    )
)

const hidden = [Head.reduce(() => ({ title: undefined }))]
const none: ReadonlyArray<Head.Entry> = []

const Draw = Schema.declare(
  (u): u is (s: Native.H<never>, entry: StackEntry<unknown>) => any =>
    typeof u === "function"
)

const Screen = Component.provide(
  Native.component({
    name: "Screen",
    props: Schema.Struct({
      entry: Schema.Struct({ id: Schema.Number, route: Schema.Unknown }),
      index: Schema.Number,
      covered: Schema.Boolean,
      draw: Draw
    }),
    model: Schema.Null,
    message: Schema.Never,
    restore: false
  }).make({
    init: () => null,
    update: ($) => $.model,
    // Only the top screen's title reaches the head.
    head: ($) => $.props.covered ? hidden : none,
    view: (s) => {
      const { covered, draw, entry, index } = s.props
      return s.view
        .style({
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: covered ? 0 : 1,
          pointerEvents: covered ? "none" : "auto"
        })
        .prop("collapsable", false)
        .prop(
          "importantForAccessibility",
          covered ? "no-hide-descendants" : "auto"
        )
        .prop("accessibilityElementsHidden", covered)
        .onMount(
          Track({ covered, index }).pipe(Mount.map(() => Component.noop))
        )
        .children(draw(s as Native.H<never>, entry))
    }
  }),
  () =>
    Layer.effect(
      ScreenState,
      Effect.map(Effect.serviceOption(ScreenState), (parent) => ({
        covered: true,
        parent: Option.getOrUndefined(parent)
      }))
    )
)

/**
 * Draws `entries` as a stack of screens, the last on top.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Stack = <Msg, A, R = never>(
  h: Native.H<Msg>,
  options: StackOptions<A, R>
): Native.ViewElement<Msg, R, Native.ViewEvents, "view"> => {
  const { entries, screen } = options
  const top = entries.length - 1
  return h.view.style({ flex: 1 }).children(
    entries.map((entry, index) =>
      Screen(h, {
        key: String(entry.id),
        props: {
          entry,
          index,
          covered: index < top,
          draw: screen as (
            s: Native.H<never>,
            entry: StackEntry<unknown>
          ) => any
        }
      })
    )
  ) as any
}
