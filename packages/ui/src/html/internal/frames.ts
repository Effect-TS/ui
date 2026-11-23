/**
 * What `DomSubscription.onAnimationFrame` puts on its Subscription, read
 * back by the runtime's attached listener and by `HtmlScene`'s `frame`.
 *
 * @internal
 */
import type * as View from "../../View.ts"

/**
 * A frame Subscription carries its handler under this key.
 *
 * @internal
 */
export const frame: unique symbol = Symbol.for("@effect/ui/html/DomSubscription/animationFrame") as any

/**
 * The handler of a frame Subscription, or `undefined` for any other.
 *
 * @internal
 */
export const handlerOf = (subscription: object): View.Handler<unknown, number> | undefined =>
  (subscription as { readonly [frame]?: View.Handler<unknown, number> })[frame]
