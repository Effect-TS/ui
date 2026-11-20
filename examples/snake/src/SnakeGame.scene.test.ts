import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { Snake } from "./domain/index.ts"
import { GenerateApplePosition, SnakeGame, SnakeGameMessage, type SnakeGameModel } from "./SnakeGame.ts"

const baseModel: SnakeGameModel = {
  snake: Snake.create({ x: 10, y: 10 }),
  apple: { x: 15, y: 15 },
  direction: "Right",
  nextDirection: "Right",
  gameState: "NotStarted",
  points: 0,
  highScore: 0
}

describe("SnakeGame", () => {
  it.effect("initial view shows the heading, score, and start prompt", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(SnakeGame, {})
      s.given(baseModel)
        .expect(HtmlLocator.role("heading", { name: "Snake Game" })).toExist()
        .expect(Locator.text("Score: 0")).toExist()
        .expect(Locator.text("High Score: 0")).toExist()
        .expect(Locator.text("Press SPACE to start")).toExist()
    }))

  it.effect("renders the keyboard instructions", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(SnakeGame, {})
      s.given(baseModel)
        .expect(Locator.text("Use ARROW KEYS or WASD to move")).toExist()
        .expect(Locator.text("SPACE to pause/start")).toExist()
        .expect(Locator.text("R to restart")).toExist()
    }))

  it.effect("shows the paused prompt while the game is paused", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(SnakeGame, {})
      s.given({ ...baseModel, gameState: "Paused" })
        .expect(Locator.text("Paused - SPACE to continue")).toExist()
    }))

  it.effect("shows the game-over prompt at the end of a run", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(SnakeGame, {})
      s.given({ ...baseModel, gameState: "GameOver", points: 50 })
        .expect(Locator.text("Game Over - Press R to restart")).toExist()
        .expect(Locator.text("Score: 50")).toExist()
    }))

  it.effect("the current and high scores reflect the Model", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(SnakeGame, {})
      s.given({ ...baseModel, gameState: "Playing", points: 120, highScore: 200 })
        .expect(Locator.text("Score: 120")).toExist()
        .expect(Locator.text("High Score: 200")).toExist()
    }))

  it.effect("SPACE on the document starts the game and shows the playing prompt", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(SnakeGame, {})
      s.given(baseModel)
        .fireDocument("keydown", { key: " " }).expectDefaultPrevented()
        .expect(Locator.text("Playing - SPACE to pause")).toExist()
    }))

  it.effect("an arrow key on the document steers and cancels its default", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(SnakeGame, {})
      s.given({ ...baseModel, gameState: "Playing", apple: { x: 10, y: 9 } })
        .fireDocument("keydown", { key: "ArrowUp" }).expectDefaultPrevented()
        .subscription("gameClock:150", SnakeGameMessage.TickedClock())
        .expect(Locator.text("Score: 10")).toExist()
        .resolve(GenerateApplePosition, { x: 0, y: 0 })
    }))

  it.effect("keys the game doesn't handle keep their default", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(SnakeGame, {})
      s.given({ ...baseModel, gameState: "Playing" })
        .fireDocument("keydown", { key: "Tab" }).expectIgnored()
        .fireDocument("keydown", { key: "R" }).expectIgnored()
        .fireDocument("keydown", { key: "r", ctrl: true }).expectIgnored()
        .fireDocument("keydown", { key: "ArrowUp", defaultPrevented: true }).expectIgnored()
    }))
})
