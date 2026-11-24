import {
  Command,
  Component,
  MessageLog,
  Query,
  Route,
  Router,
  UiSchema
} from "@effect/ui"
import { Html, HtmlServer } from "@effect/ui/html"
import { Locator, Scene, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Layer, Option, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { TestClock } from "effect/testing"
import { defect } from "./utils/scoped.ts"

const Message = Schema.Struct({ id: Schema.String, text: Schema.String })
const Page = Schema.Struct({
  messages: Schema.Array(Message),
  next: Schema.NullOr(Schema.Number)
})

/** A room of `db.length` pages, 10 ms each. Every page after the first repeats the first message. */
const makeApp = () => {
  const db = { length: 3, delay: 10, fail: new Set<number>() }
  class ListMessages extends Query.InfiniteService<ListMessages>()(
    "chat/ListMessages",
    {
      args: { room: Schema.String },
      page: Page,
      items: (page) => page.messages,
      key: (message) => message.id,
      error: Schema.String,
      cursor: Schema.Number,
      next: (lastPage) => Option.fromNullishOr(lastPage.next),
      staleTime: "30 seconds"
    },
    Effect.succeed(({ room }, cursor) =>
      Effect.gen(function*() {
        const index = Option.getOrElse(cursor, () => 0)
        if (db.delay > 0) yield* Effect.sleep(db.delay)
        if (db.fail.has(index)) return yield* Effect.fail("nope")
        const messages = [{ id: "m" + index, text: room + index }]
        return {
          messages: index === 0
            ? messages
            : [{ id: "m0", text: "again" }, ...messages],
          next: index + 1 < db.length ? index + 1 : null
        }
      })
    )
  ) {}

  const ChatMessage = UiSchema.TaggedEnum({
    Changed: {},
    More: {},
    Refresh: {}
  })
  const Chat = Component.define({
    name: "Chat",
    props: Schema.Struct({ room: Schema.String }),
    model: Schema.Struct({}),
    message: ChatMessage,
    elements: Html,
    queries: {
      messages: {
        query: ListMessages,
        args: ({ props }) =>
          props.room === "" ? undefined : { room: props.room },
        onChange: () => ChatMessage.Changed()
      }
    }
  }).make({
    init: () => ({}),
    update: ($, message) =>
      ChatMessage.match(message, {
        // On the server, a load more is dropped and reported.
        Changed: () =>
          $.props.room === "ssr" ? $.loadMore("messages") : $.model,
        More: () => $.loadMore("messages"),
        Refresh: () => $.reset("messages")
      }),
    view: (h) =>
      h.el("div").children(
        h.el("p").on("click", ChatMessage.More()).children(
          AsyncResult.match(h.queries.messages, {
            onInitial: () => "loading",
            onFailure: () => "failed",
            onSuccess: ({ value: { items, more, pages } }) =>
              items.map((message) => message.text).join(",") + " /" +
              pages.length + " " + more._tag
          })
        ),
        // No text, so the view's text stays the list's.
        h.el("button").attr("data-testid", "refresh").on(
          "click",
          ChatMessage.Refresh()
        )
      )
  })
  return { db, ListMessages, ChatMessage, Chat, layer: ListMessages.layer }
}

const run = <A, E>(layer: Layer.Layer<any>, effect: Effect.Effect<A, E, any>) =>
  effect.pipe(
    Effect.provide(layer),
    Effect.scoped,
    Effect.provide(TestHost.layer())
  ) as Effect.Effect<A, E>

/** Starts what is due and lets one page finish. */
const page = TestHost.settle.pipe(
  Effect.andThen(TestClock.adjust("10 millis")),
  Effect.andThen(TestHost.settle)
)

describe("Infinite queries", () => {
  it.effect("h.queries opens a list as its items, pages and more; $.loadMore appends and $.reset drops pages", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.Chat, { room: "r" })
        yield* page
        assert.strictEqual(root.text(), "r0 /1 Available")
        root.send(app.ChatMessage.More())
        yield* TestHost.settle
        // A change of `more` is a result write of its own.
        assert.strictEqual(root.text(), "r0 /1 Loading")
        yield* page
        // The second page repeats m0: the first stays.
        assert.strictEqual(root.text(), "r0,r1 /2 Available")
        root.send(app.ChatMessage.More())
        yield* page
        assert.strictEqual(root.text(), "r0,r1,r2 /3 End")
        assert.deepStrictEqual(
          root.entry(app.ListMessages, { room: "r" })?.more,
          { _tag: "End" }
        )
        root.send(app.ChatMessage.Refresh())
        yield* page
        assert.strictEqual(root.text(), "r0 /1 Available")
        assert.deepStrictEqual(
          root.fetches().map((fetch) => fetch.trigger + "@" + fetch.page),
          ["watch@0", "loadMore@1", "loadMore@2", "reset@0"]
        )
        // Both are logged on the update entry.
        const lists = root.log().flatMap((entry) =>
          entry._tag === "Update"
            ? (entry as MessageLog.Update).lists ?? []
            : []
        )
        assert.deepStrictEqual(lists, [
          { name: "messages", op: "loadMore" },
          { name: "messages", op: "loadMore" },
          { name: "messages", op: "reset" }
        ])
      })
    )
  })

  it.effect("a failed load more keeps the pages and shows Failed, and the next one clears it", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.Chat, { room: "r" })
        yield* page
        app.db.fail.add(1)
        root.send(app.ChatMessage.More())
        yield* page
        assert.strictEqual(root.text(), "r0 /1 Failed")
        app.db.fail.clear()
        root.send(app.ChatMessage.More())
        yield* TestHost.settle
        assert.strictEqual(root.text(), "r0 /1 Loading")
        yield* page
        assert.strictEqual(root.text(), "r0,r1 /2 Available")
      })
    )
  })

  it.effect("a failed load more's error goes through its Schema in the log, and a Wire replay reads it", () => {
    // The error is a number encoded as a string, so a codec that skips it fails to encode.
    class ListCodes extends Query.InfiniteService<ListCodes>()(
      "codes/ListCodes",
      {
        args: {},
        page: Schema.Array(Schema.String),
        items: (page) => page,
        key: (code) => code,
        error: Schema.NumberFromString,
        cursor: Schema.Number,
        next: () => Option.some(1),
        staleTime: "30 seconds"
      },
      Effect.succeed((_args, cursor) =>
        Option.isSome(cursor)
          ? Effect.fail(42)
          : Effect.sleep("10 millis").pipe(Effect.as(["a"]))
      )
    ) {}
    const CodesMessage = UiSchema.TaggedEnum({ More: {}, Look: {} })
    const Codes = Component.define({
      name: "Codes",
      model: Schema.String,
      message: CodesMessage,
      elements: Html,
      queries: { codes: { query: ListCodes, args: () => ({}) } }
    }).make({
      init: () => "",
      update: ($, message) =>
        CodesMessage.match(message, {
          More: () => $.loadMore("codes"),
          // What update reads of the failed load more, so a replay reproduces it only with the error.
          Look: () => {
            const codes = $.queries.codes
            if (!AsyncResult.isSuccess(codes)) return $.model
            const more = codes.value.more
            return more._tag === "Failed" ? "failed " + more.error : more._tag
          }
        }),
      view: (h, model) => h.p(model)
    })
    const warnings: Array<string> = []
    const encoder = MessageLog.makeEncoder({
      onWarning: (warning) => warnings.push(warning)
    })
    return run(
      ListCodes.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Codes, {})
        yield* page
        root.send(CodesMessage.More())
        yield* TestHost.settle
        root.send(CodesMessage.Look())
        yield* TestHost.settle
        assert.strictEqual(root.model(), "failed 42")

        const wire = root.log().map(encoder.encode)
        assert.deepStrictEqual(warnings, [])
        const changed = wire.filter((entry) =>
          entry._tag === "QueryChanged"
        ) as ReadonlyArray<
          { readonly result: ReadonlyArray<unknown> }
        >
        assert.deepStrictEqual(changed.at(-1)!.result.at(-1), [false, {
          Failed: "42"
        }])
        const replay = Story.fromLog(Codes, wire)
        assert.isUndefined(replay.divergence)
        assert.strictEqual(replay.model, "failed 42")
        const codes = replay.queries().codes
        assert.isTrue(AsyncResult.isSuccess(codes))
        assert.deepStrictEqual(
          AsyncResult.isSuccess(codes) ? codes.value.more : undefined,
          {
            _tag: "Failed",
            error: 42
          }
        )
      })
    )
  })

  it.effect("a load more on a disabled query does nothing", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.Chat, { room: "" })
        root.send(app.ChatMessage.More())
        yield* page
        assert.deepStrictEqual(root.fetches(), [])
        assert.strictEqual(root.text(), "loading")
      })
    )
  })

  it.effect("page state writes one has-more bit, and the log keeps Loading", () => {
    const app = makeApp()
    const encoder = MessageLog.makeEncoder()
    const json = (log: boolean) =>
      Schema.toCodecJson(
        Query.snapshotSchema(app.ListMessages, "messages", log)
      ) as unknown as Schema.Codec<
        unknown,
        unknown
      >
    const state = json(false)
    const log = json(true)
    /** The last result written for "messages": as page state encodes it, as the Wire does, and each decoded back. */
    const lastResult = (
      root: Pick<TestHost.TestRoot<any, any, any>, "log">
    ) => {
      const entry = [...root.log()].reverse().find((
        entry
      ): entry is MessageLog.QueryChanged =>
        entry._tag === "QueryChanged" && entry.name === "messages"
      )!
      const encoded = Schema.encodeUnknownSync(state)(
        entry.result
      ) as ReadonlyArray<unknown>
      const wire =
        (encoder.encode(entry) as { readonly result: ReadonlyArray<unknown> })
          .result
      return {
        result: entry.result,
        encoded,
        decoded: Schema.decodeUnknownSync(state)(encoded),
        wire,
        replayed: Schema.decodeUnknownSync(log)(wire)
      }
    }
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.Chat, { room: "r" })
        yield* page
        root.send(app.ChatMessage.More())
        yield* TestHost.settle
        const loading = lastResult(root)
        assert.deepStrictEqual(Query.snapshotData(loading.result)?.more, {
          _tag: "Loading"
        })
        assert.strictEqual(loading.encoded.length, 6)
        assert.strictEqual(loading.encoded[5], true)
        assert.deepStrictEqual(Query.snapshotData(loading.decoded)?.more, {
          _tag: "Available"
        })
        // The log's form ends with [waiting, more], so a replayed update reads the load more as in flight.
        assert.strictEqual(loading.wire.length, 7)
        assert.deepStrictEqual(loading.wire[6], [false, "Loading"])
        assert.deepStrictEqual(Query.snapshotData(loading.replayed)?.more, {
          _tag: "Loading"
        })
        yield* page
        root.send(app.ChatMessage.More())
        yield* page
        const ended = lastResult(root)
        assert.strictEqual(ended.encoded[5], false)
        assert.deepStrictEqual(Query.snapshotData(ended.decoded)?.more, {
          _tag: "End"
        })
        assert.deepStrictEqual(ended.wire[6], [false, "End"])
        assert.deepStrictEqual(Query.snapshotData(ended.replayed)?.more, {
          _tag: "End"
        })
      })
    )
  })

  it.effect("the server renders the first page, ships the page array, and drops a load more", () => {
    const app = makeApp()
    app.db.delay = 0
    return Effect.gen(function*() {
      const log = MessageLog.makeMemory({ size: 100 })
      const problems: Array<Query.Problem.Any> = []
      const result = yield* HtmlServer.renderToHtml(
        app.Chat.pipe(Component.provide(app.layer)),
        { room: "ssr" },
        {
          budget: "1 hour"
        }
      ).pipe(
        Effect.provideService(MessageLog.MessageLog, log),
        Effect.provideService(
          Query.Problems,
          (problem) => problems.push(problem)
        )
      )
      assert.include(result.html, "ssr0 /1 Available")
      assert.deepStrictEqual(problems.map((problem) => problem._tag), [
        "ServerCommandIssued"
      ])
      assert.include(JSON.stringify(result.state["~query"]), "ssr0")
      assert.notInclude(JSON.stringify(result.state["~query"]), "ssr1")
    })
  })

  it.effect("Story: a failure on a held page settles a pending load more, and reset keeps a Failure", () =>
    Effect.gen(function*() {
      const app = makeApp()
      const pageAt = (index: number, next: number | null) => ({
        messages: [{ id: "m" + index, text: "r" + index }],
        next
      })
      const s = yield* Story.make(app.Chat, { room: "r" })
      s.loaded("messages", [pageAt(0, 1), pageAt(1, 2)], { waiting: true })
        .send(app.ChatMessage.More())
      assert.deepStrictEqual(s.loadingMore, ["messages"])
      // Still walking: the load more waits on.
      s.loaded("messages", [pageAt(0, 1), pageAt(1, 2)], { waiting: true })
      assert.deepStrictEqual(s.loadingMore, ["messages"])
      s.loadFailed("messages", "nope")
      assert.deepStrictEqual(s.loadingMore, [])
      s.send(app.ChatMessage.Refresh())
      const result = s.queries.messages
      assert.strictEqual(result._tag, "Failure")
      if (result._tag === "Failure") {
        assert.isTrue(result.waiting)
        assert.deepStrictEqual(
          Cause.findErrorOption(result.cause),
          Option.some("nope")
        )
        assert.deepStrictEqual(
          Option.map(result.previousSuccess, (success) => success.value.pages),
          Option.some([pageAt(0, 1)])
        )
      }
      // The view shows the Failure, and still does after the reset.
      const scene = yield* Scene.make(app.Chat, { room: "r" })
      scene.loaded("messages", [pageAt(0, 1), pageAt(1, 2)], { waiting: true })
        .click("r0,r1 /2 Available")
        .loaded("messages", [pageAt(0, 1), pageAt(1, 2)], { waiting: true })
        .loadFailed("messages", "nope")
        .expect(Locator.text("failed", { exact: true })).toExist()
        .click(Locator.testId("refresh"))
        .expect(Locator.text("failed", { exact: true })).toExist()
    }))

  it.effect("Story: given starts an infinite query from its pages, with more from the last page", () =>
    Effect.gen(function*() {
      const app = makeApp()
      const pageAt = (index: number, next: number | null) => ({
        messages: [{ id: "m" + index, text: "r" + index }],
        next
      })
      const scene = yield* Scene.make(app.Chat, { room: "r" })
      scene.given({}, { messages: [pageAt(0, 1), pageAt(1, 2)] })
        .expect(Locator.text("r0,r1 /2 Available", { exact: true })).toExist()
        .given({}, { messages: [pageAt(0, 1), pageAt(1, null)] })
        .expect(Locator.text("r0,r1 /2 End", { exact: true })).toExist()
      const s = yield* Story.make(app.Chat, { room: "r" })
      s.given({}, { messages: [pageAt(0, 1), pageAt(1, null)] })
      const messages = s.queries.messages
      assert.deepStrictEqual(
        AsyncResult.isSuccess(messages) ? messages.value.more : undefined,
        { _tag: "End" }
      )
    }))

  it.effect("Story: a load more is pending until a step settles it, and reset sends the first page", () =>
    Effect.gen(function*() {
      const app = makeApp()
      const pageAt = (index: number, next: number | null) => ({
        messages: [{ id: "m" + index, text: "r" + index }],
        next
      })
      const shows = (text: string) => <S extends Scene.Steps.Any>(s: S): S =>
        s.expect(Locator.text(text, { exact: true })).toExist()
      const scene = yield* Scene.make(app.Chat, { room: "r" })
      scene.loaded("messages", [pageAt(0, 1)])
        .pipe(shows("r0 /1 Available"))
        .click("r0 /1 Available")
      assert.deepStrictEqual(scene.loadingMore, ["messages"])
      scene.pipe(shows("r0 /1 Loading"))
        .loadedMore("messages", pageAt(1, 2))
        .pipe(shows("r0,r1 /2 Available"))
        .click("r0,r1 /2 Available")
        .loadMoreFailed("messages", "nope")
        .pipe(shows("r0,r1 /2 Failed"))
        // The reset keeps the first page and makes more available again.
        .click(Locator.testId("refresh"))
        .pipe(shows("r0 /1 Available"))
      // The same steps in a story, which reads the query's pages.
      const s = yield* Story.make(app.Chat, { room: "r" })
      s.loaded("messages", [pageAt(0, 1)])
        .send(app.ChatMessage.More())
      assert.deepStrictEqual(s.loadingMore, ["messages"])
      s.loadedMore("messages", pageAt(1, 2))
        .send(app.ChatMessage.More())
        .loadMoreFailed("messages", "nope")
        .send(app.ChatMessage.Refresh())
      const messages = s.queries.messages
      assert.deepStrictEqual(
        AsyncResult.isSuccess(messages)
          ? [messages.value.pages, messages.value.more]
          : undefined,
        [[pageAt(0, 1)], { _tag: "Available" }]
      )
      const message = yield* defect(Effect.gen(function*() {
        const pending = yield* Story.make(app.Chat, { room: "r" })
        pending.loaded("messages", [pageAt(0, 1)]).send(app.ChatMessage.More())
      }))
      assert.match(message, /a load more of "messages" is pending/)
      assert.throws(
        () =>
          Story.start(app.Chat, { room: "r" }).loaded("messages", [
            pageAt(0, 1)
          ]).loadedMore(
            "messages",
            pageAt(1, null)
          ),
        /no load more of "messages" is pending/
      )
    }))

  it.effect("a history restore seeds the held pages stale and walks them again", () => {
    const app = makeApp()
    const ShellRoute = Route.union({
      Home: Route.make("/"),
      Chat: Route.make("/chat")
    })
    const ShellMessage = UiSchema.TaggedEnum({
      ChangedRoute: { route: ShellRoute },
      Go: {},
      Navigated: {}
    })
    const Shell = Component.define({
      name: "Shell",
      props: Schema.Struct({ route: ShellRoute }),
      model: ShellRoute,
      message: ShellMessage,
      elements: Html
    }).make({
      init: ($) => $.props.route,
      update: ($, message) =>
        ShellMessage.match(message, {
          ChangedRoute: ({ route }) => route,
          Go: () =>
            $.run(
              Router.push(ShellRoute, ShellRoute.Home()).pipe(
                Command.map(() => ShellMessage.Navigated())
              )
            ),
          Navigated: () => $.model
        }),
      subscriptions: ({ model }) => [
        Router.subscription(
          ShellRoute,
          model,
          (route) => ShellMessage.ChangedRoute({ route })
        )
      ],
      view: (h, model) =>
        model._tag === "Chat"
          ? app.Chat(h, { key: "chat", props: { room: "r" } })
          : h.el("p", "home")
    })
    const history = Router.memoryHistory("/chat")
    const hosted = (effect: Effect.Effect<void, unknown, any>) =>
      run(
        Layer.merge(Router.make({ routes: ShellRoute, history }), app.layer),
        effect
      )
    const mount = Effect.flatMap(
      Router.currentRoute(ShellRoute),
      (route) => TestHost.mount(Shell, { route })
    )
    return Effect.gen(function*() {
      yield* hosted(Effect.gen(function*() {
        const root = yield* mount
        yield* page
        Locator.fire(
          root.get(Locator.text("r0 /1 Available", { exact: true })),
          "click"
        )
        yield* page
        assert.strictEqual(root.text(), "r0,r1 /2 Available")
        root.send(ShellMessage.Go())
        yield* TestHost.settle
        assert.strictEqual(root.text(), "home")
      }))
      yield* hosted(Effect.gen(function*() {
        const root = yield* mount
        yield* TestHost.settle
        history.go(-1)
        yield* TestHost.settle
        // The two pages show at once, from the restored result, while they load again.
        assert.strictEqual(root.text(), "r0,r1 /2 Available")
        yield* page
        yield* page
        assert.strictEqual(root.text(), "r0,r1 /2 Available")
        assert.deepStrictEqual(
          root.fetches().map((fetch) => fetch.trigger + "@" + fetch.page),
          ["watch@0", "watch@1"]
        )
      }))
    })
  })
})
