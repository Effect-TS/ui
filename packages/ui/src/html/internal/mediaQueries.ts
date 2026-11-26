import * as Context from "effect/Context"
import type * as View from "../../View.ts"
import type * as HtmlSubscription from "../HtmlSubscription.ts"

/** @internal */
export const MediaQueries = Context.Reference<HtmlSubscription.MediaQueries>(
  "@effect/ui/html/HtmlSubscription/MediaQueries",
  { defaultValue: () => silent }
)

const silent: HtmlSubscription.MediaQueries = {
  matches: () => undefined,
  listen: () => () => {}
}

/** @internal */
export const mediaQuery: unique symbol = Symbol.for(
  "@effect/ui/html/HtmlSubscription/mediaQuery"
) as any

/** @internal */
export interface Listener {
  readonly query: string
  readonly handler: View.Handler<unknown, boolean>
}

/** @internal */
export const listenerOf = (subscription: object): Listener | undefined =>
  (subscription as { readonly [mediaQuery]?: Listener })[mediaQuery]
