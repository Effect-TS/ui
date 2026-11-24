import * as Context from "effect/Context"
import type * as View from "../../View.ts"
import type * as HtmlSubscription from "../HtmlSubscription.ts"

/**
 * `HtmlSubscription.AnimationFrames`, here so a host provides it without importing
 * `HtmlSubscription`, which loads what runs Subscriptions.
 *
 * @internal
 */
export const AnimationFrames = Context.Reference<
  HtmlSubscription.AnimationFrames
>(
  "@effect/ui/html/HtmlSubscription/AnimationFrames",
  { defaultValue: () => still }
)

const still: HtmlSubscription.AnimationFrames = {
  now: () => 0,
  listen: () => () => {}
}

export const frame: unique symbol = Symbol.for(
  "@effect/ui/html/HtmlSubscription/animationFrame"
) as any

export const handlerOf = (
  subscription: object
): View.Handler<unknown, number> | undefined =>
  (subscription as { readonly [frame]?: View.Handler<unknown, number> })[frame]
