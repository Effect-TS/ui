import * as Apple from "#domain/apple"
import * as Direction from "#domain/direction"
import * as Position from "#domain/position"
import * as Snake from "#domain/snake"
import { Command, Component, Head, Subscription, UiSchema } from "@effect/ui"
import { HtmlSubscription } from "@effect/ui/html"
import { Array, Duration, Schema, Stream } from "effect"
import { GAME, GAME_SPEED } from "./constants.ts"

export const GameState = Schema.Literals([
  "NotStarted",
  "Playing",
  "Paused",
  "GameOver"
])
export type GameState = typeof GameState.Type

export const SnakeGameModel = Schema.Struct({
  snake: Snake.Snake,
  apple: Position.Position,
  direction: Direction.Direction,
  nextDirection: Direction.Direction,
  gameState: GameState,
  points: Schema.Number,
  highScore: Schema.Number
})
export type SnakeGameModel = typeof SnakeGameModel.Type

export const SnakeGameMessage = UiSchema.TaggedEnum({
  TickedClock: {},
  PressedKey: { key: Schema.String },
  CompletedGenerateApplePosition: { position: Position.Position }
})

export const GenerateApplePosition = Command.make(
  "GenerateApplePosition",
  { args: { snake: Snake.Snake } },
  ({ snake }) => Apple.generatePosition(snake)
)

const generateApplePosition = (snake: Snake.Snake) =>
  GenerateApplePosition.make({ snake }).pipe(
    Command.map((position) =>
      SnakeGameMessage.CompletedGenerateApplePosition({ position })
    )
  )

const NEW_GAME = {
  snake: Snake.create(GAME.INITIAL_POSITION),
  direction: GAME.INITIAL_DIRECTION,
  nextDirection: GAME.INITIAL_DIRECTION,
  gameState: "NotStarted",
  points: 0
} satisfies Partial<SnakeGameModel>

const MOVE_DIRECTIONS: ReadonlyMap<string, Direction.Direction> = new Map([
  ["ArrowUp", "Up"],
  ["ArrowDown", "Down"],
  ["ArrowLeft", "Left"],
  ["ArrowRight", "Right"],
  ["w", "Up"],
  ["s", "Down"],
  ["a", "Left"],
  ["d", "Right"]
])

const KEY_SHORTCUTS = [...MOVE_DIRECTIONS.keys(), " ", "r"].map((key) => ({
  key,
  message: SnakeGameMessage.PressedKey({ key }),
  repeat: true
}))

const NEXT_ON_SPACE: Record<GameState, GameState> = {
  NotStarted: "Playing",
  Playing: "Paused",
  Paused: "Playing",
  GameOver: "GameOver"
}

const tickInterval = (points: number): number =>
  Math.max(GAME_SPEED.MIN_INTERVAL, GAME_SPEED.BASE_INTERVAL - points)

const cellClass = (x: number, y: number, model: SnakeGameModel): string => {
  const cell = { x, y }
  if (Position.equivalence(cell, model.snake[0])) return "bg-green-700"
  if (Snake.contains(model.snake, cell)) return "bg-green-500"
  if (Position.equivalence(cell, model.apple)) return "bg-red-500"
  return "bg-gray-800"
}

const GAME_STATE_TEXT: Record<GameState, string> = {
  NotStarted: "Press SPACE to start",
  Playing: "Playing - SPACE to pause",
  Paused: "Paused - SPACE to continue",
  GameOver: "Game Over - Press R to restart"
}

export const SnakeGame = Component.define({
  name: "SnakeGame",
  model: SnakeGameModel,
  message: SnakeGameMessage
}).make({
  init: ($) =>
    $.set({ ...NEW_GAME, apple: { x: 15, y: 15 }, highScore: 0 })
      .run([generateApplePosition(NEW_GAME.snake)]),
  update: {
    PressedKey: ($, { key }) => {
      const direction = MOVE_DIRECTIONS.get(key)
      if (direction !== undefined) {
        return $.model.gameState === "Playing"
          ? $.evolve({ nextDirection: direction })
          : $.model
      }
      if (key === " ") {
        return $.evolve({ gameState: (gameState) => NEXT_ON_SPACE[gameState] })
      }
      if (key === "r") {
        return $.evolve(NEW_GAME).run([generateApplePosition(NEW_GAME.snake)])
      }
      return $.model
    },

    TickedClock: ($) => {
      if ($.model.gameState !== "Playing") return $.model

      const direction =
        Direction.isOpposite($.model.direction, $.model.nextDirection)
          ? $.model.direction
          : $.model.nextDirection
      const willEatApple = Position.equivalence(
        Position.move($.model.snake[0], direction),
        $.model.apple
      )
      const snake = willEatApple
        ? Snake.grow($.model.snake, direction)
        : Snake.move($.model.snake, direction)

      if (Snake.hasCollision(snake)) {
        return $.evolve({
          gameState: "GameOver",
          highScore: Math.max($.model.points, $.model.highScore)
        })
      }

      const next: SnakeGameModel = {
        ...$.model,
        snake,
        direction,
        points: willEatApple
          ? $.model.points + GAME.POINTS_PER_APPLE
          : $.model.points
      }
      return willEatApple
        ? $.set(next).run([generateApplePosition(snake)])
        : next
    },

    CompletedGenerateApplePosition: ($, { position }) =>
      $.evolve({ apple: position })
  },
  subscriptions: ({ model }) => [
    model.gameState === "Playing" &&
    Subscription.make(
      "gameClock",
      tickInterval(model.points),
      (interval) =>
        Stream.tick(Duration.millis(interval)).pipe(
          Stream.drop(1),
          Stream.as(SnakeGameMessage.TickedClock())
        )
    ),
    HtmlSubscription.shortcuts(KEY_SHORTCUTS)
  ],
  head: ({ model }) => [Head.title(`Snake | ${model.points} pts`)],
  view: (h, model) =>
    h.div.class([
      "flex flex-col items-center justify-center min-h-screen bg-black text-white p-8"
    ]).children([
      h.h1.class(["text-4xl font-bold mb-4"]).children(["Snake Game"]),
      h.div.class(["flex gap-8 mb-4"]).children([
        h.p.class(["text-xl"]).children([`Score: ${model.points}`]),
        h.p.class(["text-xl"]).children([`High Score: ${model.highScore}`])
      ]),
      h.p.class(["text-lg mb-4"]).children([GAME_STATE_TEXT[model.gameState]]),
      h.div.class(["inline-block border-2 border-gray-600"]).children(
        Array.makeBy(Position.GRID_SIZE, (y) =>
          h.div.class(["flex"]).children(
            Array.makeBy(
              Position.GRID_SIZE,
              (x) => h.div.class(["w-6 h-6", cellClass(x, y, model)])
            )
          ))
      ),
      h.div.class(["mt-4 text-sm text-gray-400"]).children([
        h.p(["Use ARROW KEYS or WASD to move"]),
        h.p(["SPACE to pause/start"]),
        h.p(["R to restart"])
      ])
    ])
})
