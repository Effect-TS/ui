/**
 * What `HtmlSubscription.onDocument`, `onCustomEvent` and `onWindow` put on
 * their Subscription, read back by the runtime's attached listener and by the
 * test tools.
 *
 * @internal
 */
import * as Context from "effect/Context"
import { handle } from "../../internal/handler.ts"
import type * as View from "../../View.ts"
import type * as HtmlSubscription from "../HtmlSubscription.ts"

/** @internal */
export const GlobalEvents = Context.Reference<HtmlSubscription.GlobalEvents>(
  "@effect/ui/html/HtmlSubscription/GlobalEvents",
  { defaultValue: () => silent }
)

const silent: HtmlSubscription.GlobalEvents = { listen: () => () => {} }

/**
 * A document or window listener carries its declaration under this key.
 *
 * @internal
 */
export const listener: unique symbol = Symbol.for(
  "@effect/ui/html/HtmlSubscription/listener"
) as any

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

interface Tracked {
  readonly target: "document" | "window"
  readonly event: string
  heard: boolean
  handled: boolean
}

let tracked: Tracked | undefined

/**
 * Runs `f` and reports whether any matching `globalEvents.run` call inside it
 * was invoked (`heard`) and whether one produced a message (`handled`).
 *
 * @internal
 */
export const track = (
  target: "document" | "window",
  event: string,
  f: () => void
): { readonly heard: boolean; readonly handled: boolean } => {
  const current: Tracked = { target, event, heard: false, handled: false }
  const previous = tracked
  tracked = current
  try {
    f()
    return current
  } finally {
    if (
      previous !== undefined &&
      previous.target === target &&
      previous.event === event
    ) {
      previous.heard ||= current.heard
      previous.handled ||= current.handled
    }
    tracked = previous
  }
}

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
  const current = tracked !== undefined &&
      declared.target === tracked.target &&
      declared.event === tracked.event
    ? tracked
    : undefined
  if (current !== undefined) current.heard = true
  if (declared.preventDefault === "always") preventDefault()
  const message = handle(declared.handler, payload)
  if (message !== undefined) {
    if (current !== undefined) current.handled = true
    onMessage(message, declared.preventDefault === true ? preventDefault : noop)
  }
}

const noop = () => {}
