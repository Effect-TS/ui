import type { Insets } from "../../Native.ts"
import type { NativeNode } from "../../NativeHost.ts"

/**
 * A handler that sends nothing, for an event a module needs bound.
 *
 * @internal
 */
export const ignore = (): undefined => undefined

/**
 * Binds `handlers` on the builder, with `options` on the `carrier` event,
 * and keeps the element a native view, which a touch needs. Throws when the
 * caller's element already handles one of the events.
 *
 * @internal
 */
export const bind = (
  module: string,
  node: any,
  handlers: Readonly<Record<string, unknown>>,
  carrier: string,
  options: object | undefined
): any => {
  const own = node.handlers
  for (const name in handlers) {
    const handler = handlers[name]
    if (handler === undefined) continue
    if (own[name] !== undefined) {
      throw new Error(
        `${module}: the element already handles ${name}, which ${module} would replace. Pass it as an option`
      )
    }
    node = node.on(name, handler, name === carrier ? options : undefined)
  }
  return node.prop("collapsable", false)
}

/**
 * Normalizes a number to the same inset on each side.
 *
 * @internal
 */
export const insets = (
  slop: number | Insets | undefined
): Insets | undefined =>
  typeof slop === "number"
    ? { top: slop, left: slop, bottom: slop, right: slop }
    : slop

/**
 * The nearest element a touch on `n` presses: `n` or one around it that
 * handles `press` or `pressIn`.
 *
 * @internal
 */
export const pressed = (n: NativeNode | undefined): NativeNode | undefined => {
  while (
    n !== undefined && n.events?.handlers.press === undefined &&
    n.events?.handlers.pressIn === undefined
  ) n = n.parent
  return n
}
