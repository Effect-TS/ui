import type * as View from "../../View.ts"

/** @internal */
export const visibility: unique symbol = Symbol.for(
  "@effect/ui/html/HtmlSubscription/visibility"
) as any

/** @internal */
export const connectivity: unique symbol = Symbol.for(
  "@effect/ui/html/HtmlSubscription/connectivity"
) as any

/** @internal */
export const visibilityHandlerOf = (
  subscription: object
): View.Handler<unknown, boolean> | undefined =>
  (subscription as {
    readonly [visibility]?: View.Handler<unknown, boolean>
  })[visibility]

/** @internal */
export const connectivityHandlerOf = (
  subscription: object
): View.Handler<unknown, boolean> | undefined =>
  (subscription as {
    readonly [connectivity]?: View.Handler<unknown, boolean>
  })[connectivity]
