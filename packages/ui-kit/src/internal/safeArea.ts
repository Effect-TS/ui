import { elementOf } from "./dom.ts"

export interface Point {
  readonly x: number
  readonly y: number
}

export interface Box {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

const within = (point: Point, box: Box): boolean =>
  point.x >= box.left && point.x <= box.right && point.y >= box.top &&
  point.y <= box.bottom

const cross = (o: Point, a: Point, b: Point): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

const inTriangle = (point: Point, a: Point, b: Point, c: Point): boolean => {
  const d1 = cross(a, b, point)
  const d2 = cross(b, c, point)
  const d3 = cross(c, a, point)
  const negative = d1 < 0 || d2 < 0 || d3 < 0
  const positive = d1 > 0 || d2 > 0 || d3 > 0
  return !(negative && positive)
}

export const inSafeArea = (
  point: Point,
  from: Point,
  popup: Box,
  buffer = 1
): boolean => {
  if (within(point, popup)) return true
  if (from.x < popup.left) {
    const start = { x: from.x - buffer, y: from.y }
    return point.x <= popup.left &&
      inTriangle(point, start, { x: popup.left, y: popup.top }, {
        x: popup.left,
        y: popup.bottom
      })
  }
  if (from.x > popup.right) {
    const start = { x: from.x + buffer, y: from.y }
    return point.x >= popup.right &&
      inTriangle(point, start, { x: popup.right, y: popup.top }, {
        x: popup.right,
        y: popup.bottom
      })
  }
  if (from.y < popup.top) {
    const start = { x: from.x, y: from.y - buffer }
    return point.y <= popup.top &&
      inTriangle(point, start, { x: popup.left, y: popup.top }, {
        x: popup.right,
        y: popup.top
      })
  }
  if (from.y > popup.bottom) {
    const start = { x: from.x, y: from.y + buffer }
    return point.y >= popup.bottom &&
      inTriangle(point, start, { x: popup.left, y: popup.bottom }, {
        x: popup.right,
        y: popup.bottom
      })
  }
  return false
}

export const activationDirection = (
  from: Box,
  to: Box,
  tolerance = 5
): string => {
  const dx = (to.left + to.right) / 2 - (from.left + from.right) / 2
  const dy = (to.top + to.bottom) / 2 - (from.top + from.bottom) / 2
  const horizontal = dx > tolerance ? "right" : dx < -tolerance ? "left" : ""
  const vertical = dy > tolerance ? "down" : dy < -tolerance ? "up" : ""
  return horizontal + " " + vertical
}

// Watches whether the pointer is in a popup's hover area: on `node`, on an
// element that matches `triggers`, or in the triangle between the point
// where it left a trigger and `node`. `report` hears `true` when the
// pointer leaves the area and `false` when it comes back, only on a change.
// The listeners stay until `signal` aborts.
export const watchHoverArea = (
  node: HTMLElement,
  signal: AbortSignal,
  triggers: () => string,
  report: (away: boolean) => void
): void => {
  const document = node.ownerDocument
  let from: Point | null = null
  let away: boolean | null = null
  const inside = (target: EventTarget | null) =>
    elementOf(target) !== null &&
    (node.contains(target as Node) ||
      elementOf(target)!.closest(triggers()) !== null)
  const change = (next: boolean) => {
    if (away === next) return
    away = next
    report(next)
  }
  const options = { capture: true, passive: true, signal }
  document.addEventListener("mouseleave", (event) => {
    if (elementOf(event.target)?.matches(triggers()) === true) {
      from = { x: event.clientX, y: event.clientY }
    }
  }, options)
  document.addEventListener("mousemove", (event) => {
    if (inside(event.target)) return change(false)
    const point = { x: event.clientX, y: event.clientY }
    if (
      from !== null && inSafeArea(point, from, node.getBoundingClientRect())
    ) {
      return change(false)
    }
    from = null
    change(true)
  }, options)
  document.addEventListener("mouseout", (event) => {
    if (event.relatedTarget !== null) return
    from = null
    change(true)
  }, options)
}
