import type * as Html from "../Html.ts"

export const pointerTypeOf = (event: Event): Html.PointerType | undefined => {
  const type = (event as { readonly pointerType?: unknown }).pointerType
  return type === "mouse" || type === "touch" || type === "pen" || type === "" ? type : undefined
}

export const modifiers = (event: Event) => {
  const e = event as KeyboardEvent
  return { shift: e.shiftKey === true, ctrl: e.ctrlKey === true, alt: e.altKey === true, meta: e.metaKey === true }
}
