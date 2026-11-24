import { Command, Component, Head, Subscription, UiSchema } from "@effect/ui"
import {
  OpenTui,
  OpenTuiCommand,
  OpenTuiSubscription
} from "@effect/ui-opentui"
import { Array, Duration, Schema, Stream } from "effect"
import { GAME, GAME_SPEED } from "snake/constants"
import * as Apple from "snake/domain/apple"
import * as Direction from "snake/domain/direction"
import * as Position from "snake/domain/position"
import * as Snake from "snake/domain/snake"

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
  PressedQuit: {},
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
  ["up", "Up"],
  ["down", "Down"],
  ["left", "Left"],
  ["right", "Right"],
  ["w", "Up"],
  ["s", "Down"],
  ["a", "Left"],
  ["d", "Right"]
])

const KEY_SHORTCUTS = [
  ...[...MOVE_DIRECTIONS.keys(), "space", "r"].map((key) => ({
    key,
    message: SnakeGameMessage.PressedKey({ key }),
    repeat: true
  })),
  { key: "q", message: SnakeGameMessage.PressedQuit() }
]

const NEXT_ON_SPACE: Record<GameState, GameState> = {
  NotStarted: "Playing",
  Playing: "Paused",
  Paused: "Playing",
  GameOver: "GameOver"
}

const tickInterval = (points: number): number =>
  Math.max(GAME_SPEED.MIN_INTERVAL, GAME_SPEED.BASE_INTERVAL - points)

const GAME_STATE_TEXT: Record<GameState, string> = {
  NotStarted: "Press SPACE to start",
  Playing: "Playing - SPACE to pause",
  Paused: "Paused - SPACE to continue",
  GameOver: "Game Over - Press R to restart"
}

const GLYPH = {
  head: { char: "@@", fg: "#22c55e" },
  body: { char: "[]", fg: "#4ade80" },
  apple: { char: "()", fg: "#ef4444" },
  empty: { char: " .", fg: "#374151" }
}

const cellGlyph = (cell: Position.Position, model: SnakeGameModel) => {
  if (Position.equivalence(cell, model.snake[0])) return GLYPH.head
  if (Snake.contains(model.snake, cell)) return GLYPH.body
  if (Position.equivalence(cell, model.apple)) return GLYPH.apple
  return GLYPH.empty
}

export const SnakeGame = Component.define({
  name: "SnakeGameTui",
  model: SnakeGameModel,
  message: SnakeGameMessage,
  elements: OpenTui
}).make({
  init: ($) =>
    $.set({ ...NEW_GAME, apple: { x: 15, y: 15 }, highScore: 0 })
      .run(generateApplePosition(NEW_GAME.snake)),
  update: {
    PressedKey: ($, { key }) => {
      const direction = MOVE_DIRECTIONS.get(key)
      if (direction !== undefined) {
        return $.model.gameState === "Playing"
          ? $.evolve({ nextDirection: direction })
          : $.model
      }
      if (key === "space") {
        return $.evolve({ gameState: (gameState) => NEXT_ON_SPACE[gameState] })
      }
      if (key === "r") {
        return $.evolve(NEW_GAME).run(generateApplePosition(NEW_GAME.snake))
      }
      return $.model
    },

    PressedQuit: ($) => $.run(OpenTuiCommand.quit()),

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
      return willEatApple ? $.set(next).run(generateApplePosition(snake)) : next
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
    OpenTuiSubscription.shortcuts(KEY_SHORTCUTS)
  ],
  head: ({ model }) => [Head.title(`Snake | ${model.points} pts`)],
  view: (h, model) =>
    h.box.style({
      flexDirection: "column",
      padding: 1,
      gap: 1,
      width: Position.GRID_SIZE * 2 + 4
    }).children(
      h.text(
        h.b("Snake"),
        `  Score: ${model.points}  High: ${model.highScore}`
      ),
      h.text.style({ fg: "#9ca3af" }).children(
        GAME_STATE_TEXT[model.gameState]
      ),
      h.box.style({
        border: true,
        flexDirection: "column",
        width: Position.GRID_SIZE * 2 + 2,
        height: Position.GRID_SIZE + 2
      }).children(
        Array.makeBy(Position.GRID_SIZE, (y) =>
          h.text(
            Array.makeBy(Position.GRID_SIZE, (x) => {
              const glyph = cellGlyph({ x, y }, model)
              return h.span.style({ fg: glyph.fg }).children(glyph.char)
            })
          ))
      ),
      h.text.style({ fg: "#6b7280" }).children(
        "Arrows/WASD: move  SPACE: start/pause  R: restart  Q: quit"
      )
    )
})
