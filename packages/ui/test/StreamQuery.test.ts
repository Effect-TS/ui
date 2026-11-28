import { Query } from "@effect/ui"
import { TestQuery } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Queue,
  Schema,
  Stream
} from "effect"
import type { Duration } from "effect"
import { AsyncResult, Reactivity } from "effect/reactivity"
import { TestClock } from "effect/testing"

const Note = Schema.Struct({ id: Schema.String, title: Schema.String })
type Note = typeof Note.Type
type Seen = AsyncResult.AsyncResult<Note, string>

// A few macrotasks: lets every fiber the cache forked run, and whatever those fork in turn.
const flush = Effect.promise(async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
})
const advance = (duration: Duration.Input) =>
  flush.pipe(Effect.andThen(TestClock.adjust(duration)), Effect.andThen(flush))

const show = (result: Seen, patched = false): string =>
  (AsyncResult.isSuccess(result)
    ? result.value.title
    : AsyncResult.isFailure(result)
    ? "Failure(" +
      Option.getOrElse(Cause.findErrorOption(result.cause), () => "?") +
      ")" +
      (Option.isSome(result.previousSuccess) ? " previous" : "")
    : "Initial") +
  (result.waiting ? " waiting" : "") +
  (patched ? " patched" : "")

interface NoteStream {
  readonly id: string
  readonly emit: (title: string) => void
  readonly fail: (error: string) => void
  readonly end: () => void
  closed: boolean
}

const makeNotes = (options: {
  readonly idleTimeToLive?: Duration.Input
  readonly refetchInterval?: Duration.Input
  readonly reactivityKeys?: (
    args: { readonly id: string }
  ) => Reactivity.KeysInput
} = {}) => {
  const streams: Array<NoteStream> = []
  class GetNote extends Query.StreamService<GetNote>()(
    "notes/GetNote",
    // @ts-expect-error: a stream query doesn't poll, even through a variable
    {
      args: { id: Schema.String },
      success: Note,
      error: Schema.String,
      ...options
    }
  ) {
    static readonly layer = this.toLayer(({ id }) =>
      Stream.callback<Note, string>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const handle: NoteStream = {
              id,
              emit: (title) => {
                Queue.offerUnsafe(queue, { id, title })
              },
              fail: (error) => {
                Queue.failCauseUnsafe(queue, Cause.fail(error))
              },
              end: () => {
                Queue.endUnsafe(queue)
              },
              closed: false
            }
            streams.push(handle)
            return handle
          }),
          (handle) =>
            Effect.sync(() => {
              handle.closed = true
            })
        )
      )
    )
  }
  return {
    streams,
    GetNote,
    provide: Effect.provide(Layer.merge(GetNote.layer, TestQuery.layer()))
  }
}

const watch = Effect.fnUntraced(
  function*<R>(changes: Stream.Stream<Seen, never, R>) {
    const seen: Array<string> = []
    const fiber = yield* Effect.forkScoped(
      Stream.runForEach(
        changes,
        (result) => Effect.sync(() => seen.push(show(result)))
      )
    )
    yield* flush
    return { seen, fiber, stop: Fiber.interrupt(fiber) }
  }
)

describe("Stream queries", () => {
  it.effect("two watchers share one stream, stay Initial until the first element, get resolves on it, and edits reach both", () => {
    const { GetNote, provide, streams } = makeNotes()
    return Effect.gen(function*() {
      let fetchEnds = 0
      Query.internals(yield* Query.Cache).onFetchEnd(() => fetchEnds++)
      const a = yield* watch(GetNote.changes({ id: "1" }))
      const b = yield* watch(GetNote.changes({ id: "1" }))
      assert.strictEqual(streams.length, 1)
      assert.deepStrictEqual(a.seen, [])
      assert.deepStrictEqual(
        yield* GetNote.peek({ id: "1" }),
        AsyncResult.initial(true)
      )

      const first = yield* Effect.forkScoped(GetNote.get({ id: "1" }))
      yield* flush
      assert.isUndefined(first.pollUnsafe())

      streams[0].emit("v1")
      yield* flush
      assert.deepStrictEqual(a.seen, ["v1"])
      assert.deepStrictEqual(b.seen, ["v1"])
      assert.deepStrictEqual(yield* Fiber.join(first), {
        id: "1",
        title: "v1"
      })
      // Settled while the stream stays open.
      assert.strictEqual(fetchEnds, 1)
      assert.strictEqual(
        (yield* TestQuery.entry(GetNote, { id: "1" }))?.fetch,
        "none"
      )

      streams[0].emit("v2")
      yield* flush
      assert.deepStrictEqual(a.seen, ["v1", "v2"])
      assert.deepStrictEqual(b.seen, ["v1", "v2"])
      assert.deepStrictEqual(yield* GetNote.get({ id: "1" }), {
        id: "1",
        title: "v2"
      })
      assert.strictEqual(streams.length, 1)
    }).pipe(provide)
  })

  it.effect("ignores polling, and closes the stream after idleTimeToLive, counting from the latest request", () => {
    const { GetNote, provide, streams } = makeNotes({
      idleTimeToLive: "10 seconds",
      refetchInterval: "2 seconds"
    })
    return Effect.gen(function*() {
      // A stream that never emits closes too, and a repeated prefetch renews its deadline.
      yield* GetNote.prefetch({ id: "silent" })
      yield* advance("9 seconds")
      yield* GetNote.prefetch({ id: "silent" })
      yield* advance("9 seconds")
      assert.isFalse(streams[0].closed)
      yield* advance("1 second")
      assert.isTrue(streams[0].closed)
      streams.shift()

      const a = yield* watch(GetNote.changes({ id: "1" }))
      streams[0].emit("v1")
      yield* advance("2 seconds")
      assert.deepStrictEqual(a.seen, ["v1"])
      assert.strictEqual(streams.length, 1)

      yield* a.stop
      yield* advance("5 seconds")
      assert.isFalse(streams[0].closed)
      yield* advance("5 seconds")
      assert.isTrue(streams[0].closed)
      assert.isUndefined(yield* TestQuery.entry(GetNote, { id: "1" }))

      yield* watch(GetNote.changes({ id: "1" }))
      assert.strictEqual(streams.length, 2)
    }).pipe(provide)
  })

  it.effect("pushes update the base value under optimistic patches, a run's end and invalidate restart the stream, each in its own trace", () => {
    const { GetNote, provide, streams } = makeNotes()
    return Effect.gen(function*() {
      const cache = Query.internals(yield* Query.Cache)
      const parents: Array<string | undefined> = []
      const off = cache.onFetch((event) => parents.push(event.parentSpanId))
      const fetcher = (yield* GetNote) as unknown as (
        args: unknown
      ) => Effect.Effect<any, any>
      const seen: Array<string> = []
      const handle = cache.watch(
        Query.defOf(GetNote),
        { id: "1" },
        fetcher,
        (result, patched) => seen.push(show(result, patched)),
        undefined,
        { patched: true }
      )
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          handle.unregister()
          off()
        })
      )
      yield* flush
      streams[0].emit("v1")
      yield* flush

      const edit = (suffix: string) =>
        cache.beginRun({
          command: "Edit",
          invalidates: [],
          optimistic: [
            GetNote.patch({ id: "1" }, (note) => ({
              ...note,
              title: note.title + suffix
            }))
          ]
        })
      const a = edit("!")
      assert.deepStrictEqual(seen, ["v1", "v1! patched"])
      streams[0].emit("v2")
      yield* flush
      assert.deepStrictEqual(seen, ["v1", "v1! patched", "v2! patched"])
      const server = yield* GetNote.peek({ id: "1" })
      assert.isTrue(
        AsyncResult.isSuccess(server) && server.value.title === "v2"
      )

      // A has succeeded but B holds the restart: a push from the old stream keeps A's patch.
      const b = edit("?")
      yield* a.run(Effect.void)
      streams[0].emit("v3")
      yield* flush
      assert.strictEqual(seen.at(-1), "v3!? patched")
      assert.isFalse(streams[0].closed)

      // B ends: the restarted stream's first element confirms both.
      yield* b.run(Effect.void)
      yield* flush
      assert.isTrue(streams[0].closed)
      assert.strictEqual(seen.at(-1), "v3!? waiting patched")
      streams[1].emit("v4")
      yield* flush
      assert.strictEqual(seen.at(-1), "v4")

      // An invalidation under a span reopens the stream without it: a stream's span lasts as long as the stream.
      yield* Effect.withSpan(GetNote.invalidate({ id: "1" }), "edit")
      yield* flush
      assert.isTrue(streams[1].closed)
      assert.strictEqual(seen.at(-1), "v4 waiting")
      streams[2].emit("v5")
      yield* flush
      assert.strictEqual(seen.at(-1), "v5")
      assert.deepStrictEqual(parents, [undefined, undefined, undefined])
    }).pipe(provide)
  })

  it.effect("an empty stream dies instead of hanging get and watchers, and a typed failure exposes the error without retrying", () => {
    const { GetNote, provide, streams } = makeNotes()
    return Effect.gen(function*() {
      const watcher = yield* watch(GetNote.changes({ id: "empty" }))
      const got = yield* Effect.forkScoped(GetNote.get({ id: "empty" }))
      yield* flush
      streams[0].end()
      yield* flush
      const getExit = yield* Fiber.await(got)
      const defect = Exit.isFailure(getExit)
        ? Cause.squash(getExit.cause)
        : undefined
      assert.isTrue(
        defect instanceof Error &&
          defect.message.includes("ended before its first element")
      )
      const watchExit = yield* Fiber.await(watcher.fiber)
      assert.isTrue(Exit.isFailure(watchExit) && Cause.hasDies(watchExit.cause))
      assert.strictEqual(streams.length, 1)

      const failing = yield* watch(GetNote.changes({ id: "err" }))
      streams[1].emit("v1")
      yield* flush
      streams[1].fail("boom")
      yield* flush
      assert.deepStrictEqual(failing.seen, ["v1", "Failure(boom) previous"])
      assert.strictEqual(streams.length, 2)
      assert.isTrue((yield* TestQuery.entry(GetNote, { id: "err" }))?.stale)
    }).pipe(provide)
  })

  it.effect("reactivityKeys restarts a watched stream and closes an unwatched one", () => {
    const { GetNote, provide, streams } = makeNotes({
      reactivityKeys: ({ id }) => [`notes:${id}`]
    })
    return Effect.gen(function*() {
      const watched = yield* watch(GetNote.changes({ id: "1" }))
      yield* GetNote.prefetch({ id: "2" })
      yield* flush
      streams[0].emit("v1")
      streams[1].emit("u1")
      yield* flush

      // Watched entry: closes the old stream, marks waiting, and opens a new one.
      yield* Reactivity.invalidate(["notes:1"])
      yield* flush
      assert.isTrue(streams[0].closed)
      assert.isFalse(streams[1].closed)
      assert.deepStrictEqual(watched.seen, ["v1", "v1 waiting"])
      streams[2].emit("v2")
      yield* flush
      assert.deepStrictEqual(watched.seen, ["v1", "v1 waiting", "v2"])

      // Unwatched entry: closes and stays closed until asked for again.
      yield* Reactivity.invalidate(["notes:2"])
      yield* flush
      assert.isTrue(streams[1].closed)
      assert.strictEqual(streams.length, 3)
      assert.isTrue((yield* TestQuery.entry(GetNote, { id: "2" }))?.stale)
    }).pipe(provide, Effect.provide(Reactivity.layer))
  })
})
