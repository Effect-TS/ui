import type * as View from "../View.ts"
import type * as Kernel from "./kernel.ts"

/** @internal */
export let loaded: ((inst: Kernel.Instance) => void) | undefined

/** @internal */
export const load = (start: (inst: Kernel.Instance) => void): void => {
  loaded = start
}

const folds: Record<string, View.HeadFold> = Object.create(null)

/** @internal */
export const defaults: Record<string, object> = Object.create(null)

/** @internal */
export const register = (name: string, fold: View.HeadFold): void => {
  folds[name] = fold
}

/** @internal */
export const foldOf = (
  elements: View.Vocabulary<any> | undefined
): View.HeadFold | undefined =>
  elements && (elements.head ?? folds[elements.name])
