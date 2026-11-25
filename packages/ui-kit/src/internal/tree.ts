import * as View from "@effect/ui/View"
import { withTokens } from "./attributes.ts"

export type Rewrite = (
  node: View.Node<any, any>
) => View.Node<any, any> | undefined

export const rewrite = <N extends View.Node<any, any>>(
  node: N,
  f: Rewrite
): N => {
  const replaced = f(node)
  if (replaced !== undefined) return replaced as N
  if (node._tag !== "Element") return node
  let children: Array<View.Node<any, any>> | undefined
  node.children.forEach((child, i) => {
    const next = rewrite(child, f)
    if (children !== undefined) children.push(next)
    else if (next !== child) children = [...node.children.slice(0, i), next]
  })
  return children === undefined ? node : { ...node, children }
}

export const find = (
  node: View.Node<any, any>,
  f: (element: View.Element<any, any>) => boolean
): View.Element<any, any> | undefined => {
  for (const child of View.nodes(node)) {
    if (child._tag === "Element" && f(child)) return child
  }
  return undefined
}

export const withAttr = <E extends View.Element<any, any>>(
  element: E,
  name: string,
  value: string | undefined
): E => {
  if (element.attrs[name] === value) return element
  const attrs = { ...element.attrs }
  if (value === undefined) delete attrs[name]
  else attrs[name] = value
  return { ...element, attrs }
}

export const layerOf = (
  builder: { readonly owned: ReadonlyArray<View.Owned> }
): View.Owned => builder.owned[builder.owned.length - 1]!

type Layers = ReadonlySet<View.Owned> | ReadonlyMap<View.Owned, unknown>

export const carries = (
  element: View.Element<any, any>,
  layers: Layers
): boolean => element.owned?.some((layer) => layers.has(layer)) === true

export const setTokensOn = <N extends View.Node<any, any>>(
  node: N,
  layers: ReadonlyMap<View.Owned, string | undefined>,
  name: string,
  value: string | undefined
): N =>
  rewrite(
    node,
    (element) => {
      if (element._tag !== "Element") return undefined
      const layer = element.owned?.find((l) => layers.has(l))
      return layer === undefined
        ? undefined
        : withAttr(element, name, withTokens(layers.get(layer), value))
    }
  )
