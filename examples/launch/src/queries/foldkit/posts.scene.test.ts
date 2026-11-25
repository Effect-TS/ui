// @vitest-environment happy-dom
import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Result } from "effect"
import { TestClock } from "effect/testing"
import { Scene } from "foldkit/test"
import { type Post, PostsApi } from "../Posts.ts"
import {
  DelaySearch,
  init,
  Message,
  postsQuery,
  update,
  view
} from "./posts.ts"

const joins = { id: "1", title: "Foldkit Joins Effect" }
const becomes = { id: "2", title: "Foldkit 0.x becomes Effect UI" }
const search = Scene.label("Search posts")

const completedFetch = (
  search: string,
  generation: number,
  result: Result.Result<ReadonlyArray<Post>, string>
) =>
  postsQuery.Message.CompletedFetch({
    args: { search },
    generation,
    result
  })

// The Model once the fetch Command from init has loaded every post.
const loaded = update(
  init().model,
  Message.GotPostsMessage({
    message: completedFetch("", 1, Result.succeed([joins, becomes]))
  })
).model

const resolveDelaySearch = (version: number) =>
  Scene.Command.resolve(
    DelaySearch({ version }),
    Message.CompletedDelaySearch({ version })
  )

describe("Foldkit 0.x posts", () => {
  it.effect("shows Loading posts, then every post the fetch Command from init loads", () =>
    Effect.gen(function*() {
      const { model, commands = [] } = init()
      Scene.scene(
        { update, view },
        Scene.given(model),
        Scene.expect(Scene.text("Loading posts")).toExist()
      )
      expect(commands.map((command) => command.name)).toEqual([
        postsQuery.Fetch.name
      ])
      const fiber = yield* Effect.forkChild(
        Effect.provide(commands[0].effect, PostsApi.layer)
      )
      yield* TestClock.adjust("300 millis")
      Scene.scene(
        { update, view },
        Scene.given(update(model, yield* Fiber.join(fiber)).model),
        Scene.expect(Scene.text(joins.title)).toExist(),
        Scene.expect(Scene.text(becomes.title)).toExist()
      )
    }))

  it.effect("DelaySearch completes after 300 ms", () =>
    Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(
        DelaySearch({ version: 1 }).effect
      )
      yield* TestClock.adjust("299 millis")
      expect(fiber.pollUnsafe()).toBeUndefined()
      yield* TestClock.adjust("1 millis")
      expect(yield* Fiber.join(fiber)).toEqual(
        Message.CompletedDelaySearch({ version: 1 })
      )
    }))

  // A Scene resolves each Command before the next keystroke, so the
  // superseded delay is checked on update itself.
  it("a DelaySearch that a later keystroke superseded fetches nothing", () => {
    const typed = ["u", "ui"].reduce(
      (model, search) =>
        update(model, Message.UpdatedSearch({ search })).model,
      loaded
    )
    expect(
      update(typed, Message.CompletedDelaySearch({ version: 1 }))
    ).toEqual({ model: typed })
    const { commands = [] } = update(
      typed,
      Message.CompletedDelaySearch({ version: 2 })
    )
    expect(commands.map(({ name, args }) => ({ name, args })))
      .toEqual([{
        name: postsQuery.Fetch.name,
        args: { args: { search: "ui" }, generation: 2 }
      }])
  })

  it("fetches when the DelaySearch of a keystroke completes", () => {
    Scene.scene(
      { update, view },
      Scene.given(loaded),
      Scene.type(search, "ui"),
      Scene.expect(Scene.text("Loading posts")).toExist(),
      Scene.Command.expectExact(DelaySearch({ version: 1 })),
      resolveDelaySearch(1),
      Scene.Command.expectExact(
        postsQuery.Fetch({ args: { search: "ui" }, generation: 2 })
      ),
      Scene.expect(Scene.text("Loading posts")).toExist(),
      Scene.Command.resolve(
        postsQuery.Fetch,
        completedFetch("ui", 2, Result.succeed([becomes]))
      ),
      Scene.expect(Scene.text(becomes.title)).toExist(),
      Scene.expect(Scene.text(joins.title)).toBeAbsent()
    )
  })

  it("shows a loaded search at once, without a fetch", () => {
    Scene.scene(
      { update, view },
      Scene.given(loaded),
      Scene.type(search, "ui"),
      resolveDelaySearch(1),
      Scene.Command.resolve(
        postsQuery.Fetch,
        completedFetch("ui", 2, Result.succeed([becomes]))
      ),
      Scene.type(search, ""),
      Scene.expect(Scene.text(joins.title)).toExist(),
      resolveDelaySearch(2),
      Scene.Command.expectNone()
    )
  })

  it("shows Could not load posts when the fetch fails", () => {
    Scene.scene(
      { update, view },
      Scene.given(loaded),
      Scene.type(search, "ui"),
      resolveDelaySearch(1),
      Scene.Command.resolve(
        postsQuery.Fetch,
        completedFetch("ui", 2, Result.fail("offline"))
      ),
      Scene.expect(Scene.text("Could not load posts")).toExist()
    )
  })
})
