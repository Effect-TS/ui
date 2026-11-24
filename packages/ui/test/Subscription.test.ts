import { Component, Subscription, UiSchema } from "@effect/ui"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema, Stream } from "effect"

describe("Subscription", () => {
  it("a Subscription without deps is keyed by its name", () => {
    assert.strictEqual(Subscription.make("tick", Stream.empty).key, "tick")
  })

  it("a name can't pass for a name with deps", () => {
    assert.strictEqual(
      Subscription.make("page:null", Stream.empty).key,
      "page::null"
    )
    assert.strictEqual(
      Subscription.make("page", null, () => Stream.empty).key,
      "page:null"
    )
    assert.strictEqual(
      Subscription.make("a:b", "c", () => Stream.empty).key,
      "a::b:\"c\""
    )
  })

  it("numbers JSON can't tell apart keep distinct keys", () => {
    const key = (dep: Subscription.Dep) =>
      Subscription.make("page", dep, () => Stream.empty).key
    const keys = [
      key(NaN),
      key(Infinity),
      key(-Infinity),
      key(null),
      key(0),
      key(-0),
      key("null")
    ]
    assert.strictEqual(new Set(keys).size, keys.length)
    assert.strictEqual(key(NaN), "page:NaN")
    assert.strictEqual(key(-0), "page:-0")
    assert.strictEqual(key(0), "page:0")
  })

  it("deps join the key without colliding", () => {
    const key = (deps: Subscription.Deps) =>
      Subscription.make("room", deps, () => Stream.empty).key
    assert.strictEqual(key("42"), "room:\"42\"")
    assert.strictEqual(key(42), "room:42")
    assert.notStrictEqual(key("1"), key(1))
    assert.notStrictEqual(key(["a,b", "c"]), key(["a", "b,c"]))
    assert.notStrictEqual(key([true, null]), key(["true", "null"]))
    assert.strictEqual(key([1, "x"]), Subscription.keyOf("room", [1, "x"]))
  })

  it("keeps the name and deps its key was built from", () => {
    const room = Subscription.make("room", "42", () => Stream.empty)
    assert.deepStrictEqual([room.name, room.deps, room.key], [
      "room",
      ["42"],
      "room:\"42\""
    ])
    // A single dep and a one-element tuple share a key, so they share their deps.
    assert.deepStrictEqual(
      Subscription.make("room", ["42"], () => Stream.empty).deps,
      ["42"]
    )
    assert.deepStrictEqual(
      Subscription.make("cell", [1, true], () => Stream.empty).deps,
      [1, true]
    )
    // No deps isn't an empty tuple of them: the keys differ too.
    assert.isUndefined(Subscription.make("tick", Stream.empty).deps)
    assert.deepStrictEqual(
      Subscription.make("tick", [], () => Stream.empty).deps,
      []
    )
    // The key escapes the name, and the name is kept as given.
    assert.strictEqual(
      Subscription.make("page:null", Stream.empty).name,
      "page:null"
    )
  })

  it.effect("builds lazily with only its deps each time the Stream runs", () =>
    Effect.gen(function*() {
      const seen: Array<unknown> = []
      const subscription = Subscription.make("room", ["a", 1], (deps) => {
        seen.push(deps)
        return Stream.empty
      })
      assert.deepStrictEqual(seen, [])
      yield* Stream.runDrain(subscription.stream)
      yield* Stream.runDrain(subscription.stream)
      assert.deepStrictEqual(seen, [["a", 1], ["a", 1]])
    }))

  it.effect("direct delivers latest state, runs accepted synchronously, and detaches on stop", () =>
    Effect.gen(function*() {
      let fire: ((value: number) => void) | undefined
      let detached = false
      const accepted: Array<number> = []
      const Message = UiSchema.TaggedEnum({
        Got: { value: Schema.Number },
        Stop: {}
      })

      const Direct = Component.define({
        name: "DirectSub",
        model: Schema.Struct({
          count: Schema.Number,
          active: Schema.Boolean
        }),
        message: Message
      }).make({
        init: () => ({ count: 1, active: true }),
        update: {
          Got: ($, { value }) => $.evolve({ count: (n) => n + value }),
          Stop: ($) => $.evolve({ active: false })
        },
        subscriptions: ({ model }) => [
          model.active && Subscription.direct<number, typeof Message.Type>(
            "direct",
            undefined,
            model.count,
            (_ctx, { emit, enter }) => {
              fire = (value) =>
                enter((latest) =>
                  emit(Message.Got({ value: value * latest }), () => {
                    accepted.push(latest)
                  })
                )
              return () => {
                detached = true
                fire = undefined
              }
            }
          )
        ],
        view: (h, model) => h.text(String(model.count))
      })

      const root = yield* TestHost.mount(Direct, {})
      yield* TestHost.settle

      fire!(2)
      assert.deepStrictEqual(accepted, [1])
      yield* TestHost.settle
      assert.strictEqual(root.model()?.count, 3)

      fire!(2)
      assert.deepStrictEqual(accepted, [1, 3])
      yield* TestHost.settle
      assert.strictEqual(root.model()?.count, 9)

      root.send(Message.Stop())
      yield* TestHost.settle
      assert.isTrue(detached)
      assert.isUndefined(fire)
    }).pipe(Effect.provide(TestHost.layer())))
})
