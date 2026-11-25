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

/**
 * What one event's dispatch did: whether a listener heard it, `undefined`
 * when the source doesn't say, and whether a `run` in it produced a message.
 *
 * @internal
 */
export interface Dispatch {
  heard: boolean | undefined
  handled: boolean
}

let current: Dispatch | undefined

/**
 * Runs a test source's dispatch of one event. `fire` calls `heard` for
 * each listener it invokes. A `run` counts for the innermost dispatch only,
 * so an event a handler fires reports its own result.
 *
 * @internal
 */
export const dispatch = <A>(fire: (heard: () => void) => A): A => {
  const outer = current
  // The dispatch an `observe` starts before any handler ran is the one it observes.
  const own: Dispatch = outer !== undefined && outer.heard === undefined
    ? outer
    : { heard: false, handled: false }
  own.heard = false
  current = own
  try {
    return fire(() => {
      own.heard = true
    })
  } finally {
    current = outer
  }
}

/**
 * Runs `fire` and returns what the dispatch it starts did. With a source
 * that doesn't report through `dispatch`, `heard` is `undefined` unless a
 * `run` shows a listener heard it.
 *
 * @internal
 */
export const observe = (fire: () => void): Dispatch => {
  const outer = current
  const own: Dispatch = current = { heard: undefined, handled: false }
  try {
    fire()
  } finally {
    current = outer
  }
  return own
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
  if (current !== undefined) current.heard ??= true
  if (declared.preventDefault === "always") preventDefault()
  const message = handle(declared.handler, payload)
  if (message !== undefined) {
    if (current !== undefined) current.handled = true
    onMessage(message, declared.preventDefault === true ? preventDefault : noop)
  }
}

const noop = () => {}
