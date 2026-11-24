/**
 * The hosts `BrowserHost.makeHost` made, which the kernel's test runtime replaces with its own DOM host.
 *
 * @internal
 */
export const made = new WeakSet<object>()

/**
 * What closes a host's modal dialogs and auto popovers while a tool pauses a root, and shows them again.
 *
 * @internal
 */
export interface Holding {
  readonly held: () => boolean
  readonly hold: (container: globalThis.Element) => void
  readonly release: () => void
}

/**
 * Each browser host's `Holding`, which the kernel's test runtime replaces with its DOM host's.
 *
 * @internal
 */
export const holds = new WeakMap<object, Holding>()
