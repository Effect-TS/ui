import type * as View from "@effect/ui/View"

export type Rewrite = (node: View.Node<any, any>) => View.Node<any, any> | undefined

export const rewrite = <N extends View.Node<any, any>>(node: N, f: Rewrite): N => {
  const replaced = f(node)
  if (replaced !== undefined) return replaced as N
  if (node._tag !== "Element") return node
  let changed = false
  const children = node.children.map((child) => {
    const next = rewrite(child, f)
    changed ||= next !== child
    return next
  })
  return changed ? { ...node, children } : node
}

export const find = (
  node: View.Node<any, any>,
  f: (element: View.Element<any, any>) => boolean
): View.Element<any, any> | undefined => {
  if (node._tag !== "Element") return undefined
  if (f(node)) return node
  for (const child of node.children) {
    const found = find(child, f)
    if (found !== undefined) return found
  }
  return undefined
}

export const withAttr = <E extends View.Element<any, any>>(element: E, name: string, value: string | undefined): E => {
  if (element.attrs[name] === value) return element
  const attrs = { ...element.attrs }
  if (value === undefined) delete attrs[name]
  else attrs[name] = value
  return { ...element, attrs }
}
