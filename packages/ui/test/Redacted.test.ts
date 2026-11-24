import { Component, Query, Renderer } from "@effect/ui"
import * as componentQueries from "@effect/ui/internal/queries"
import * as routeRun from "@effect/ui/internal/routeRun"
import * as runtime from "@effect/ui/internal/runtime"
import * as services from "@effect/ui/internal/services"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Logger, Redacted, Schema } from "effect"

/**
 * A `Schema.Redacted` in a component's state keeps that state out of JSON:
 * the history snapshot, the server's page state, and decoding either.
 */

class GetToken extends Query.Service<GetToken>()(
  "test/GetToken",
  {
    args: {},
    success: Schema.Redacted(Schema.String),
    error: Schema.Never,
    staleTime: "1 minute"
  },
  Effect.succeed(() => Effect.succeed(Redacted.make("loaded-secret")))
) {}

class GetByKey extends Query.Service<GetByKey>()(
  "test/GetByKey",
  {
    args: { key: Schema.Redacted(Schema.String) },
    success: Schema.String,
    error: Schema.Never,
    staleTime: "1 minute"
  },
  Effect.succeed(() => Effect.succeed("ok"))
) {}

class GetFailing extends Query.Service<GetFailing>()(
  "test/GetFailing",
  {
    args: {},
    success: Schema.String,
    error: Schema.Redacted(Schema.String),
    staleTime: "1 minute"
  },
  Effect.succeed(() => Effect.fail(Redacted.make("error-secret")))
) {}

/** A Redacted in a query's args, in its error, and in a keyed query's args. */
const ByArgs = Component.define({
  name: "ByArgs",
  model: Schema.Number,
  message: Schema.Never,
  queries: {
    value: {
      query: GetByKey,
      args: () => ({ key: Redacted.make("args-secret") })
    }
  }
}).make({
  init: () => 0,
  update: ($) => $.model,
  view: (h, n) => h.text(String(n))
})
const ByError = Component.define({
  name: "ByError",
  model: Schema.Number,
  message: Schema.Never,
  queries: { value: { query: GetFailing, args: () => ({}) } }
}).make({
  init: () => 0,
  update: ($) => $.model,
  view: (h, n) => h.text(String(n))
})
const ByKeys = Component.define({
  name: "ByKeys",
  model: Schema.Number,
  message: Schema.Never,
  queries: {
    value: {
      queryMany: GetByKey,
      args: () => [{ key: Redacted.make("keyed-secret") }]
    }
  }
}).make({
  init: () => 0,
  update: ($) => $.model,
  view: (h, n) => h.text(String(n))
})

const Secret = Component.define({
  name: "Secret",
  model: Schema.Struct({
    token: Schema.Redacted(Schema.String),
    n: Schema.Number
  }),
  message: Schema.Never
}).make({
  init: () => ({ token: Redacted.make("model-secret"), n: 0 }),
  update: ($) => $.model,
  view: (h, model) => h.text(String(model.n))
})

const Loaded = Component.define({
  name: "Loaded",
  model: Schema.Number,
  message: Schema.Never,
  queries: { token: { query: GetToken, args: () => ({}) } }
}).make({
  init: () => 0,
  update: ($) => $.model,
  view: (h, n) => h.text(String(n))
})

interface Tree {
  readonly n: number
  readonly children: ReadonlyArray<Tree>
}
const Tree: Schema.Codec<Tree> = Schema.Struct({
  n: Schema.Number,
  children: Schema.Array(Schema.suspend(() => Tree))
})

interface SecretTree {
  readonly token: Redacted.Redacted<string>
  readonly children: ReadonlyArray<SecretTree>
}
const SecretTree: Schema.Codec<SecretTree, unknown> = Schema.Struct({
  token: Schema.Redacted(Schema.String),
  children: Schema.Array(Schema.suspend(() => SecretTree))
})

/** The state an older build, without the Redacted check, would have written for `component`. */
const legacyState = (component: Component.Any, model: unknown) => {
  const bound = componentQueries.boundOf(component)!
  const codec = Schema.toCodecJson(
    Schema.Struct({
      model:
        (component as Component.Component<any, any, any, any, any, any, any>)
          .model,
      queries: bound.schema
    })
  )
  return Schema.encodeUnknownSync(codec)({ model, queries: bound.empty })
}

const Plain = Component.define({
  name: "Plain",
  model: Schema.Number,
  message: Schema.Never
}).make({
  init: () => 1,
  update: ($) => $.model,
  view: (h, n) => h.text(String(n))
})

const QueryPage = Component.define({
  name: "QueryPage",
  model: Schema.Null,
  message: Schema.Never
})
  .make({
    init: () => null,
    update: ($) => $.model,
    view: (h) =>
      h.el(
        "main",
        [
          ByArgs(h, { key: "args" }),
          ByError(h, { key: "error" }),
          ByKeys(h, { key: "keys" }),
          Plain(h, { key: "plain" })
        ]
      )
  })

const Page = Component.define({
  name: "Page",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.el(
      "main",
      [
        Secret(h, { key: "secret" }),
        Loaded(h, { key: "loaded" }),
        Plain(h, { key: "plain" })
      ]
    )
})

/** Router hooks that keep the root's handle and restore `stored` by path. */
const historyHooks = (stored: Record<string, unknown> = {}) => {
  let handle: services.RootHandle | undefined
  const hooks: services.RootHooks = {
    attach: (root) => {
      handle = root
      return () => {}
    },
    afterFlush: () => {},
    restore: (path) =>
      Object.hasOwn(stored, path)
        ? { state: stored[path], reported: undefined }
        : undefined,
    entry: () => stored,
    prefetch: () => () => {},
    kernel: routeRun.make
  }
  return {
    hooks,
    snapshot: () => {
      const out: Record<string, unknown> = {}
      handle!.snapshot(out)
      return out
    }
  }
}

const mountWith = (hooks: services.RootHooks) =>
  TestHost.mount(Page, {}).pipe(
    Effect.provideService(services.RootHooks, hooks),
    Effect.provide(GetToken.layer)
  )

describe("Redacted state", () => {
  it.effect("leaves a Model or a query result holding a Redacted out of the history snapshot", () =>
    Effect.gen(function*() {
      const history = historyHooks()
      const root = yield* mountWith(history.hooks)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "001")
      const snapshot = history.snapshot()
      assert.deepStrictEqual(Object.keys(snapshot), [
        "/Page",
        "/Page/Plain[plain]"
      ])
      assert.notInclude(JSON.stringify(snapshot), "secret")
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

  it.effect("doesn't restore stored state for a component whose state holds a Redacted", () =>
    Effect.gen(function*() {
      const loaded = legacyState(Loaded, 7)
      const history = historyHooks({
        "/Page/Secret[secret]": { token: "written-by-an-older-build", n: 7 },
        "/Page/Loaded[loaded]": loaded,
        "/Page/Plain[plain]": 7
      })
      const root = yield* mountWith(history.hooks)
      yield* TestHost.settle
      // Only the plain component adopts its stored Model.
      assert.strictEqual(root.text(), "007")
      assert.isTrue(
        Exit.isFailure(
          Effect.runSyncExit(
            runtime.stateCodecOf(Secret).decode({ token: "plain", n: 1 })
          )
        )
      )
      assert.isTrue(
        Exit.isFailure(
          Effect.runSyncExit(runtime.stateCodecOf(Loaded).decode(loaded))
        )
      )
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

  it.effect("defers an instance whose state holds a Redacted on the server, and warns once per component", () =>
    Effect.gen(function*() {
      const warnings: Array<unknown> = []
      const logger = Logger.make<unknown, void>((options) => {
        if (options.logLevel === "Warn") warnings.push(options.message)
      })
      const render = Renderer.prerender(Page, {}).pipe(
        Effect.provide(GetToken.layer),
        Effect.provide(Logger.layer([logger]))
      )
      const first = yield* render
      yield* render
      assert.deepStrictEqual(first.state["~deferred"], [
        "/Page/Secret[secret]",
        "/Page/Loaded[loaded]"
      ])
      assert.deepStrictEqual(
        Object.keys(first.state).filter((key) => key.startsWith("/")),
        [
          "/Page",
          "/Page/Plain[plain]"
        ]
      )
      const paths = Object.fromEntries(
        Object.entries(first.state).filter(([key]) => key.startsWith("/"))
      )
      assert.notInclude(JSON.stringify(paths), "secret")
      assert.deepStrictEqual(
        warnings.map((message) => String(message).split(":")[0]),
        ["Secret", "Loaded"]
      )
    }))

  it.effect("finds a Redacted in a query's args, error or keyed args, and leaves its page state out", () =>
    Effect.gen(function*() {
      for (const part of [ByArgs, ByError, ByKeys]) {
        assert.isTrue(runtime.stateCodecOf(part).redacted)
      }
      const rendered = yield* Renderer.prerender(QueryPage, {}).pipe(
        Effect.provide([GetByKey.layer, GetFailing.layer]),
        Effect.provide(Logger.layer([]))
      )
      assert.deepStrictEqual(rendered.state["~deferred"], [
        "/QueryPage/ByArgs[args]",
        "/QueryPage/ByError[error]",
        "/QueryPage/ByKeys[keys]"
      ])
      const paths = Object.fromEntries(
        Object.entries(rendered.state).filter(([key]) => key.startsWith("/"))
      )
      assert.deepStrictEqual(Object.keys(paths), [
        "/QueryPage",
        "/QueryPage/Plain[plain]"
      ])
      assert.notInclude(JSON.stringify(paths), "secret")
    }))

  it.effect("serialises a suspended or recursive Schema without a Redacted, and finds one behind a suspend", () =>
    Effect.gen(function*() {
      const Lazy = Component.define({
        name: "Lazy",
        model: Schema.suspend(() => Schema.Number),
        message: Schema.Never
      })
        .make({
          init: () => 1,
          update: ($) => $.model,
          view: (h, n) => h.text(String(n))
        })
      const rendered = yield* Renderer.prerender(Lazy, {}).pipe(
        Effect.provide(Logger.layer([]))
      )
      assert.deepStrictEqual(rendered.state["~deferred"], [])
      assert.strictEqual(rendered.state["/Lazy"], 1)
      const component = (model: Schema.Codec<any, any>) =>
        Component.define({
          name: "Tree",
          model,
          message: Schema.Never
        }).make({
          init: () => null as any,
          update: ($) => $.model,
          view: (h) => h.text("")
        })
      assert.isFalse(runtime.stateCodecOf(component(Tree)).redacted)
      assert.isTrue(runtime.stateCodecOf(component(SecretTree)).redacted)
    }))
})
