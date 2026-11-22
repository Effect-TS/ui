/**
 * What `DomSubscription.onDocument` and `DomSubscription.onWindow` put on
 * their Subscription, read back by the runtime's attached listener and by the
 * test tools.
 *
 * @internal
 */
import type * as View from "../../View.ts"

/**
 * A document or window listener carries its declaration under this key.
 *
 * @internal
 */
export const listener: unique symbol = Symbol.for("@effect/ui/html/DomSubscription/listener") as any

/** @internal */
export interface Listener {
  readonly target: "document" | "window"
  readonly event: string
  readonly capture: boolean
  readonly handler: View.Handler<unknown, any>
  readonly preventDefault: boolean | "always" | undefined
}

/**
 * The listener a Subscription declares, or `undefined` for any other.
 *
 * @internal
 */
export const listenerOf = (subscription: object): Listener | undefined =>
  (subscription as { readonly [listener]?: Listener })[listener]

/**
 * Runs `declared`'s handler with `payload`, as the browser host runs an
 * element's: `preventDefault: "always"` cancels first, and `true` makes
 * `cancel` the second argument of `onMessage`, called only for a message.
 * A throw from the handler propagates.
 *
 * @internal
 */
export const run = (
  declared: Listener,
  payload: unknown,
  preventDefault: () => void,
  onMessage: (message: unknown, cancel: () => void) => void
): void => {
  if (declared.preventDefault === "always") preventDefault()
  const { handler } = declared
  const message = typeof handler === "function" ? (handler as (payload: unknown) => unknown)(payload) : handler
  if (message !== undefined) onMessage(message, declared.preventDefault === true ? preventDefault : noop)
}

const noop = () => {}
