/**
 * The host a server render runs on. It keeps nothing: the HTML comes from
 * the rendered tree, so every element and text is the one `node`.
 *
 * @internal
 */
import type * as Kernel from "./kernel.ts"

/** @internal */
export const node: unknown = {}

const same = () => node
const noop = () => {}

/** @internal */
export const host: Kernel.Host<unknown> = {
  createElement: same,
  createText: same,
  createContainer: same,
  setText: noop,
  setAttr: noop,
  setProp: noop,
  setEvents: noop,
  insert: noop,
  remove: noop,
  parentOf: same,
  nextOf: () => null,
  runsMounts: false
}
