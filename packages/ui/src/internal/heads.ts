import type * as View from "../View.ts"
import type * as Kernel from "./kernel.ts"

/** @internal */
export let loaded: ((inst: Kernel.Instance) => void) | undefined

/** @internal */
export const load = (start: (inst: Kernel.Instance) => void): void => {
  loaded = start
}

/** @internal */
export let fold:
  | ((elements: View.Vocabulary<any>) => View.HeadFold | undefined)
  | undefined

/** @internal */
export const register = (name: string, headFold: View.HeadFold): void => {
  const prev = fold
  fold = (elements) => (elements.name === name ? headFold : prev?.(elements))
}

/** @internal */
export const emptyHtml = {
  title: undefined,
  meta: [],
  links: [],
  jsonLd: [],
  html: { lang: undefined, dir: undefined, class: [], data: {} },
  body: { class: [], data: {} }
}

/** @internal */
export const fallback = (
  elements: View.Vocabulary<any> | undefined,
  value: unknown
): unknown =>
  elements?.name === "html" &&
    (value as { readonly meta?: unknown }).meta === undefined
    ? { ...emptyHtml, ...(value as object) }
    : value
