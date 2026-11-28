/**
 * A stand-in for `nativeFabricUIManager`. It keeps Fabric's rules that a
 * committed (sealed) node never changes and that a tag keeps the parent it
 * was first appended to, and counts calls by method.
 */
import * as Native from "@effect/ui-native/Native"
import * as NativeHost from "@effect/ui-native/NativeHost"
import type { UIManager } from "@effect/ui-native/NativeHost"
import * as Renderer from "@effect/ui/Renderer"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Scope from "effect/Scope"

export interface ShadowNode {
  readonly tag: number
  readonly viewName: string
  readonly props: Record<string, unknown>
  readonly children: Array<ShadowNode>
  readonly handle: unknown
  sealed: boolean
}

export const make = () => {
  const calls: Record<string, number> = {}
  const commands: Array<readonly [number, string, ReadonlyArray<unknown>]> = []
  const accessibilityEvents: Array<readonly [number, string]> = []
  const responders: Array<readonly [number, boolean, boolean]> = []
  const rects = new Map<number, readonly [number, number, number, number]>()
  const count = (name: string) => (calls[name] = (calls[name] ?? 0) + 1)
  // Fabric asserts this in ShadowNodeFamily::setParent.
  const parents = new Map<number, number>()
  const adopt = (parentTag: number, child: ShadowNode) => {
    const before = parents.get(child.tag)
    if (before !== undefined && before !== parentTag) {
      throw new Error(
        `tag ${child.tag} moved from parent ${before} to ${parentTag}`
      )
    }
    parents.set(child.tag, parentTag)
  }
  let committed: ReadonlyArray<ShadowNode> = []
  // The LayoutAnimation configured for the next completeRoot, and each one's.
  let layout: object | undefined
  const layouts: Array<object | undefined> = []
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
  const seal = (n: ShadowNode) => {
    if (n.sealed) return
    n.sealed = true
    n.children.forEach(seal)
  }
  const ui: UIManager = {
    createNode(tag, viewName, _rootTag, props, handle) {
      count("createNode")
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
      adopt(parent.tag, child)
      parent.children.push(child)
      return parent
    },
    createChildSet(rootTag) {
      count("createChildSet")
      return Object.assign([], { rootTag })
    },
    appendChildToSet(set: any, child: any) {
      count("appendChildToSet")
      adopt(set.rootTag, child)
      set.push(child)
    },
    completeRoot(_rootTag, set: any) {
      count("completeRoot")
      set.forEach(seal)
      committed = set
      layouts.push(layout)
      layout = undefined
    },
    registerEventHandler(h) {
      handler = h
    },
    dispatchCommand(node: any, command, args) {
      commands.push([node.tag, command, args])
    },
    getBoundingClientRect(node: any) {
      return rects.get(node.tag)
    },
    sendAccessibilityEvent(node: any, type) {
      accessibilityEvents.push([node.tag, type])
    },
    setIsJSResponder(node: any, isResponder, block) {
      responders.push([node.tag, isResponder, block])
    },
    configureNextLayoutAnimation(config) {
      count("configureNextLayoutAnimation")
      layout = config
    }
  }
  return {
    ui,
    calls,
    commands,
    accessibilityEvents,
    responders,
    /** The LayoutAnimation config of each completeRoot, `undefined` for none. */
    layouts,
    /** Places the view with `tag` on screen, for hit tests and `measure`. */
    place: (n: ShadowNode, rect: readonly [number, number, number, number]) =>
      rects.set(n.tag, rect),
    reset: () => {
      for (const k in calls) delete calls[k]
    },
    committed: () => committed,
    emit: (node: ShadowNode, type: string, payload: unknown) => {
      // iOS finds a pointer event's node through the handle, and drops the
      // event unless that is the current node (UIManagerBinding.cpp:99).
      if (
        /^top(Pointer|Click$)/.test(type) &&
        (node.handle as any)?.stateNode?.node !== node
      ) return
      handler!(node.handle, type, payload)
    }
  }
}

/** The committed tree as text, `<RCTView>…</>`, with raw text as its string. */
export const print = (nodes: ReadonlyArray<ShadowNode>): string =>
  nodes.map((n) =>
    n.viewName === "RCTRawText"
      ? String(n.props.text)
      : `<${n.viewName}>${print(n.children)}</>`
  )
    .join("")

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

export const byText = (s: string) => (n: ShadowNode) =>
  n.viewName === "RCTRawText" && n.props.text === s

/** Presses `node`, or ends the touch with `end` at `at`. */
export const touch = (
  fabric: ReturnType<typeof make>,
  node: ShadowNode,
  end: "topTouchEnd" | "topTouchCancel" = "topTouchEnd",
  at = { pageX: 10, pageY: 10 }
) => {
  fabric.emit(node, "topTouchStart", {})
  fabric.emit(node, end, { changedTouches: [at] })
}

export const byName = (name: string) => (n: ShadowNode) => n.viewName === name

/**
 * Runs `mount` with a NativeHost on `os` (Android by default) over a new
 * fake Fabric, as `NativeApp` does, and waits for the first commit.
 * `settle` waits for the next one.
 */
export const mount = async <A>(
  mount: (
    container: NativeHost.NativeNode
  ) => Effect.Effect<A, never, Renderer.Renderer | Native.Host | Scope.Scope>,
  processColor: (color: unknown) => unknown = (color) => color,
  os = "android"
) => {
  const fabric = make()
  let commits = 0
  const made = NativeHost.make({
    ui: fabric.ui,
    rootTag: 1,
    os,
    processColor,
    onCommit: () => commits++
  })
  const scope = Scope.makeUnsafe()
  const root = await Effect.runPromise(
    mount(made.root).pipe(
      Effect.provideContext(
        Context.make(Renderer.Renderer, { host: made.host }).pipe(
          Context.add(Native.Host, made.operations)
        )
      ),
      Scope.provide(scope)
    )
  )
  const settle = async () => {
    const before = commits
    // `commits` changes while the loop awaits.
    // oxlint-disable-next-line no-unmodified-loop-condition
    for (let i = 0; i < 50 && commits === before; i++) {
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  await settle()
  return {
    fabric,
    made,
    root,
    settle,
    find: (test: (n: ShadowNode) => boolean) => find(fabric.committed(), test)!,
    printed: () => print(fabric.committed()),
    close: () => Effect.runPromise(Scope.close(scope, Exit.void))
  }
}
