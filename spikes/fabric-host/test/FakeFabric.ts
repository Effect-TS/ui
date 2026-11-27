/**
 * A stand-in for `nativeFabricUIManager` with Fabric's rule that a committed
 * (sealed) node is never mutated, and a count of calls by method.
 */
import type { UIManager } from "../src/FabricHost.ts"

export interface ShadowNode {
  readonly tag: number
  readonly viewName: string
  readonly props: Record<string, unknown>
  readonly children: Array<ShadowNode>
  readonly handle: unknown
  sealed: boolean
}

const parents = (
  nodes: ReadonlyArray<ShadowNode>,
  parent = 0,
  out = new Map<number, number>()
) => {
  for (const n of nodes) {
    out.set(n.tag, parent)
    parents(n.children, n.tag, out)
  }
  return out
}

export const make = () => {
  const calls: Record<string, number> = {}
  const count = (name: string) => (calls[name] = (calls[name] ?? 0) + 1)
  let committed: ReadonlyArray<ShadowNode> = []
  let mounted = new Map<number, number>()
  let handler:
    | ((handle: unknown, type: string, payload: unknown) => void)
    | undefined
  const merge = (props: Record<string, unknown>, diff: object) => {
    const out = { ...props }
    for (const [k, v] of Object.entries(diff)) {
      if (v === null) delete out[k]
      else out[k] = v
    }
    return out
  }
  const tags = new Set<number>()
  const seal = (n: ShadowNode) => {
    if (n.sealed) return
    n.sealed = true
    n.children.forEach(seal)
  }
  const ui: UIManager = {
    createNode(tag, viewName, _rootTag, props, handle) {
      count("createNode")
      if (tags.has(tag)) throw new Error(`createNode reuses tag ${tag}`)
      tags.add(tag)
      return {
        tag,
        viewName,
        props: { ...props },
        children: [],
        handle,
        sealed: false
      }
    },
    cloneNodeWithNewProps(node: any, props) {
      count("cloneNodeWithNewProps")
      return {
        ...node,
        props: merge(node.props, props),
        children: [...node.children],
        sealed: false
      }
    },
    cloneNodeWithNewChildren(node: any) {
      count("cloneNodeWithNewChildren")
      return { ...node, children: [], sealed: false }
    },
    cloneNodeWithNewChildrenAndProps(node: any, props) {
      count("cloneNodeWithNewChildrenAndProps")
      return {
        ...node,
        props: merge(node.props, props),
        children: [],
        sealed: false
      }
    },
    appendChild(parent: any, child: any) {
      count("appendChild")
      if (parent.sealed) throw new Error("appendChild on a sealed node")
      parent.children.push(child)
      return parent
    },
    createChildSet() {
      count("createChildSet")
      return []
    },
    appendChildToSet(set: any, child) {
      count("appendChildToSet")
      set.push(child)
    },
    completeRoot(_rootTag, set: any) {
      count("completeRoot")
      set.forEach(seal)
      // Fabric deletes a tag that moves to another parent in one commit.
      const next = parents(set)
      for (const [tag, parent] of next) {
        const before = mounted.get(tag)
        if (before !== undefined && before !== parent) {
          throw new Error(`tag ${tag} moved from parent ${before} to ${parent}`)
        }
      }
      mounted = next
      committed = set
    },
    registerEventHandler(h) {
      handler = h
    }
  }
  return {
    ui,
    calls,
    reset: () => {
      for (const k in calls) delete calls[k]
    },
    committed: () => committed,
    emit: (node: ShadowNode, type: string, payload: unknown) =>
      handler!(node.handle, type, payload)
  }
}

/** The committed tree as text: `<RCTView>` children, raw text as its string. */
export const print = (nodes: ReadonlyArray<ShadowNode>): string =>
  nodes.map((n) =>
    n.viewName === "RCTRawText"
      ? String(n.props.text)
      : `<${n.viewName}>${print(n.children)}</>`
  ).join("")

export const find = (
  nodes: ReadonlyArray<ShadowNode>,
  test: (n: ShadowNode) => boolean
): ShadowNode | undefined => {
  for (const n of nodes) {
    if (test(n)) return n
    const found = find(n.children, test)
    if (found) return found
  }
}
