import * as Snake from "#domain/snake"
import { Head } from "@effect/ui"
import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  GenerateApplePosition,
  SnakeGame,
  SnakeGameMessage,
  type SnakeGameModel
} from "./SnakeGame.ts"

const initialSnake = Snake.create({ x: 10, y: 10 })

const playingModel: SnakeGameModel = {
  snake: initialSnake,
  apple: { x: 15, y: 15 },
  direction: "Right",
  nextDirection: "Right",
  gameState: "Playing",
  points: 0,
  highScore: 0
}

const notStartedModel: SnakeGameModel = {
  ...playingModel,
  gameState: "NotStarted"
}

const keyboard = "@effect/ui/html/document:\"keydown\""
const gameClock = "gameClock:150"

const pressedKey = (key: string) => SnakeGameMessage.PressedKey({ key })

describe("SnakeGame", () => {
  describe("init", () => {
    it.effect("starts NotStarted and generates the first apple", () =>
      Effect.gen(function*() {
        const story = yield* Story.make(SnakeGame, {})
        assert.strictEqual(story.model.gameState, "NotStarted")
        assert.deepStrictEqual(story.model.snake, initialSnake)
        story.expectExact(GenerateApplePosition.make({ snake: initialSnake }))
          .resolve(GenerateApplePosition, { x: 3, y: 4 })
        assert.deepStrictEqual(story.model.apple, { x: 3, y: 4 })
      }))
  })

  describe("subscriptions", () => {
    it.effect("the keyboard listens in every state and the clock only while playing", () =>
      Effect.gen(function*() {
        const story = yield* Story.make(SnakeGame, {})
        story.given(notStartedModel)
        assert.deepStrictEqual(story.subscriptions, [keyboard])
        story.given(playingModel)
        assert.deepStrictEqual(story.subscriptions, [gameClock, keyboard])
        story.given({ ...playingModel, gameState: "Paused" })
        assert.deepStrictEqual(story.subscriptions, [keyboard])
        story.given({ ...playingModel, gameState: "GameOver" })
        assert.deepStrictEqual(story.subscriptions, [keyboard])
      }))

    it.effect("the clock speeds up as the score grows, down to the minimum interval", () =>
      Effect.gen(function*() {
        const story = yield* Story.make(SnakeGame, {})
        story.given({ ...playingModel, points: 30 })
        assert.deepStrictEqual(story.subscriptions, ["gameClock:120", keyboard])
        story.given({ ...playingModel, points: 500 })
        assert.deepStrictEqual(story.subscriptions, ["gameClock:80", keyboard])
      }))
  })

  describe("movement controls", () => {
    it.effect("arrow key updates nextDirection while playing", () =>
      Effect.gen(function*() {
        const story = yield* Story.make(SnakeGame, {})
        story.given(playingModel).send(pressedKey("ArrowUp"))
        assert.strictEqual(story.model.nextDirection, "Up")
      }))

    it.effect("WASD key updates nextDirection while playing", () =>
      Effect.gen(function*() {
        const story = yield* Story.make(SnakeGame, {})
        story.given(playingModel).send(pressedKey("a"))
        assert.strictEqual(story.model.nextDirection, "Left")
      }))

    it.effect("arrow keys are ignored while the game is paused", () =>
      Effect.gen(function*() {
        const story = yield* Story.make(SnakeGame, {})
        story.given({ ...playingModel, gameState: "Paused" }).send(
          pressedKey("ArrowDown")
        )
        assert.strictEqual(story.model.nextDirection, "Right")
      }))
  })

  describe("space key", () => {
    it.effect("SPACE starts the game from NotStarted", () =>
      Effect.gen(function*() {
        const story = yield* Story.make(SnakeGame, {})
        story.given(notStartedModel).send(pressedKey(" "))
        assert.strictEqual(story.model.gameState, "Playing")
      }))

    it.effect("SPACE pauses the game when Playing", () =>
      Effect.gen(function*() {
        const story = yield* Story.make(SnakeGame, {})
        story.given(playingModel).send(pressedKey(" "))
        assert.strictEqual(story.model.gameState, "Paused")
      }))

    it.effect("SPACE on GameOver does nothing", () =>
      Effect.gen(function*() {
        const story = yield* Story.make(SnakeGame, {})
        story.given({ ...playingModel, gameState: "GameOver" }).send(
          pressedKey(" ")
        )
        assert.strictEqual(story.model.gameState, "GameOver")
      }))
  })

  describe("restart", () => {
    it.effect("R fires GenerateApplePosition and resets the snake", () =>
      Effect.gen(function*() {
        const story = yield* Story.make(SnakeGame, {})
        story.given({ ...playingModel, points: 100 }).send(pressedKey("r"))
        assert.strictEqual(story.model.gameState, "NotStarted")
        assert.strictEqual(story.model.points, 0)
        assert.strictEqual(story.model.direction, "Right")
        story.expectExact(GenerateApplePosition.make({ snake: initialSnake }))
          .resolve(GenerateApplePosition, { x: 5, y: 5 })
        assert.deepStrictEqual(story.model.apple, { x: 5, y: 5 })
      }))
  })

  describe("TickedClock", () => {
    it.effect("moves the snake one cell while Playing", () =>
      Effect.gen(function*() {
        const story = yield* Story.make(SnakeGame, {})
        story.given(playingModel).subscription(
          gameClock,
          SnakeGameMessage.TickedClock()
        )
        assert.deepStrictEqual(story.model.snake[0], { x: 11, y: 10 })
      }))

    it.effect("does nothing when not Playing", () =>
      Effect.gen(function*() {
        const story = yield* Story.make(SnakeGame, {})
        story.given(notStartedModel).send(SnakeGameMessage.TickedClock())
        assert.deepStrictEqual(story.model.snake, initialSnake)
      }))

    it.effect("eating an apple grows the snake, adds points, and requests a new apple", () =>
      Effect.gen(function*() {
        const aboutToEatModel: SnakeGameModel = {
          ...playingModel,
          apple: { x: 11, y: 10 }
        }
        const story = yield* Story.make(SnakeGame, {})
        story.given(aboutToEatModel)
          .subscription(gameClock, SnakeGameMessage.TickedClock())
          .resolve(GenerateApplePosition, { x: 5, y: 5 })
        assert.strictEqual(
          story.model.snake.length,
          aboutToEatModel.snake.length + 1
        )
        assert.strictEqual(story.model.points, 10)
        assert.deepStrictEqual(story.model.apple, { x: 5, y: 5 })
      }))
  })

  describe("head", () => {
    it.effect("the title shows the score", () =>
      Effect.gen(function*() {
        const story = yield* Story.make(SnakeGame, {})
        story.given({ ...playingModel, points: 40 })
        assert.deepStrictEqual(Story.head(story.current), [
          Head.title("Snake | 40 pts")
        ])
      }))
  })
})
