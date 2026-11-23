import type * as View from "../View.ts"

/**
 * What `handler` gives for `payload`: the message itself, or what the
 * function returns.
 *
 * @internal
 */
export const handle = <Msg, Payload>(handler: View.Handler<Msg, Payload>, payload: Payload): Msg | undefined =>
  typeof handler === "function" ? (handler as (payload: Payload) => Msg | undefined)(payload) : handler
