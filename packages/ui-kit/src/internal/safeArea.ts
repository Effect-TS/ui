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
