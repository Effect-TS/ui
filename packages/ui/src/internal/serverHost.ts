/**
 * The host a server render runs on. It only keeps the node tree, which the
 * runtime needs to patch: the HTML comes from the rendered tree, not from
 * these nodes.
 *
 * @internal
 */
import type * as Kernel from "./kernel.ts"

const stub = {}
const make = () => stub
const noop = () => {}

const kernelHost: Kernel.Host<unknown> = {
  createElement: make,
  createText: make,
  createContainer: make,
  setText: noop,
  setAttr: noop,
  setProp: noop,
  setEvents: noop,
  insert: noop,
  remove: noop,
  parentOf: make,
  nextOf: () => null,
  runsMounts: false
}

/** @internal */
export const node = (): unknown => stub

/** @internal */
export const makeKernel = (): Kernel.Host<unknown> => kernelHost
