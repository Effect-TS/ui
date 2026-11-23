// @vitest-environment happy-dom
import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { Scene } from "foldkit/test"
import {
  init,
  type Model,
  postsQuery,
  update,
  view
} from "./posts.ts"

const shows = (model: Model, ...texts: ReadonlyArray<string>) =>
  Scene.scene(
    { update, view },
    Scene.given(model),
    ...texts.map((text) => Scene.expect(Scene.text(text)).toExist())
  )

describe("Foldkit 0.x posts", () => {
  it.effect("shows Loading posts, then the titles the fetch Command from init loads", () =>
    Effect.gen(function*() {
      const { model, commands = [] } = init()
      shows(model, "Loading posts")
      expect(commands.map((command) => command.name)).toEqual([
        postsQuery.Fetch.name
      ])
      const fiber = yield* Effect.forkChild(commands[0].effect)
      yield* TestClock.adjust("300 millis")
      shows(
        update(model, yield* Fiber.join(fiber)).model,
        "Foldkit Joins Effect",
        "Foldkit 0.x becomes Effect UI"
      )
    }))
})
