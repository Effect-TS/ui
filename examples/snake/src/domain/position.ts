import { Match, Schema } from "effect"

import type * as Direction from "./direction.ts"

export const GRID_SIZE = 20

export const Position = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number
})

export const equivalence = Schema.toEquivalence(Position)

export type Position = typeof Position.Type

export const wrap = ({ x, y }: Position): Position => ({
  x: x < 0 ? GRID_SIZE - 1 : x >= GRID_SIZE ? 0 : x,
  y: y < 0 ? GRID_SIZE - 1 : y >= GRID_SIZE ? 0 : y
})

export const move = (
  pos: Position,
  direction: Direction.Direction
): Position => {
  const next = Match.value(direction).pipe(
    Match.when("Up", () => ({ x: pos.x, y: pos.y - 1 })),
    Match.when("Down", () => ({ x: pos.x, y: pos.y + 1 })),
    Match.when("Left", () => ({ x: pos.x - 1, y: pos.y })),
    Match.when("Right", () => ({ x: pos.x + 1, y: pos.y })),
    Match.exhaustive
  )
  return wrap(next)
}
