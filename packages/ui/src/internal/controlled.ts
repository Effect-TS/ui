/** @internal */

const wanted = new WeakMap<object, Map<string, unknown>>()

/** @internal */
export const want = (node: object, name: string, value: unknown): void => {
  if (value === undefined) {
    wanted.get(node)?.delete(name)
    return
  }
  let values = wanted.get(node)
  if (values === undefined) wanted.set(node, values = new Map())
  values.set(name, value)
}

/** @internal */
export const wantedOf = (
  node: object
): ReadonlyMap<string, unknown> | undefined => wanted.get(node)
