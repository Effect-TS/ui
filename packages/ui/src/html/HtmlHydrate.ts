/**
 * Hydration on the kernel's DOM host: mounts a component over what `HtmlServer` rendered of it, adopting the
 * server's nodes and the Model each instance rendered with. An app that only mounts doesn't carry it.
 *
 * @since 0.1.0
 */
import type * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import type * as Component from "../Component.ts"
import * as hydrateRun from "../internal/hydrateRun.ts"
import * as Kernel from "../internal/kernel.ts"
import type * as Renderer from "../Renderer.ts"
import { attributeName } from "./internal/elements.ts"
import * as markers from "./internal/markers.ts"
import * as KernelDom from "./KernelDom.ts"

const SVG = "http://www.w3.org/2000/svg"
const ELEMENT = 1
const COMMENT = 8

const markerOf = (node: Node) =>
  node.nodeType === COMMENT ? markers.parse((node as Comment).data) : undefined

const isOpen = (node: Node, path: string): boolean => {
  const marker = markerOf(node)
  return marker?._tag === "Open" && marker.path === path
}

const closeOf = (open: Node, path: string): Node | null => {
  let close = open.nextSibling
  while (close !== null) {
    const marker = markerOf(close)
    if (marker?._tag === "Close" && marker.path === path) return close
    close = close.nextSibling
  }
  return null
}

const isText = (node: Node): boolean => node.nodeType === 3

interface Opened {
  readonly path: string
  readonly open: Node
}

interface Held {
  readonly first: Node
  readonly last: Node
}

const between = (
  base: Kernel.Host<Node>,
  container: Node,
  start: Node | null,
  end: Node | null,
  edges: ReadonlyArray<Node>,
  holds: Map<Node, Held>
): hydrateRun.Adopting<Node> => {
  let at = start
  let parent = container
  const ranges: Array<Opened> = []
  const passed: Array<Node> = [...edges]
  const span: Array<Node> = []
  for (
    let node = start;
    node !== null && node !== end;
    node = node.nextSibling
  ) span.push(node)
  const last = new WeakMap<Node, Node>()
  if (edges.length > 0) last.set(container, edges[0]!)
  const written = new WeakMap<Node, Set<string>>()
  const fresh = new WeakSet<Node>()
  const taken = new WeakSet<Node>()
  const kept = new WeakSet<Node>()
  let freshDepth = 0
  let holding: Held | undefined
  const missed = new WeakSet<Node>()

  const scopeOf = (node: Node): Node => {
    const list = node.parentNode!
    const range = ranges[ranges.length - 1]
    return range !== undefined && range.open.parentNode === list
      ? range.open
      : list
  }

  const pass = (node: Node): void => {
    const marker = markerOf(node)
    if (marker?._tag === "Open") ranges.push({ path: marker.path, open: node })
    else if (marker !== undefined) ranges.pop()
    passed.push(node)
  }

  const next = (): Node | null => {
    for (;;) {
      if (at === null) {
        if (parent === container) return null
        while (
          ranges.length > 0 && parent.contains(ranges[ranges.length - 1]!.open)
        ) ranges.pop()
        at = parent.nextSibling
        parent = parent.parentNode!
      } else if (at === end) {
        return null
      } else if (at.nodeType === COMMENT) {
        pass(at)
        at = at.nextSibling
      } else {
        return at
      }
    }
  }

  const resync = (
    first: Node,
    matches: (node: Node) => boolean
  ): Node | null => {
    const list = first.parentNode!
    let from = first
    for (
      let index = ranges.length - 1;
      index >= 0 && ranges[index]!.open.parentNode === list;
      index--
    ) {
      const close = closeOf(from, ranges[index]!.path)
      if (close === null) return null
      let candidate = close.nextSibling
      while (
        candidate !== null && candidate !== end &&
        candidate.nodeType === COMMENT
      ) {
        candidate = candidate.nextSibling
      }
      if (candidate === null || candidate === end) return null
      if (matches(candidate)) {
        let resume: Node | null = null
        for (let node: Node = first; node !== candidate;) {
          const following = node.nextSibling!
          if (node.nodeType === COMMENT) resume ??= node
          else list.removeChild(node)
          node = following
        }
        if (at === first) at = resume ?? candidate
        return candidate
      }
      from = close
    }
    return null
  }

  const take = (matches: (node: Node) => boolean): Node | null => {
    if (freshDepth > 0) return null
    let node = next()
    if (node === null) return null
    const scope = scopeOf(node)
    if (missed.has(scope) || !matches(node)) {
      node = resync(node, matches)
      if (node === null) {
        missed.add(scope)
        return null
      }
      next()
    }
    taken.add(node)
    return node
  }

  const complete = (element: Element, names: Set<string>): void => {
    written.delete(element)
    const inside = element.contains(parent)
    const previous = last.get(element)
    for (
      let node = previous === undefined
        ? element.firstChild
        : previous.nextSibling;
      node !== null;
    ) {
      const following = node.nextSibling
      element.removeChild(node)
      node = following
    }
    const attributes = element.attributes
    for (let index = attributes.length - 1; index >= 0; index--) {
      const name = attributes[index]!.name
      if (!names.has(name)) element.removeAttribute(name)
    }
    if (inside) {
      while (
        ranges.length > 0 && element.contains(ranges[ranges.length - 1]!.open)
      ) ranges.pop()
      at = element.nextSibling
      parent = element.parentNode!
    }
  }

  const host: Kernel.Host<Node> = {
    ...base,
    createElement(tag) {
      const node = take((node) =>
        node.nodeType === ELEMENT && (node as Element).localName === tag
      )
      if (node === null) {
        const made = base.createElement(tag)
        fresh.add(made)
        freshDepth++
        return made
      }
      written.set(node, new Set())
      parent = node
      at = node.firstChild
      return node
    },
    createText(text) {
      if (text === "" && holding !== undefined) {
        const node = base.createText(text)
        holds.set(node, holding)
        holding = undefined
        return node
      }
      const node = text === "" ? null : take(isText) as Text | null
      if (node === null) return base.createText(text)
      const data = node.data
      if (data !== text) {
        if (data.startsWith(text)) node.splitText(text.length)
        else node.data = text
      }
      at = node.nextSibling
      return node
    },
    setAttr(node, name, value) {
      const names = written.get(node)
      if (names !== undefined) {
        const element = node as Element
        const normalized = attributeName(name, element.namespaceURI === SVG)
        if (normalized === undefined) return
        names.add(normalized)
        if (
          value === undefined
            ? !element.hasAttribute(normalized)
            : element.getAttribute(normalized) === value
        ) return
      }
      base.setAttr(node, name, value)
    },
    setProp(node, name, value) {
      const names = written.get(node)
      if (names !== undefined) {
        names.add(name.toLowerCase())
        if ((node as any)[name] === value) return
      }
      base.setProp(node, name, value)
    },
    insert(into, node, before) {
      if (before !== null) return base.insert(into, node, before)
      const held = holds.get(node)
      if (held !== undefined && held.first.parentNode === into) {
        into.insertBefore(node, held.first)
        last.set(into, held.last)
        return
      }
      const previous = last.get(into)
      let ref = previous === undefined ? into.firstChild : previous.nextSibling
      while (ref !== null && ref !== end && ref.nodeType === COMMENT) {
        ref = ref.nextSibling
      }
      if (ref !== node) into.insertBefore(node, ref)
      last.set(into, node)
      if (fresh.delete(node)) freshDepth--
      else {
        const names = written.get(node)
        if (names !== undefined) complete(node as Element, names)
      }
    }
  }

  return {
    host,
    hold(path) {
      holding = undefined
      if (freshDepth > 0) return
      while (
        at !== null && at !== end && at.nodeType === COMMENT &&
        !isOpen(at, path)
      ) {
        pass(at)
        at = at.nextSibling
      }
      if (at === null || at === end) return
      const close = at.nodeType === COMMENT
        ? closeOf(at, path)
        : at.nodeType === ELEMENT
        ? at
        : null
      if (close === null) return
      holding = { first: at, last: close }
      for (
        let node: Node | null = at;
        node !== null;
        node = node === close ? null : node.nextSibling
      ) kept.add(node)
      at = close.nextSibling
    },
    done() {
      for (const node of span) {
        if (!taken.has(node) && !kept.has(node)) {
          node.parentNode?.removeChild(node)
        }
      }
      for (const node of passed) node.parentNode?.removeChild(node)
    }
  }
}

/**
 * What a hydrating mount adopts with on a DOM host: the server's nodes between the markers of `path` in
 * `container`, and those of each child held until its state decodes.
 *
 * @internal
 */
export const adopt: hydrateRun.Adopt<Node> = (base, container, path) => {
  const holds = new Map<Node, Held>()
  let open = container.firstChild
  while (open !== null && !isOpen(open, path)) open = open.nextSibling
  const close = open === null ? null : closeOf(open, path)
  return {
    root: open === null || close === null
      ? undefined
      : between(base, container, open.nextSibling, close, [open, close], holds),
    resume(placeholder) {
      const held = holds.get(placeholder)
      if (held === undefined) return undefined
      holds.delete(placeholder)
      const list = held.first.parentNode!
      return held.first === held.last
        ? between(base, list, held.first, held.last.nextSibling, [], holds)
        : between(base, list, held.first.nextSibling, held.last, [
          held.first,
          held.last
        ], holds)
    }
  }
}

/**
 * Mounts `component` over what `HtmlServer.renderToHtml` rendered of it in `container` until the Scope
 * closes. `state` is the state it returned: each instance starts from the Model the server rendered it with,
 * and one whose state decodes only asynchronously keeps the server's nodes until it does.
 *
 * @stability experimental
 * @since 0.1.0
 * @category mounting
 */
export const hydrateEffect = <Props, Model, Msg, R = never>(
  component: Component.Members<any, Props, Model, Msg, any, R, any, any>,
  props: Props,
  container: globalThis.Element,
  state: Renderer.State,
  options?: KernelDom.Options
): Effect.Effect<KernelDom.Root<Model, Msg>, never, R | Scope.Scope> =>
  KernelDom.mountWith(component, container, options, (base, kernel) => {
    const runnable = component as unknown as Kernel.Runnable
    const host = { ...base }
    const hydration = hydrateRun.make(
      state,
      host,
      base,
      adopt(base, container, "/" + runnable.definition.name),
      () => {}
    )
    const root = Kernel.mount(runnable, props, container, host, {
      ...kernel,
      init: (inst) => {
        const first = inst.component.init(inst.props)
        return hydration.init(inst, first) ?? first
      }
    })
    hydration.end()
    return root
  })

/**
 * Hydrates `component` in `container` for as long as the Layer is built.
 *
 * @stability experimental
 * @since 0.1.0
 * @category mounting
 */
export const hydrate = <Props, Model, Msg, R = never>(
  component: Component.Members<any, Props, Model, Msg, any, R, any, any>,
  props: Props,
  container: globalThis.Element,
  state: Renderer.State,
  options?: KernelDom.Options
): Layer.Layer<never, never, R> =>
  Layer.effectDiscard(
    hydrateEffect(component, props, container, state, options)
  )
