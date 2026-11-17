import { Component, Mount } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import type { TestContext } from "vitest"
import { SaveTodo, TodoItem, TodoItemMessage } from "./fixtures/components.ts"

const todo = { id: "t1", title: "buy milk", done: false }
const save = TodoItemMessage.make({ _tag: "Save" })

const Hello = Mount.make("Hello", { args: {} }, () => Effect.succeed(Component.noop))
const Greeting = Component.define({
  name: "Greeting",
  model: Schema.Struct({}),
  message: Schema.String,
  elements: Html
}).make({
  init: () => ({}),
  update: (model) => model,
  view: (_, h) => h.p.onMount(Hello()).children("hello")
})

// The tests that fail on purpose run with the scope `it.effect` provides, so the end check runs as that
// scope closes, after the test's own code. `fails` turns their failure into a pass, and the errors
// vitest saw are recorded here for the last test to read, so the block runs in order, and as a whole.
describe("make's end check, in the scope it.effect provides", { concurrent: false }, () => {
  const reported = new Map<string, ReadonlyArray<string>>()
  const record = (ctx: TestContext) =>
    ctx.onTestFinished(({ task }) => {
      reported.set(task.name, (task.result?.errors ?? []).map((error) => error.message))
    })

  it.effect("passes when the test settles everything", () =>
    Effect.gen(function*() {
      const story = yield* Story.make(TodoItem, { todo })
      story.send(save)
      story.resolve(SaveTodo, TodoItemMessage.make({ _tag: "Saved" }))
      const scene = yield* Scene.make(Greeting, {})
      scene.mounted(Hello)
    }))

  it.effect.fails("a Story that ends with a Command pending", (ctx) =>
    Effect.gen(function*() {
      record(ctx)
      const story = yield* Story.make(TodoItem, { todo })
      story.send(save)
      story.expectExact(SaveTodo)
    }))

  it.effect.fails("a Scene that ends with a mount not acknowledged", (ctx) =>
    Effect.gen(function*() {
      record(ctx)
      yield* Scene.make(Greeting, {})
    }))

  it.effect.fails("a test whose body failed", (ctx) =>
    Effect.gen(function*() {
      record(ctx)
      const story = yield* Story.make(TodoItem, { todo })
      story.send(save)
      assert.fail("the body's own failure")
    }))

  it("reported the end check's failure, or only the body's when the body failed", () => {
    assert.deepStrictEqual([...reported.keys()], [
      "a Story that ends with a Command pending",
      "a Scene that ends with a mount not acknowledged",
      "a test whose body failed"
    ])
    const [command] = reported.get("a Story that ends with a Command pending")!
    assert.match(
      command!,
      /^Story\.make: the test ends with work not settled or acknowledged:\n {2}- todos\/SaveTodo\(.*\) \[running\] is pending/
    )
    assert.lengthOf(reported.get("a Story that ends with a Command pending")!, 1)
    assert.lengthOf(reported.get("a Scene that ends with a mount not acknowledged")!, 1)
    assert.match(
      reported.get("a Scene that ends with a mount not acknowledged")![0]!,
      /^Scene\.make: the test ends with work not settled or acknowledged:\n {2}- the mount Hello\(\{\}\) on <p> started/
    )
    // The Command the body left pending would fail the end check, but the body failed first.
    assert.deepStrictEqual(reported.get("a test whose body failed"), ["the body's own failure"])
  })
})
