import type * as View from "../View.ts"
import type * as Kernel from "./kernel.ts"

/** @internal */
export let loaded: ((inst: Kernel.Instance) => void) | undefined

/** @internal */
export const load = (start: (inst: Kernel.Instance) => void): void => {
  loaded = start
}

/** @internal */
export let html: View.HeadFold | undefined

/** @internal */
export const loadHtml = (fold: View.HeadFold): void => {
  html = fold
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
