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

/**
 * The other events `Html.EventsOf` types, which bubble even when a script
 * dispatches one without `bubbles`, unless it's a `CustomEvent`. An event of
 * any other name that doesn't bubble reaches only its target.
 *
 * @internal
 */
export const bubblingEvents: ReadonlySet<string> = new Set([
  "click",
  "dblclick",
  "contextmenu",
  "mousedown",
  "mouseup",
  "pointerdown",
  "keydown",
  "keyup",
  "focusin",
  "focusout",
  "dragstart",
  "dragend",
  "dragenter",
  "dragleave",
  "dragover",
  "drop",
  "paste",
  "input",
  "change",
  "compositionend",
  "submit",
  "reset"
])
