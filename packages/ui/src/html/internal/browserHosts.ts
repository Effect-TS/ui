/** @internal */
export interface Holding {
  readonly held: () => boolean
  readonly hold: (container: globalThis.Element) => void
  readonly release: (container: globalThis.Element) => void
}

/** @internal */
export const holds = new WeakMap<object, Holding>()
