import { OpenTuiTest } from "@effect/ui-opentui/testing"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { SnakeGame, SnakeGameMessage } from "./SnakeGame.ts"

describe("SnakeGame TUI", () => {
  it.effect("starts on space, turns on arrows, advances on tick, and quits on q", () =>
    Effect.gen(function*() {
      const app = yield* OpenTuiTest.mount(SnakeGame, {}, {
        width: 50,
        height: 30
      })

      expect(app.root.model()?.gameState).toBe("NotStarted")
      expect(app.titles).toEqual(["Snake | 0 pts"])
      expect(app.captureFrame()).toContain("Press SPACE to start")

      yield* app.pressKey(" ")
      expect(app.root.model()?.gameState).toBe("Playing")

      yield* app.pressArrow("down")
      expect(app.root.model()?.nextDirection).toBe("Down")

      app.root.send(SnakeGameMessage.TickedClock())
      yield* app.settle
      expect(app.root.model()?.direction).toBe("Down")

      yield* app.pressKey("q")
      expect(app.setup.renderer.isDestroyed).toBe(true)
    }))
})
