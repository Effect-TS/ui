/**
 * Saves the Successes of `persist` queries to a `KeyValueStore`, and
 * restores them into the next cache, so a reload shows the last data while
 * it refetches, offline included.
 *
 * A query opts in with `persist: true`. Provide `layerKvs` to a mount, or
 * to `Query.layer()` in plain Effect code, with the store under it. Without
 * the Layer the flag does nothing.
 *
 * - The Layer reads every entry under its `prefix` while it builds, so a
 *   mount waits for the read and its first frame holds the saved values. It
 *   removes entries older than `maxAge`, saved under another `version`, or
 *   that don't parse.
 * - A saved value fills an entry when the cache creates it, as a stale
 *   Success with its saved timestamp. A watch or `get` refetches at once, and
 *   a failed refetch keeps it as the Failure's previous Success.
 * - Every stored Success is saved: fetches and a Command's `writes`, never
 *   an optimistic patch or a Failure. Writes go out at most once a second,
 *   and once more when the Layer's Scope closes.
 *
 * **Gotchas**
 *
 * - Server hydration wins: an entry the server shipped in `~query` ignores
 *   its saved value, and nothing is restored until the page is adopted.
 * - A query whose args, success or error Schema holds a `Schema.Redacted`
 *   is never saved.
 * - Nothing clears a signed-out user's entries. Put the user id in `prefix`.
 * - Saved entries are held in memory for the session, encoded, next to the
 *   cache's decoded values.
 *
 * **Example** (A reload that is offline)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer, Schema } from "effect"
 * import { KeyValueStore } from "effect/persistence"
 * import { Query, QueryPersistence } from "@effect/ui"
 *
 * let online = true
 *
 * class GetNotes extends Query.Service<GetNotes>()("notes/GetNotes", {
 *   success: Schema.Array(Schema.String),
 *   error: Schema.String,
 *   staleTime: "30 seconds",
 *   persist: true
 * }) {
 *   static readonly layer = this.toLayer(() =>
 *     online ? Effect.succeed(["draft"]) : Effect.fail("offline")
 *   )
 * }
 *
 * const program = Effect.gen(function*() {
 *   // One store, two sessions: the second is the reload.
 *   const store = Layer.succeed(KeyValueStore.KeyValueStore, yield* KeyValueStore.KeyValueStore)
 *   const session = Layer.merge(GetNotes.layer, Query.layer()).pipe(
 *     Layer.provide(QueryPersistence.layerKvs({ prefix: "notes", maxAge: "7 days" })),
 *     Layer.provide(store)
 *   )
 *   yield* GetNotes.get({}).pipe(Effect.provide(session))
 *   online = false
 *   const result = yield* GetNotes.peek({}).pipe(Effect.provide(session))
 *   return result._tag === "Success" ? result.value : []
 * }).pipe(Effect.provide(KeyValueStore.layerMemory))
 *
 * await Effect.runPromise(program) // => ["draft"]
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Clock from "effect/Clock"
import * as Data from "effect/Data"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Schema from "effect/Schema"
import * as queryCore from "./internal/queryCore.ts"
import { holdsRedacted } from "./internal/schemaRedact.ts"
import type * as Query from "./Query.ts"

/**
 * A Success of a `persist` query failed to encode, or the store failed to
 * write it. The cache is unchanged, and the store keeps what it held.
 *
 * @stability experimental
 * @category problems
 * @since 0.1.0
 */
export class SaveFailed extends Data.TaggedClass("SaveFailed")<{
  readonly message: string
  readonly query: string
  readonly part: "encode" | "write"
}> {}

/** What this module reads of a query's definition. */
interface Def {
  readonly name: string
  readonly persist: boolean
  readonly args: Schema.Top
  readonly success: Schema.Top
  readonly error: Schema.Top
  readonly codec: () => {
    readonly encodeSuccess: (value: unknown) => unknown
    readonly decodeSuccess: (encoded: unknown) => unknown
  }
}

interface Saved {
  readonly version: string | undefined
  readonly savedAt: number
  readonly query: string
  readonly argsKey: string
  readonly value: unknown
  readonly timestamp: number
}

const parse = (text: string | undefined): Saved | undefined => {
  try {
    const saved = JSON.parse(text!)
    return typeof saved.savedAt === "number" &&
        typeof saved.query === "string" &&
        typeof saved.argsKey === "string" &&
        typeof saved.timestamp === "number" && "value" in saved
      ? saved
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Persists `persist` queries to the `KeyValueStore`, one key per entry
 * under `prefix`.
 *
 * **Details**
 *
 * - `prefix` namespaces the keys. Put a user id in it to keep users apart.
 * - `maxAge` is how long a saved entry is restored, from when it was saved.
 * - `version` drops every entry saved under another one. Use a build id when
 *   a deploy changes a query's Schemas.
 *
 * The Layer fails on nothing: an entry that can't be read is skipped, and a
 * failed save is reported through `Query.Problems` as a `SaveFailed`.
 *
 * **Gotchas**
 *
 * Throws on an invalid `maxAge`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layerKvs = (options: {
  readonly prefix: string
  readonly maxAge: Duration.Input
  readonly version?: string | undefined
}): Layer.Layer<never, never, KeyValueStore.KeyValueStore> => {
  const maxAge = Duration.toMillis(options.maxAge)
  const start = options.prefix + "/"
  const keyOf = (query: string, argsKey: string) =>
    start + query + "/" + argsKey
  return Layer.effect(
    queryCore.Persistence,
    Effect.gen(function*() {
      const store = yield* KeyValueStore.KeyValueStore
      const clock = yield* Clock.Clock
      const now = clock.currentTimeMillisUnsafe()
      const saved = new Map<string, Saved>()
      for (const key of yield* Effect.orElseSucceed(store.keys, () => [])) {
        if (!key.startsWith(start)) continue
        const entry = parse(
          yield* Effect.orElseSucceed(store.get(key), () => undefined)
        )
        if (
          entry !== undefined && entry.version === options.version &&
          now - entry.savedAt <= maxAge &&
          keyOf(entry.query, entry.argsKey) === key
        ) {
          saved.set(key, entry)
        } else {
          yield* Effect.ignore(store.remove(key))
        }
      }

      let report = (_: Query.Problem.Any): void => {}
      const dirty = new Set<string>()
      const latch = Latch.makeUnsafe()
      const flush = Effect.suspend(() => {
        const keys = Array.from(dirty)
        dirty.clear()
        return Effect.forEach(keys, (key) => {
          const entry = saved.get(key)!
          return Effect.try(() => JSON.stringify(entry)).pipe(
            Effect.flatMap((text) => store.set(key, text)),
            Effect.catch(() =>
              Effect.sync(() =>
                report(
                  new SaveFailed({
                    query: entry.query,
                    part: "write",
                    message: "[QueryPersistence] an entry of " +
                      JSON.stringify(entry.query) + " failed to save."
                  })
                )
              )
            )
          )
        }, { discard: true })
      })
      // Added before the fiber, so it runs after the fiber's interruption: what is left goes out once.
      yield* Effect.addFinalizer(() => flush)
      yield* latch.await.pipe(
        Effect.andThen(latch.close),
        Effect.andThen(Effect.sleep(1000)),
        Effect.andThen(Effect.uninterruptible(flush)),
        Effect.forever,
        Effect.forkScoped
      )

      const persistence: queryCore.Persistence = {
        get: (def: Def, argsKey) => {
          const entry = def.persist
            ? saved.get(keyOf(def.name, argsKey))
            : undefined
          if (entry === undefined) return undefined
          try {
            return AsyncResult.success(def.codec().decodeSuccess(entry.value), {
              timestamp: entry.timestamp
            })
          } catch {
            // A value that no longer decodes leaves the entry cold.
            return undefined
          }
        },
        save: (def: Def, argsKey, result, sink) => {
          if (
            !def.persist || holdsRedacted(def.args.ast) ||
            holdsRedacted(def.success.ast) || holdsRedacted(def.error.ast)
          ) return
          report = sink
          let value: unknown
          try {
            value = def.codec().encodeSuccess(result.value)
          } catch {
            return sink(
              new SaveFailed({
                query: def.name,
                part: "encode",
                message: "[QueryPersistence] an entry of " +
                  JSON.stringify(def.name) +
                  " failed to encode. It wasn't saved."
              })
            )
          }
          const key = keyOf(def.name, argsKey)
          saved.set(key, {
            version: options.version,
            savedAt: clock.currentTimeMillisUnsafe(),
            query: def.name,
            argsKey,
            value,
            timestamp: result.timestamp
          })
          dirty.add(key)
          latch.openUnsafe()
        }
      }
      return persistence
    })
  )
}
