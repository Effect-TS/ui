import { Component } from "@effect/ui"
import * as runtime from "@effect/ui/internal/runtime"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"
import { files, pending } from "./pending.ts"

const Hello = Component.define({
  name: "Hello",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.el("p", "hello")
})

describe("the kernel project", () => {
  it.effect("runs today's runtime surface on the kernel", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(
        runtime.prerender(Hello as any, {}, { budget: 0, elements: "any" })
      )
      assert.isTrue(Exit.isFailure(exit))
      assert.include(
        String(Exit.isFailure(exit) && exit.cause),
        "not ported yet: server rendering"
      )
    }))

  it.effect("mounts through TestHost, which imports the runtime by a relative path, on the kernel", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Hello, {})
      assert.strictEqual(root.text(), "hello")
      assert.match(root.session, /-k[0-9a-z]+$/)
    }).pipe(Effect.provide(TestHost.layer())))

  it("lists only files it runs as pending", () => {
    assert.deepStrictEqual(
      Object.keys(pending).filter((file) => !files.includes(file)),
      []
    )
  })
})
