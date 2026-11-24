import type { Box, Point } from "./safeArea.ts"

export interface Lines {
  readonly lines: ReadonlyArray<Box>
  readonly bounds: Box
}

export const linesOf = (rects: ArrayLike<Box>): Lines => {
  const lines: Array<
    { left: number; top: number; right: number; bottom: number }
  > = []
  let previous: Box | undefined
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const rect of Array.from(rects).sort((a, b) => a.top - b.top)) {
    left = Math.min(left, rect.left)
    top = Math.min(top, rect.top)
    right = Math.max(right, rect.right)
    bottom = Math.max(bottom, rect.bottom)
    const line = lines[lines.length - 1]
    if (
      line === undefined || previous === undefined ||
      rect.top - previous.top > (previous.bottom - previous.top) / 2
    ) {
      lines.push({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
      })
    } else {
      line.left = Math.min(line.left, rect.left)
      line.right = Math.max(line.right, rect.right)
      line.bottom = Math.max(line.bottom, rect.bottom)
    }
    previous = rect
  }
  return { lines, bounds: { left, top, right, bottom } }
}

export const lineAt = (
  lines: ReadonlyArray<Box>,
  point: Point
): number | null => {
  const line = lines.findIndex((line) =>
    point.x > line.left - 2 && point.x < line.right + 2 &&
    point.y > line.top - 2 && point.y < line.bottom + 2
  )
  return line === -1 ? null : line
}

export const lineUnder = (
  rects: ArrayLike<Box>,
  point: Point
): number | null => {
  if (rects.length < 2) return null
  const { lines } = linesOf(rects)
  return lines.length < 2 ? null : lineAt(lines, point)
}

export const inlineEdges = (
  { bounds, lines }: Lines,
  side: "top" | "right" | "bottom" | "left",
  hit: number | null,
  pointed: boolean
): Box => {
  const line = hit === null ? undefined : lines[hit]
  if (line !== undefined) return line
  const first = lines[0]!
  const last = lines[lines.length - 1]!
  if (lines.length === 2 && first.left > last.right && pointed) return bounds
  if (side === "top" || side === "bottom") {
    const target = side === "top" ? first : last
    return {
      left: target.left,
      top: first.top,
      right: target.right,
      bottom: last.bottom
    }
  }
  const leftmost = side === "left"
  let edge = leftmost ? Infinity : -Infinity
  let from = first
  let to = first
  for (const line of lines) {
    const next = leftmost ? line.left : line.right
    if (leftmost ? next < edge : next > edge) {
      edge = next
      from = line
      to = line
    } else if (next === edge) to = line
  }
  return {
    left: bounds.left,
    top: from.top,
    right: bounds.right,
    bottom: to.bottom
  }
}
