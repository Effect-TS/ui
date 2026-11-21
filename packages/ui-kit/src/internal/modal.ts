const layers: Array<{ readonly inside: Element; readonly order: number }> = []
let marked: Element | undefined
let unmark: (() => void) | undefined

const hide = (inside: Element): () => void => {
  const body = inside.ownerDocument.body
  if (body === null) return () => {}
  const live = Array.from(body.querySelectorAll("[aria-live]"))
  const stops = new Set<Node>([inside, ...live])
  const keep = new Set<Node>()
  for (const element of stops) {
    for (let node: Node | null = element; node !== null && !keep.has(node); node = node.parentNode) keep.add(node)
  }
  const hidden: Array<readonly [Element, string | null]> = []
  const walk = (parent: Element) => {
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
  walk(body)
  return () => {
    for (const [element, before] of hidden) {
      if (before === null) element.removeAttribute("aria-hidden")
      else element.setAttribute("aria-hidden", before)
    }
  }
}

const refresh = () => {
  const top = layers.reduce<{ readonly inside: Element; readonly order: number } | undefined>(
    (top, layer) =>
      top === undefined || top.inside.contains(layer.inside) ||
        (!layer.inside.contains(top.inside) && layer.order >= top.order)
        ? layer
        : top,
    undefined
  )?.inside
  if (top === marked) return
  unmark?.()
  marked = top
  unmark = top === undefined ? undefined : hide(top)
}

export const hideOthers = (inside: Element, order: number): () => void => {
  const entry = { inside, order }
  layers.push(entry)
  refresh()
  return () => {
    layers.splice(layers.indexOf(entry), 1)
    refresh()
  }
}

let locks = 0
let unlock: (() => void) | undefined

const overflows = (style: CSSStyleDeclaration): boolean =>
  /auto|scroll|overlay|hidden|clip/.test(style.overflow + style.overflowY + style.overflowX) &&
  style.display !== "inline" && style.display !== "contents"

const gutterHolds = (html: HTMLElement, scroller: HTMLElement): boolean => {
  if (typeof CSS === "undefined" || !CSS.supports("scrollbar-gutter", "stable")) return false
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
  if (/hidden|clip/.test(view.getComputedStyle(scroller).overflowY)) return undefined
  const saved = (
    element: HTMLElement,
    names: ReadonlyArray<"overflowX" | "overflowY" | "scrollbarGutter" | "position" | "height" | "width" | "boxSizing">
  ) => {
    const values = names.map((name) => element.style[name])
    return () => names.forEach((name, i) => (element.style[name] = values[i]!))
  }
  const gutter = htmlStyle.scrollbarGutter.includes("both-edges") ? "stable both-edges" : "stable"
  const scrollbar = view.innerWidth - html.clientWidth > 0
  if (!scrollbar || gutterHolds(html, scroller)) {
    const restore = [saved(html, ["scrollbarGutter"]), saved(scroller, ["overflowX", "overflowY"])]
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
  const marginY = parseFloat(bodyStyle.marginTop) + parseFloat(bodyStyle.marginBottom)
  const marginX = parseFloat(bodyStyle.marginLeft) + parseFloat(bodyStyle.marginRight)
  const scrollsY = html.scrollHeight > html.clientHeight || /scroll/.test(htmlStyle.overflowY + bodyStyle.overflowY)
  const scrollsX = html.scrollWidth > html.clientWidth || /scroll/.test(htmlStyle.overflowX + bodyStyle.overflowX)
  const restore = [
    saved(html, ["overflowX", "overflowY", "scrollbarGutter"]),
    saved(body, ["position", "height", "width", "boxSizing", "overflowX", "overflowY"])
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

export const lockScroll = (document: Document): () => void => {
  if (locks++ === 0) unlock = lock(document)
  return () => {
    if (--locks > 0) return
    unlock?.()
    unlock = undefined
  }
}
