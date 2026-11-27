import * as HtmlSubscription from "@effect/ui/html/HtmlSubscription"
import { perDocument, saved } from "./dom.ts"

// A dialog drawn in place, with `topLayer: false`, is never modal.
export const modalOf = (props: {
  readonly modal?: boolean | "trap-focus" | undefined
  readonly topLayer?: boolean | undefined
}): boolean | "trap-focus" =>
  props.topLayer === false ? false : props.modal ?? true

interface Layer {
  readonly inside: Element
  readonly also: ReadonlyArray<Element>
  readonly order: number
}

interface Stack {
  readonly layers: Array<Layer>
  marked: Layer | undefined
  unmark: (() => void) | undefined
  locks: number
  unlock: (() => void) | undefined
}

const stackOf = perDocument((): Stack => ({
  layers: [],
  marked: undefined,
  unmark: undefined,
  locks: 0,
  unlock: undefined
}))

// `timer` and `marquee` are left out, as their implicit `aria-live` is off.
const liveRegions =
  "[aria-live],[role=\"alert\"],[role=\"status\"],[role=\"log\"],output"

const hide = ({ also, inside }: Layer): () => void => {
  const body = inside.ownerDocument.body
  if (body === null) return () => {}
  // Walking body does not enter shadow roots, so walk each ancestor root too.
  const roots: Array<ParentNode> = [body]
  const keep = new Set<Node>()
  const keepPath = (element: Node) => {
    for (
      let node: Node | null | undefined = element;
      node != null && !keep.has(node);
      node = node.parentNode ?? (node as Partial<ShadowRoot>).host
    ) {
      keep.add(node)
      if (node.nodeType === 11) roots.push(node as ShadowRoot)
    }
  }
  keepPath(inside)
  also.forEach(keepPath)
  const live = roots.flatMap((root) =>
    Array.from(root.querySelectorAll(liveRegions))
  )
  live.forEach(keepPath)
  const stops = new Set<Node>([inside, ...also, ...live])
  const hidden: Array<readonly [Element, string | null]> = []
  const walk = (parent: ParentNode) => {
    if (stops.has(parent)) return
    for (const child of Array.from(parent.children)) {
      if (child.localName === "script") continue
      if (keep.has(child)) {
        walk(child)
        continue
      }
      const before = child.getAttribute("aria-hidden")
      if (before !== null && before !== "false") continue
      child.setAttribute("aria-hidden", "true")
      hidden.push([child, before])
    }
  }
  roots.forEach(walk)
  return () => {
    for (const [element, before] of hidden) {
      if (before === null) element.removeAttribute("aria-hidden")
      else element.setAttribute("aria-hidden", before)
    }
  }
}

const refresh = (stack: Stack) => {
  const top = stack.layers.reduce<Layer | undefined>(
    (top, layer) =>
      top === undefined || top.inside.contains(layer.inside) ||
        (!layer.inside.contains(top.inside) && layer.order >= top.order)
        ? layer
        : top,
    undefined
  )
  if (top === stack.marked) return
  stack.unmark?.()
  stack.marked = top
  stack.unmark = top === undefined ? undefined : hide(top)
}

let lastOrder = 0

export const nextLayerOrder = (): number => ++lastOrder

export const hideOthers = (
  inside: Element,
  order: number,
  also: ReadonlyArray<Element> = []
): () => void => {
  const stack = stackOf(inside.ownerDocument)
  const entry = { inside, also, order }
  stack.layers.push(entry)
  refresh(stack)
  const unhold = HtmlSubscription.holdModal(inside)
  return () => {
    stack.layers.splice(stack.layers.indexOf(entry), 1)
    refresh(stack)
    unhold()
  }
}

const overflows = (style: CSSStyleDeclaration): boolean =>
  /auto|scroll|overlay|hidden|clip/.test(
    style.overflow + style.overflowY + style.overflowX
  ) &&
  style.display !== "inline" && style.display !== "contents"

const gutterHolds = (html: HTMLElement, scroller: HTMLElement): boolean => {
  if (
    typeof CSS === "undefined" || !CSS.supports("scrollbar-gutter", "stable")
  ) return false
  const gutter = html.style.scrollbarGutter
  const overflowY = scroller.style.overflowY
  html.style.scrollbarGutter = "stable"
  scroller.style.overflowY = "scroll"
  const before = scroller.offsetWidth
  scroller.style.overflowY = "hidden"
  const after = scroller.offsetWidth
  scroller.style.overflowY = overflowY
  html.style.scrollbarGutter = gutter
  return before === after
}

const lock = (document: Document): (() => void) | undefined => {
  const view = document.defaultView
  const html = document.documentElement
  const body = document.body
  if (view === null || body === null) return undefined
  const htmlStyle = view.getComputedStyle(html)
  const scroller = overflows(htmlStyle) ? html : body
  if (/hidden|clip/.test(view.getComputedStyle(scroller).overflowY)) {
    return undefined
  }
  const gutter = htmlStyle.scrollbarGutter.includes("both-edges")
    ? "stable both-edges"
    : "stable"
  const scrollbar = view.innerWidth - html.clientWidth > 0
  if (!scrollbar || gutterHolds(html, scroller)) {
    const restore = [
      saved(html, ["scrollbarGutter"]),
      saved(scroller, ["overflowX", "overflowY"])
    ]
    if (scrollbar) html.style.scrollbarGutter = gutter
    scroller.style.overflowX = "hidden"
    scroller.style.overflowY = "hidden"
    return () => restore.forEach((undo) => undo())
  }
  // Without a stable gutter the scrollbar would go and the page would shift,
  // so `<html>` keeps its scrollbar and `<body>`, cut to the viewport, holds
  // the page at its scroll position.
  const bodyStyle = view.getComputedStyle(body)
  const top = html.scrollTop
  const left = html.scrollLeft
  const scrollbarWidth = Math.max(0, view.innerWidth - body.clientWidth)
  const scrollbarHeight = Math.max(0, view.innerHeight - body.clientHeight)
  const marginY = parseFloat(bodyStyle.marginTop) +
    parseFloat(bodyStyle.marginBottom)
  const marginX = parseFloat(bodyStyle.marginLeft) +
    parseFloat(bodyStyle.marginRight)
  const scrollsY = html.scrollHeight > html.clientHeight ||
    /scroll/.test(htmlStyle.overflowY + bodyStyle.overflowY)
  const scrollsX = html.scrollWidth > html.clientWidth ||
    /scroll/.test(htmlStyle.overflowX + bodyStyle.overflowX)
  const restore = [
    saved(html, ["overflowX", "overflowY", "scrollbarGutter"]),
    saved(body, [
      "position",
      "height",
      "width",
      "boxSizing",
      "overflowX",
      "overflowY"
    ])
  ]
  html.style.scrollbarGutter = gutter
  html.style.overflowY = scrollsY ? "scroll" : "hidden"
  html.style.overflowX = scrollsX ? "scroll" : "hidden"
  body.style.position = "relative"
  body.style.height = `calc(100dvh - ${marginY + scrollbarHeight}px)`
  body.style.width = `calc(100vw - ${marginX + scrollbarWidth}px)`
  body.style.boxSizing = "border-box"
  body.style.overflowX = "hidden"
  body.style.overflowY = "hidden"
  body.scrollTop = top
  body.scrollLeft = left
  return () => {
    restore.forEach((undo) => undo())
    html.scrollTop = top
    html.scrollLeft = left
  }
}

export const holdScroll = (node: HTMLElement, touch: boolean): () => void => {
  const html = node.ownerDocument.documentElement
  const wide = !touch ||
    (html.clientWidth > 0 && node.offsetWidth >= html.clientWidth - 20)
  return wide ? lockScroll(node.ownerDocument) : () => {}
}

// With `hide`, screen readers see only `node` and those elements.
export const holdLayer = (
  node: HTMLElement,
  order: number,
  options: {
    readonly scroll: boolean
    readonly touch: boolean
    readonly hide: ReadonlyArray<Element> | undefined
  }
): () => void => {
  const unlock = options.scroll ? holdScroll(node, options.touch) : undefined
  const shown = options.hide === undefined
    ? undefined
    : hideOthers(node, order, options.hide)
  return () => {
    unlock?.()
    shown?.()
  }
}

export const lockScroll = (document: Document): () => void => {
  const stack = stackOf(document)
  if (stack.locks++ === 0) stack.unlock = lock(document)
  return () => {
    if (--stack.locks > 0) return
    stack.unlock?.()
    stack.unlock = undefined
  }
}
