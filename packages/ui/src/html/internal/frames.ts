import type * as View from "../../View.ts"

export const frame: unique symbol = Symbol.for("@effect/ui/html/DomSubscription/animationFrame") as any

export const handlerOf = (subscription: object): View.Handler<unknown, number> | undefined =>
  (subscription as { readonly [frame]?: View.Handler<unknown, number> })[frame]
