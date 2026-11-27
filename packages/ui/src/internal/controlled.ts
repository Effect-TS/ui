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

/** Writes the controlled values the renderer last set back to `node.props`. @internal */
export const restore = (
  node: { readonly props: Record<string, unknown> }
): void => {
  for (const [name, value] of wanted.get(node) ?? []) node.props[name] = value
}
