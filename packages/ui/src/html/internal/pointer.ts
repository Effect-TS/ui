/**
 * How a DOM event's pointer type and modifier keys become payload fields,
 * shared by the browser host and `Canvas`.
 *
 * @internal
 */
import type * as Html from "../Html.ts"

/**
 * What a pointer event's `pointerType` names, or `undefined` for an event
 * with none, such as a `mousedown` in a browser that sends it as a plain
 * `MouseEvent`, or a type no browser sends today.
 *
 * @internal
 */
export const pointerTypeOf = (event: Event): Html.PointerType | undefined => {
  const type = (event as { readonly pointerType?: unknown }).pointerType
  return type === "mouse" || type === "touch" || type === "pen" || type === "" ? type : undefined
}

/** @internal */
export const modifiers = (event: Event) => {
  const e = event as KeyboardEvent
  return { shift: e.shiftKey === true, ctrl: e.ctrlKey === true, alt: e.altKey === true, meta: e.metaKey === true }
}
