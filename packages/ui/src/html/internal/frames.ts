/**
 * What `DomSubscription.onAnimationFrame` puts on its Subscription, read
 * back by the runtime's attached listener and by `HtmlScene`'s `frame`.
 *
 * @internal
 */
import type * as View from "../../View.ts"

/**
 * A frame Subscription carries its declaration under this key.
 *
 * @internal
 */
export const frame: unique symbol = Symbol.for("@effect/ui/html/DomSubscription/animationFrame") as any

/** @internal */
export interface Declared {
  readonly handler: View.Handler<unknown, number>
}

/**
 * The declaration of a frame Subscription, or `undefined` for any other.
 *
 * @internal
 */
export const declaredOf = (subscription: object): Declared | undefined =>
  (subscription as { readonly [frame]?: Declared })[frame]

/**
 * What `declared`'s handler gives for a frame `delta` ms after the last.
 *
 * @internal
 */
export const run = (declared: Declared, delta: number): unknown => {
  const { handler } = declared
  return typeof handler === "function" ? (handler as (delta: number) => unknown)(delta) : handler
}
