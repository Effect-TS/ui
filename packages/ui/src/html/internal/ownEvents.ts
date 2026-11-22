/** @internal */

/**
 * Events that don't bubble: only the element they happen on gets them.
 *
 * @internal
 */
export const ownEvents: ReadonlySet<string> = new Set([
  "focus",
  "blur",
  "mouseenter",
  "mouseleave",
  "scroll",
  "toggle",
  "load",
  "error",
  "close",
  "cancel"
])
