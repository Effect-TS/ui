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

/** Puts back each controlled value the renderer last set on `node` that an edit changed. @internal */
export const restore = (
  node: { readonly props: Record<string, unknown> }
): void => {
  const values = wanted.get(node)
  if (values === undefined) return
  for (const [name, value] of values) {
    if (node.props[name] !== value) node.props[name] = value
  }
}
