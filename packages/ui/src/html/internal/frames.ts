import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type * as View from "../../View.ts"
import type * as HtmlSubscription from "../HtmlSubscription.ts"

/** @internal */
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

/** @internal */
export const nextFrame: Effect.Effect<void> = AnimationFrames.use((source) =>
  Effect.callback<void>((resume) => {
    const off = source.listen(() => {
      off()
      resume(Effect.void)
    })
    return Effect.sync(off)
  })
)

export const frame: unique symbol = Symbol.for(
  "@effect/ui/html/HtmlSubscription/animationFrame"
) as any

export const handlerOf = (
  subscription: object
): View.Handler<unknown, number> | undefined =>
  (subscription as { readonly [frame]?: View.Handler<unknown, number> })[frame]
