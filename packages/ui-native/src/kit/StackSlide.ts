/**
 * A `Stack` transition that slides a pushed screen in from the trailing
 * edge and a popped one out, on the native driver, as UIKit's navigation
 * stack does.
 *
 * **Details**
 *
 * The screen under the top one moves a third of the way with it. Once a
 * transition ends, the covered screens are transparent, as in a stack
 * without one. A popped screen stays mounted, and covered, until it is
 * off the stack.
 *
 * With `swipeBack`, such as `StackSwipe.swipeBack()`, a swipe from the
 * left edge drags the top screen off. A stack with a transition but no
 * swipe bundles `Animation` and not `Pan`.
 *
 * **Example** (A NativeRouter stack that slides, with swipe-back on iOS)
 *
 * ```ts
 * import { Stack, StackSlide, StackSwipe } from "@effect/ui-native/kit"
 *
 * Stack(h, {
 *   entries: model.stack,
 *   screen: (s, { route }) => Page(s, { key: "page", props: { route } }),
 *   transition: StackSlide.slide({ swipeBack: StackSwipe.swipeBack() })
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Mount from "@effect/ui/Mount"
import * as UiSchema from "@effect/ui/UiSchema"
import { pipe } from "effect/Function"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Native from "../Native.ts"
import * as Animation from "./Animation.ts"
import { type Draw, type Entry, Screen } from "./internal/stack.ts"
import type { StackTransition } from "./Stack.ts"

/**
 * What a swipe-back is given to drag the top screen.
 *
 * **Details**
 *
 * - `width`: the stack's width.
 * - `ready`: no transition is running, so a swipe can start.
 * - `started`: the message that takes the touch.
 * - `move(x)`: shows the top screen `x` points to the right, and the one
 *   under it to match, without a render. With `settle`, they animate
 *   there with the stack's transition.
 * - `key`: unique to the top screen.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Swipe {
  readonly width: number
  readonly ready: boolean
  readonly started: unknown
  readonly move: (x: number, settle?: boolean) => void
  readonly key: string
}

/**
 * A gesture that drags the top screen off a sliding stack. Make one with
 * `StackSwipe.swipeBack`. `R` is what it needs from the context.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface SwipeBack<R = never> {
  /** Makes the top screen's element take the swipe. */
  readonly attach: (
    h: Native.H<any>,
    element: Native.ViewElement<any, any, Native.ViewEvents, "view">,
    swipe: Swipe
  ) => Native.ViewElement<any, any, Native.ViewEvents, "view">
  readonly "~requirements"?: ((_: never) => R) | undefined
}

const EntrySchema = Schema.Struct({ id: Schema.Number, route: Schema.Unknown })

const Message = UiSchema.TaggedEnum({
  Measured: { width: Schema.Number },
  Drew: {},
  Ended: { id: Schema.Number },
  Started: {},
  Scoped: { scope: Schema.String }
})

let scopes = 0

// Names the stack's screens apart from another mounted copy's, whose
// `h.id`s are the same, then reports each draw.
const Drawn = Mount.makeStream(
  "StackSlide",
  { args: { ids: Schema.String } },
  (_node, _args, changes) =>
    Stream.concat(
      Stream.succeed(Message.Scoped({ scope: String(scopes += 1) })),
      Stream.map(changes, () => Message.Drew())
    )
)

const fill = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0
} as const

// How far the screen under the top one sits to the left, by the width.
const under = -0.3

// The popped screens still shown: in `shown`, and not in `entries`.
const leavingOf = (
  entries: ReadonlyArray<Entry>,
  shown: ReadonlyArray<Entry>
): ReadonlyArray<Entry> =>
  shown.filter((e) => !entries.some((entry) => entry.id === e.id))

const Slide = Native.component({
  name: "StackSlide",
  props: Schema.Struct({
    entries: Schema.Array(EntrySchema),
    draw: Schema.declare((u): u is Draw => typeof u === "function"),
    transition: Schema.Any,
    swipe: Schema.Any
  }),
  model: Schema.Struct({
    width: Schema.Number,
    // The entries drawn at the last render, popped ones included.
    shown: Schema.Array(EntrySchema),
    // The top screen has arrived.
    settled: Schema.Boolean,
    // Unique to this mounted stack, once it is mounted.
    scope: Schema.String
  }),
  message: Message,
  restore: false
}).make({
  init: ($) => ({
    width: 0,
    shown: $.props.entries,
    settled: true,
    scope: ""
  }),
  update: {
    Measured: ($, { width }) => $.evolve({ width: () => width }),
    Drew: ($) => {
      const { entries } = $.props
      const top = entries[entries.length - 1]
      const fresh = !$.model.shown.some((e) => e.id === top?.id)
      // With no width, a popped screen isn't drawn, so it has no slide to end.
      return $.evolve({
        shown: () =>
          $.model.width === 0
            ? entries
            : [...entries, ...leavingOf(entries, $.model.shown)],
        settled: (settled) => $.model.width === 0 || (settled && !fresh)
      })
    },
    Ended: ($, { id }) => {
      const { entries } = $.props
      if (leavingOf(entries, $.model.shown).some((e) => e.id === id)) {
        return $.evolve({ shown: (shown) => shown.filter((e) => e.id !== id) })
      }
      return id === entries[entries.length - 1]?.id
        ? $.evolve({ settled: () => true })
        : $.model
    },
    Started: ($) => $.evolve({ settled: () => false }),
    Scoped: ($, { scope }) => $.evolve({ scope: () => scope })
  },
  view: (h, model) => {
    const { draw, entries } = h.props
    const transition = h.props.transition as Animation.Transition
    const swipe = h.props.swipe as SwipeBack | undefined
    const width = model.width
    const top = entries.length - 1
    const leaving = width === 0 ? [] : leavingOf(entries, model.shown)
    const fresh = !model.shown.some((e) => e.id === entries[top]?.id)
    const moving = !model.settled || fresh || leaving.length > 0
    const { scope } = model
    const name = (entry: Entry | undefined) => h.id(scope, entry?.id ?? "none")
    const screen = (entry: Entry, index: number, gone: boolean) => {
      const x = gone ? width : index === top ? 0 : under * width
      const shown = gone || index === top || (index === top - 1 && moving)
      const element = pipe(
        h.view.key(String(entry.id)).style(fill),
        Animation.named(name(entry)),
        // A top screen that mounts after the stack is measured was pushed.
        Animation.style({ transform: [{ translateX: x }] }, transition, {
          transform: [{ translateX: width }]
        }),
        Animation.style({ opacity: shown ? 1 : 0 }, Animation.immediate)
      )
        .on("animationEnd", Message.Ended({ id: entry.id }))
        .children(
          Screen(h, {
            key: String(entry.id),
            props: {
              entry,
              index,
              covered: gone || index !== top,
              fade: false,
              draw
            }
          })
        )
      if (
        swipe === undefined || gone || index !== top || top === 0 ||
        scope === ""
      ) {
        return element
      }
      const below = name(entries[top - 1])
      const self = name(entry)
      return swipe.attach(h, element, {
        width,
        ready: !moving,
        started: Message.Started(),
        key: self,
        move: (x, settle) => {
          const then = settle ? transition : undefined
          Animation.set(self, { transform: [{ translateX: x }] }, then)
          Animation.set(
            below,
            { transform: [{ translateX: under * (width - x) }] },
            then
          )
        }
      })
    }
    const drawn = [
      ...entries.map((entry, index) => screen(entry, index, false)),
      ...leaving.map((entry) => screen(entry, top + 1, true))
    ]
    return h.view
      .style({ flex: 1, overflow: "hidden" })
      .on("layout", ({ layout }) => Message.Measured({ width: layout.width }))
      .onMount(
        Drawn({ ids: [...entries, ...leaving].map((e) => e.id).join() })
      )
      .children(drawn)
  }
})

/**
 * Slides screens on and off the top with `transition`, a spring like
 * UIKit's by default. `swipeBack` adds a swipe that drags the top screen
 * off, such as `StackSwipe.swipeBack()`.
 *
 * @stability experimental
 * @category transitions
 * @since 0.1.0
 */
export const slide = <R = never>(options?: {
  readonly transition?: Animation.Transition | undefined
  readonly swipeBack?: SwipeBack<R> | undefined
}): StackTransition<R> => {
  const transition = options?.transition ?? Animation.spring({
    stiffness: 1000,
    damping: 500,
    mass: 3,
    overshootClamping: true
  })
  const swipe = options?.swipeBack
  return {
    draw: (h, entries, draw) =>
      h.view.style({ flex: 1 }).children(
        Slide(h, {
          key: "stack",
          props: { entries, draw, transition, swipe }
        })
      )
  }
}
