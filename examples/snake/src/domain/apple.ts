import { Effect, Random, Schedule } from "effect"

import { GRID_SIZE, type Position } from "./position.ts"
import * as Snake from "./snake.ts"

export const generatePosition = Effect.fnUntraced(
  function*(snake: Snake.Snake) {
    const x = yield* Random.nextIntBetween(0, GRID_SIZE, {
      halfOpen: true
    })
    const y = yield* Random.nextIntBetween(0, GRID_SIZE, {
      halfOpen: true
    })
    const pos: Position = { x, y }

    if (Snake.contains(snake, pos)) {
      return yield* Effect.fail("PositionCollision" as const)
    } else {
      return pos
    }
  },
  Effect.retry(Schedule.forever),
  Effect.orDie
)
