export type Loop = "none" | "wrap" | "escape"

export const stepped = (at: number, last: number, direction: 1 | -1, loop: Loop): number => {
  if (last < 0) return -1
  if (at === -1) return direction === 1 ? 0 : last
  const next = at + direction
  if (next >= 0 && next <= last) return next
  return loop === "none" ? at : loop === "escape" ? -1 : direction === 1 ? 0 : last
}
