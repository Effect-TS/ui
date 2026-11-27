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
  /** `keySequences`': `handler` is a {@link Step} over the presses its listener holds. */
  readonly held?: true | undefined
}

/**
 * What a listener holds between events, such as a sequence's presses so far.
 *
 * @internal
 */
export interface Held {
  value?: unknown
}

/**
 * The handler of a listener with `held`: a message, `undefined`, or
 * {@link consumed} for a press that was taken without a message.
 *
 * @internal
 */
export type Step = (payload: any, held: Held) => unknown

/** @internal */
export const consumed: unique symbol = Symbol() as any

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
  // Reuse an observation frame only while its listener status is unknown.
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
 * A press a `held` listener consumed counts as handled and cancels under
 * `true`, with no message. A throw from the handler propagates.
 *
 * @internal
 */
export const run = (
  declared: Listener,
  payload: unknown,
  preventDefault: () => void,
  onMessage: (message: unknown, cancel: () => void) => void,
  held: Held
): void => {
  if (current !== undefined) current.heard ??= true
  const cancel = declared.preventDefault === true ? preventDefault : noop
  if (declared.preventDefault === "always") preventDefault()
  const message = declared.held
    ? (declared.handler as Step)(payload, held)
    : handle(declared.handler, payload)
  if (message !== undefined) {
    if (current !== undefined) current.handled = true
    if (message === consumed) cancel()
    else onMessage(message, cancel)
  }
}

const noop = () => {}
