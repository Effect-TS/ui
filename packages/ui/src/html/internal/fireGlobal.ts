/**
 * How the test tools deliver a document or window event: `HtmlScene`'s
 * `fireDocument` and `fireWindow`, and `TestGlobalEvents.fire`.
 *
 * @internal
 */
import * as scene from "../../internal/scene.ts"

/** @internal */
export type Listener = (payload: unknown, preventDefault: () => void) => void

const { alt, ctrl, meta, shift } = scene.pointer
const key = { key: "", shift, ctrl, alt, meta, composing: false, selectionStart: null, selectionEnd: null }
const pointerEvents: ReadonlySet<string> = new Set(["click", "mousedown", "mouseup", "pointerup", "pointercancel"])

/**
 * Fires `event` at the capture listeners, then at the bubble ones, and
 * returns whether one cancelled the default.
 *
 * `listening` is asked for a phase's listeners as the phase starts, as a
 * browser reads them, so a bubble listener the capture phase added hears the
 * event. Each gets `given` over a key's or a pointer's defaults, with
 * `defaultPrevented` true when given so or once an earlier listener
 * cancelled.
 *
 * @internal
 */
export const fire = (
  event: string,
  given: object | undefined,
  listening: (capture: boolean) => Iterable<Listener>
): boolean => {
  const defaults = event === "keydown" || event === "keyup"
    ? key
    : pointerEvents.has(event)
    ? scene.pointer
    : undefined
  const prevented = (given as { readonly defaultPrevented?: unknown } | undefined)?.defaultPrevented === true
  let cancelled = false
  const preventDefault = () => {
    cancelled = true
  }
  for (const capture of [true, false]) {
    for (const listener of listening(capture)) {
      listener({ ...defaults, ...given, defaultPrevented: prevented || cancelled }, preventDefault)
    }
  }
  return cancelled
}
