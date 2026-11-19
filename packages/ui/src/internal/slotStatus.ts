/**
 * What a slot's `fallback` is passed where the runtime records a status, shared by the runtime and the
 * replay of its log.
 *
 * @internal
 */
import * as Cause from "effect/Cause"

/**
 * What a slot's `fallback` gets for a handled Layer failure on the server, and on a client that adopts
 * it. The server's cause isn't shipped, as it can hold what the page must not show, so both sides pass
 * this one: a fallback that shows its cause, `Cause.pretty` included, renders the same nodes on each, and
 * the client adopts them.
 *
 * @internal
 */
export const serverFailure = (): Cause.Cause<unknown> => {
  const error = new Error("[@effect/ui] A provided Layer failed on the server")
  // No stack: where it was made differs between the server and the client, and isn't the page's to show.
  error.stack = `${error.name}: ${error.message}`
  return Cause.die(error)
}
