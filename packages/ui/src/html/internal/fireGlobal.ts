/**
 * How the test tools deliver a document or window event: `HtmlScene`'s
 * `fireDocument`, `fireCustomEvent` and `fireWindow`, and
 * `TestGlobalEvents`' `fire` and `fireCustomEvent`.
 *
 * @internal
 */
import * as scene from "../../internal/scene.ts"
import * as defaults from "./defaults.ts"

/** @internal */
export type Listener = (payload: unknown, preventDefault: () => void) => void

/** @internal */
export const detailed: unique symbol = Symbol.for(
  "@effect/ui/html/testing/TestGlobalEvents/detailed"
) as any

/** @internal */
export interface FireResult {
  readonly heard: boolean
  readonly cancelled: boolean
}

const key = defaults.keyPayload("", undefined)
const pointerEvents: ReadonlySet<string> = new Set([
  "click",
  "mousedown",
  "mouseup",
  "pointerup",
  "pointercancel"
])

/**
 * Fires `event` at the capture listeners, then at the bubble ones, and
 * returns whether any listener heard it and whether one cancelled the default.
 *
 * `listening` is asked for a phase's listeners as the phase starts, as a
 * browser reads them, so a bubble listener the capture phase added hears the
 * event. Each gets `given` over a key's or a pointer's defaults, with
 * `defaultPrevented` true when given so or once an earlier listener
 * cancelled.
 *
 * @internal
 */
export const fireDetailed = (
  event: string,
  given: object | undefined,
  listening: (capture: boolean) => Iterable<Listener>
): FireResult => {
  const defaults = event === "keydown" || event === "keyup"
    ? key
    : pointerEvents.has(event)
    ? scene.pointer
    : undefined
  const prevented =
    (given as { readonly defaultPrevented?: unknown } | undefined)
      ?.defaultPrevented === true
  let heard = false
  let cancelled = false
  const preventDefault = () => {
    cancelled = true
  }
  for (const capture of [true, false]) {
    for (const listener of listening(capture)) {
      heard = true
      listener({
        ...defaults,
        ...given,
        defaultPrevented: prevented || cancelled
      }, preventDefault)
    }
  }
  return { heard, cancelled }
}

/**
 * Fires `event` at the capture listeners, then at the bubble ones, and
 * returns whether one cancelled the default.
 *
 * @internal
 */
export const fire = (
  event: string,
  given: object | undefined,
  listening: (capture: boolean) => Iterable<Listener>
): boolean => fireDetailed(event, given, listening).cancelled

/** @internal */
export const fireOn = (
  events: {
    readonly fire: (target: any, event: any, payload?: any) => boolean
    readonly [detailed]?: (
      target: string,
      event: string,
      payload: object | undefined
    ) => FireResult
  },
  target: string,
  event: string,
  payload: object | undefined
): FireResult =>
  events[detailed] !== undefined
    ? events[detailed](target, event, payload)
    : { heard: true, cancelled: events.fire(target, event, payload) }

export const custom = (
  given: { readonly detail?: unknown } | undefined
): object => ({
  ...given,
  detail: given?.detail ?? null
})
