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
import { AsyncResult } from "effect/reactivity"
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
  it.effect("an option variable can't make a stream query poll", () => {
    const { GetNote, provide, streams } = makeNotes({
      refetchInterval: "2 seconds"
    })
    return Effect.gen(function*() {
      yield* watch(GetNote.changes({ id: "1" }))
      streams[0].emit("v1")
      yield* advance("2 seconds")
      assert.strictEqual(streams.length, 1)
    }).pipe(provide)
  })

  it.effect("two watchers share one stream, stay Initial until the first element, get resolves on it, and edits reach both", () => {
    const { GetNote, provide, streams } = makeNotes()
    return Effect.gen(function*() {
      const a = yield* watch(GetNote.changes({ id: "1" }))
      const b = yield* watch(GetNote.changes({ id: "1" }))
      assert.strictEqual(streams.length, 1)
      assert.deepStrictEqual(a.seen, [])
      assert.deepStrictEqual(b.seen, [])
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
      assert.strictEqual(
        (yield* TestQuery.entry(GetNote, { id: "1" }))?.stale,
        false
      )
      assert.strictEqual(
        (yield* TestQuery.entry(GetNote, { id: "1" }))?.fetch,
        "none"
      )

      streams[0].emit("v2")
      yield* flush
      assert.deepStrictEqual(a.seen, ["v1", "v2"])
      assert.deepStrictEqual(b.seen, ["v1", "v2"])
      assert.strictEqual(streams.length, 1)
      assert.deepStrictEqual(yield* GetNote.get({ id: "1" }), {
        id: "1",
        title: "v2"
      })
      assert.strictEqual(streams.length, 1)
      assert.deepStrictEqual(
        (yield* TestQuery.fetches).map((fetch) => fetch.trigger),
        ["watch"]
      )
    }).pipe(provide)
  })

  it.effect("closes the stream after idleTimeToLive and restarts it for a later watcher", () => {
    const { GetNote, provide, streams } = makeNotes({
      idleTimeToLive: "10 seconds"
    })
    return Effect.gen(function*() {
      // A stream that never emits closes on the same deadline.
      const silent = yield* watch(GetNote.changes({ id: "silent" }))
      yield* silent.stop
      yield* advance("10 seconds")
      assert.isTrue(streams[0].closed)
      streams.shift()

      // A repeated prefetch renews the deadline of a stream still opening.
      yield* GetNote.prefetch({ id: "silent" })
      yield* advance("9 seconds")
      yield* GetNote.prefetch({ id: "silent" })
      yield* advance("9 seconds")
      assert.strictEqual(streams.length, 1)
      assert.isFalse(streams[0].closed)
      yield* advance("1 second")
      assert.isTrue(streams[0].closed)
      streams.shift()

      const a = yield* watch(GetNote.changes({ id: "1" }))
      streams[0].emit("v1")
      yield* flush
      assert.deepStrictEqual(a.seen, ["v1"])

      yield* a.stop
      yield* advance("5 seconds")
      assert.isFalse(streams[0].closed)

      yield* advance("5 seconds")
      assert.isTrue(streams[0].closed)
      assert.isUndefined(yield* TestQuery.entry(GetNote, { id: "1" }))

      const b = yield* watch(GetNote.changes({ id: "1" }))
      assert.strictEqual(streams.length, 2)
      streams[1].emit("v2")
      yield* flush
      assert.deepStrictEqual(b.seen, ["v2"])
    }).pipe(provide)
  })

  it.effect("updates the base value under a live optimistic patch, and invalidate restarts the stream", () => {
    const { GetNote, provide, streams } = makeNotes()
    return Effect.gen(function*() {
      const cache = Query.internals(yield* Query.Cache)
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
      yield* Effect.addFinalizer(() => Effect.sync(handle.unregister))
      yield* flush

      streams[0].emit("v1")
      yield* flush
      assert.deepStrictEqual(seen, ["v1"])

      const run = cache.beginRun({
        command: "Rename",
        invalidates: [],
        optimistic: [
          GetNote.patch({ id: "1" }, (note) => ({
            ...note,
            title: note.title + "!"
          }))
        ]
      })
      assert.deepStrictEqual(seen, ["v1", "v1! patched"])
      assert.isFalse(streams[0].closed)

      streams[0].emit("v2")
      yield* flush
      assert.deepStrictEqual(seen, ["v1", "v1! patched", "v2! patched"])
      const server = yield* GetNote.peek({ id: "1" })
      assert.isTrue(
        AsyncResult.isSuccess(server) && server.value.title === "v2"
      )

      yield* run.run(Effect.void)
      yield* flush
      assert.isTrue(streams[0].closed)
      assert.strictEqual(streams.length, 2)
      assert.strictEqual(seen.at(-1), "v2! waiting patched")

      streams[1].emit("v3")
      yield* flush
      assert.strictEqual(seen.at(-1), "v3")

      yield* GetNote.invalidate({ id: "1" })
      yield* flush
      assert.isTrue(streams[1].closed)
      assert.strictEqual(streams.length, 3)
      assert.strictEqual(seen.at(-1), "v3 waiting")

      streams[2].emit("v4")
      yield* flush
      assert.strictEqual(seen.at(-1), "v4")
    }).pipe(provide)
  })

  it.effect("a push from the old stream keeps a succeeded run's patch while another run holds the restart", () => {
    const { GetNote, provide, streams } = makeNotes()
    return Effect.gen(function*() {
      const cache = Query.internals(yield* Query.Cache)
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
      yield* Effect.addFinalizer(() => Effect.sync(handle.unregister))
      yield* flush
      streams[0].emit("old")
      yield* flush

      const edit = (f: (title: string) => string) =>
        cache.beginRun({
          command: "Edit",
          invalidates: [],
          optimistic: [
            GetNote.patch({ id: "1" }, (note) => ({
              ...note,
              title: f(note.title)
            }))
          ]
        })
      const a = edit(() => "new")
      const b = edit((title) => title + "!")
      yield* a.run(Effect.void)
      streams[0].emit("older push")
      yield* flush
      assert.strictEqual(seen.at(-1), "new! patched")

      // B ends: the restarted stream's first element confirms both.
      yield* b.run(Effect.void)
      yield* flush
      assert.strictEqual(streams.length, 2)
      streams[1].emit("new!")
      yield* flush
      assert.strictEqual(seen.at(-1), "new!")
    }).pipe(provide)
  })

  it.effect("an empty stream dies instead of hanging get and watchers, and a typed failure exposes the error without retrying", () => {
    const { GetNote, provide, streams } = makeNotes()
    return Effect.gen(function*() {
      const watcher = yield* watch(GetNote.changes({ id: "empty" }))
      const got = yield* Effect.forkScoped(GetNote.get({ id: "empty" }))
      yield* flush
      assert.strictEqual(streams.length, 1)

      streams[0].end()
      yield* flush
      const getExit = yield* Fiber.await(got)
      assert.isTrue(Exit.isFailure(getExit) && Cause.hasDies(getExit.cause))
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
      assert.strictEqual(streams.length, 2)
      streams[1].emit("v1")
      yield* flush
      streams[1].fail("boom")
      yield* flush
      assert.deepStrictEqual(failing.seen, ["v1", "Failure(boom) previous"])
      assert.strictEqual(streams.length, 2)
      assert.isTrue((yield* TestQuery.entry(GetNote, { id: "err" }))?.stale)
    }).pipe(provide)
  })
})
