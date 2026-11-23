/**
 * SPIKE (EFF-4218), not for release. Hydration for the spike's DOM host, in a module `SpikeDom.mount`
 * doesn't import. It takes what today's server writes, `HtmlServer.renderToHtml`'s `html` and
 * `state`, and adds nothing to the kernel but the `init` a mount may pass.
 *
 * The host it mounts with hands the kernel the server's nodes in document order instead of making new
 * ones: an element of the same tag, or a text, past the comment markers. The kernel sets every
 * attribute, property and text as it would on a new node, and the host writes only what differs. When a
 * node doesn't match, the kernel gets a new one, and so does everything under it. The server's nodes the
 * view didn't take go when their element is placed, and the markers when the mount is built.
 *
 * As today, the nodes before one that doesn't match are kept, and the rest of its list, or of the range
 * of the server's it's in (an instance, a slot's content), is built anew. The host doesn't know where an
 * instance's nodes end: the kernel doesn't say. It goes on to the first node after the range when that
 * one matches what the view asks for next. An instance the server wrote as one element has no range, so
 * a node that doesn't match in its parent's list leaves the rest of that list to be built anew.
 */
import type * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import type * as Component from "../Component.ts"
import type * as Renderer from "../Renderer.ts"
import * as Hydrate from "../spike/Hydrate.ts"
import * as Kernel from "../spike/Kernel.ts"
import { attributeName } from "./internal/elements.ts"
import * as markers from "./internal/markers.ts"
import * as SpikeDom from "./SpikeDom.ts"

const SVG = "http://www.w3.org/2000/svg"
const ELEMENT = 1
const COMMENT = 8

const markerOf = (node: Node) =>
  node.nodeType === COMMENT ? markers.parse((node as Comment).data) : undefined

const isText = (node: Node): boolean => node.nodeType === 3

const isSlot = (path: string): boolean =>
  path[path.lastIndexOf("/") + 1] === "["

interface Opened {
  readonly path: string
  readonly open: Node
}

interface Adopting {
  readonly host: Kernel.Host<Node>
  readonly slot: Hydrate.Slot
  /** Removes what the view didn't take, and turns the host into `base`. */
  readonly done: () => void
}

/**
 * A host over `base` that hands out the server's nodes between the markers of `path` in `container`.
 * `undefined` when the container holds no such range.
 *
 * @stability experimental
 */
export const adopt = (
  base: Kernel.Host<Node>,
  container: Element,
  path: string
): Adopting | undefined => {
  let open = container.firstChild
  while (
    open !== null &&
    !(markerOf(open)?._tag === "Open" && markerOf(open)!.path === path)
  ) open = open.nextSibling
  if (open === null) return undefined
  let close = open.nextSibling
  while (
    close !== null &&
    !(markerOf(close)?._tag === "Close" && markerOf(close)!.path === path)
  ) {
    close = close.nextSibling
  }
  if (close === null) return undefined
  const end: Node = close
  /** The next server node to hand out, among the children of `parent`. */
  let at: Node | null = open.nextSibling
  let parent: Node = container
  const ranges: Array<Opened> = []
  const passed: Array<Node> = [open, end]
  const last = new WeakMap<Node, Node>([[container, open]])
  /** The attribute and property names the kernel set on a server element, until it is placed. */
  const written = new WeakMap<Node, Set<string>>()
  const fresh = new WeakSet<Node>()
  let freshDepth = 0
  /**
   * Where a node didn't match: the open marker of the innermost range in its list, or the element when
   * there's none. As today, the server's nodes left there aren't adopted.
   */
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

  /**
   * Moves to the next server node past comments, and returns it.
   *
   * Out of an element whose nodes ran out too: the kernel inserts an element's children as it makes them,
   * but makes a slot's content before placing any of it, and a child instance's nodes before placing them.
   * So the kernel asking for one more node there means the element is done, when the server's nodes
   * match. When they don't, an element the server wrote after it is adopted, and moved where the view
   * puts it.
   */
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

  /**
   * After a mismatch at `first` inside ranges of its list: the first node after one of them, innermost
   * first, that matches. The server's nodes left in between go.
   */
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
      const path = ranges[index]!.path
      let close = from.nextSibling
      while (
        close !== null &&
        !(markerOf(close)?._tag === "Close" && markerOf(close)!.path === path)
      ) {
        close = close.nextSibling
      }
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
    // Past the markers before it, so that a mismatch knows the ranges it's in.
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
    slot(base, started) {
      const under = base + "/"
      // Into the ranges of instances that started and of slots under `base`, and up to the range of the
      // instance that starts, which may hold more.
      while (at !== null && at !== end && at.nodeType === COMMENT) {
        const marker = markerOf(at)
        if (
          marker?._tag === "Open" && !started.has(marker.path) &&
          !(isSlot(marker.path) && marker.path.startsWith(under))
        ) break
        pass(at)
        at = at.nextSibling
      }
      for (let index = ranges.length - 1; index >= 0; index--) {
        const path = ranges[index]!.path
        if (isSlot(path)) return path.startsWith(under) ? path : undefined
      }
      return undefined
    },
    done() {
      for (
        let node = last.get(container)!.nextSibling;
        node !== null && node !== end;
      ) {
        const following = node.nextSibling
        container.removeChild(node)
        node = following
      }
      for (const node of passed) node.parentNode?.removeChild(node)
      Object.assign(host, base)
    }
  }
}

/**
 * Hydrates the server's rendering of `component` in `container` until the Scope closes: `state` is
 * `HtmlServer.renderToHtml`'s.
 *
 * @stability experimental
 */
export const hydrateEffect = <Props, Model, Msg, R = never>(
  component: Component.Members<any, Props, Model, Msg, any, R, any, any>,
  props: Props,
  container: globalThis.Element,
  state: Renderer.State,
  options?: SpikeDom.Options
): Effect.Effect<SpikeDom.Root<Model, Msg>, never, R | Scope.Scope> =>
  SpikeDom.mountWith(component, container, options, (base, kernel) => {
    const runnable = component as unknown as Kernel.Runnable
    const adopting = adopt(base, container, "/" + runnable.definition.name)
    const init = Hydrate.makeInit(
      state,
      adopting === undefined ? () => undefined : adopting.slot
    )
    const root = Kernel.mount(
      runnable,
      props,
      container,
      adopting?.host ?? base,
      { ...kernel, init: init.init }
    )
    init.done()
    adopting?.done()
    return root
  })

/**
 * Hydrates `component` in `container` for as long as the Layer is built.
 *
 * @stability experimental
 */
export const hydrate = <Props, Model, Msg, R = never>(
  component: Component.Members<any, Props, Model, Msg, any, R, any, any>,
  props: Props,
  container: globalThis.Element,
  state: Renderer.State,
  options?: SpikeDom.Options
): Layer.Layer<never, never, R> =>
  Layer.effectDiscard(
    hydrateEffect(component, props, container, state, options)
  )
