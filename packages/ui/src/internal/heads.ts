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

const customFolds = new WeakMap<Kernel.Tree, number>()

/** @internal */
export const hasCustomFold = (tree: Kernel.Tree): boolean =>
  (customFolds.get(tree) ?? 0) > 0

/** @internal */
export const trackFold = (inst: Kernel.Instance): void => {
  const tree = inst.tree
  customFolds.set(tree, (customFolds.get(tree) ?? 0) + 1)
  ;(inst.closers ??= []).push(() =>
    customFolds.set(tree, customFolds.get(tree)! - 1)
  )
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
