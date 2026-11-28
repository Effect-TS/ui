/**
 * iOS swipe-back for a `StackSlide` stack: a swipe from the left edge drags
 * the top screen to the right, and letting go goes back, or puts it back.
 *
 * **Details**
 *
 * The swipe takes a touch that starts within `edge` points of the left
 * edge, 50 by default, and moves right. Each move sets the screens'
 * positions on the native driver, with no message and no render, so a busy
 * JS thread makes the screen lag the finger.
 *
 * Letting go past half the stack's width, counting the finger's speed,
 * runs the Router's Back. When a `Router.blocked` block is held, or the
 * swipe ends short, or another element takes the touch, the screens
 * spring back.
 *
 * It takes no swipe on Android, where the system's back gesture arrives as
 * Back and pops with the stack's transition.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Mount from "@effect/ui/Mount"
import * as Router from "@effect/ui/Router"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import type { NativeNode } from "../NativeHost.ts"
import { Pan } from "./Pan.ts"
import type { SwipeBack } from "./StackSlide.ts"

// The Router of each top screen that takes a swipe, by its key. None on
// Android.
const routers = new Map<string, Router.Router>()

const Follow = Mount.makeStream(
  "StackSwipe",
  { args: { key: Schema.String } },
  (node: NativeNode, { key }) =>
    node.host.os !== "ios" ? Stream.empty : Stream.callback<
      never,
      never,
      Router.Router
    >(() =>
      Router.Router.use((router) =>
        Effect.acquireRelease(
          Effect.sync(() => routers.set(key, router)),
          () => Effect.sync(() => routers.delete(key))
        )
      )
    )
)

/**
 * Makes the top screen of a `StackSlide` stack take a swipe from the
 * left edge that goes back.
 *
 * @stability experimental
 * @category gestures
 * @since 0.1.0
 */
export const swipeBack = (options?: {
  /** How far from the left edge a swipe can start, 50 points by default. */
  readonly edge?: number | undefined
}): SwipeBack<Router.Router> => {
  const edge = options?.edge ?? 50
  return {
    attach: (h, element, { key, move, ready, started, width }) =>
      Pan(h, {
        element,
        props: { axis: "x", capture: true },
        onStart: (g) =>
          ready && routers.has(key) && g.x0 < edge && g.dx > 0
            ? started
            : undefined,
        onMove: (g) => void move(Math.max(0, g.dx)),
        onEnd: (g) => {
          const router = routers.get(key)
          if (
            router === undefined || g.dx + g.vx * 200 < width / 2 ||
            Effect.runSync(router.back) === "blocked"
          ) move(0, true)
          return undefined
        },
        onCancel: () => void move(0, true)
      }).onMount(Follow({ key }).pipe(Mount.map(() => Component.noop)))
  }
}
