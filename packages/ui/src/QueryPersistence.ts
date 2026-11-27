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
 *   removes entries whose data is older than `maxAge`, saved under another
 *   `version`, or that don't parse. A value that no longer decodes is
 *   removed when the cache first reads it.
 * - A saved value fills an entry when the cache creates it, as a stale
 *   Success with its saved timestamp. A watch or `get` refetches at once, and
 *   a failed refetch keeps it as the Failure's previous Success.
 * - Every Success the cache holds is saved: fetches, a Command's `writes`,
 *   and an infinite query's `loadMore` and `reset`. Never an optimistic
 *   patch or a Failure. Writes go out at most once a second,
 *   and once more when the Layer's Scope closes.
 *
 * **Gotchas**
 *
 * - Server hydration wins: an entry the server shipped in `~query` ignores
 *   its saved value. Other entries are restored once the page is adopted.
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
import { constVoid } from "effect/Function"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as AsyncResult from "effect/reactivity/AsyncResult"
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

type Def = ReturnType<typeof Query.defOf>

interface Saved {
  readonly version: string | undefined
  readonly value: unknown
  readonly timestamp: number
}

const parse = (text: string | undefined): Saved | undefined => {
  try {
    const saved = JSON.parse(text!)
    return typeof saved.timestamp === "number" && "value" in saved
      ? saved
      : undefined
  } catch {
    return undefined
  }
}

/** A query whose Schemas hold a `Schema.Redacted` never leaves memory. */
const persisted = (def: Def): boolean | undefined =>
  def.persist && !holdsRedacted(def.args.ast) &&
  !holdsRedacted(def.success.ast) && !holdsRedacted(def.error.ast)

const failed = (query: string, part: "encode" | "write"): SaveFailed =>
  new SaveFailed({
    query,
    part,
    message: "[QueryPersistence] an entry of " + JSON.stringify(query) +
      " failed to " + part + ". It wasn't saved."
  })

/**
 * Persists `persist` queries to the `KeyValueStore`, one key per entry
 * under `prefix`.
 *
 * **Details**
 *
 * - `prefix` namespaces the keys. Put a user id in it to keep users apart.
 * - `maxAge` is how old saved data may be when it is restored, counted from
 *   the Success's timestamp: when its data was fetched, not when it was
 *   saved. `loadMore` and `reset` keep a list's timestamp.
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
  // JSON keeps prefixes apart: `["app",` doesn't start `["app/u1",…`.
  const start = JSON.stringify([options.prefix]).slice(0, -1) + ","
  const keyOf = (def: Def, argsKey: string) =>
    JSON.stringify([options.prefix, def.name, argsKey])
  return Layer.effect(
    queryCore.Persistence,
    Effect.gen(function*() {
      const store = yield* KeyValueStore.KeyValueStore
      const now = yield* Clock.currentTimeMillis
      const saved = new Map<string, Saved>()
      const keys = yield* Effect.orElseSucceed(store.keys, () => [])
      yield* Effect.forEach(
        keys.filter((key) => key.startsWith(start)),
        // A failed read skips the key: only a value read is pruned.
        (key) =>
          store.get(key).pipe(
            Effect.flatMap((text) => {
              const entry = parse(text)
              if (
                entry !== undefined && entry.version === options.version &&
                // The data's age: a list's appended pages keep its timestamp.
                now - entry.timestamp <= maxAge
              ) {
                saved.set(key, entry)
                return Effect.void
              }
              return store.remove(key)
            }),
            Effect.ignore
          ),
        { concurrency: "unbounded", discard: true }
      )

      /** The keys the store is behind on, each with the report of its failed write. */
      const dirty = new Map<string, () => void>()
      const latch = Latch.makeUnsafe()
      const flush = Effect.suspend(() => {
        const writes = Array.from(dirty)
        dirty.clear()
        latch.closeUnsafe()
        return Effect.forEach(
          writes,
          ([key, onFailure]) => {
            const entry = saved.get(key)
            return entry === undefined
              ? Effect.ignore(store.remove(key))
              : Effect.try(() => JSON.stringify(entry)).pipe(
                Effect.flatMap((text) => store.set(key, text)),
                Effect.catch(() => Effect.sync(onFailure))
              )
          },
          { concurrency: "unbounded", discard: true }
        )
      })
      // Added before the fiber, so it runs after the fiber's interruption: what is left goes out once.
      yield* Effect.addFinalizer(() => flush)
      yield* latch.await.pipe(
        Effect.andThen(Effect.sleep(1000)),
        Effect.andThen(Effect.uninterruptible(flush)),
        Effect.forever,
        Effect.forkScoped
      )

      const persistence: queryCore.Persistence = {
        get: (def, argsKey) => {
          const key = keyOf(def, argsKey)
          const entry = persisted(def) ? saved.get(key) : undefined
          if (entry === undefined) return undefined
          try {
            return AsyncResult.success(def.codec().decodeSuccess(entry.value), {
              timestamp: entry.timestamp
            })
          } catch {
            // A value that no longer decodes is dropped, and the entry is cold.
            saved.delete(key)
            dirty.set(key, constVoid)
            latch.openUnsafe()
            return undefined
          }
        },
        save: (def, argsKey, result, report) => {
          if (result._tag !== "Success" || !persisted(def)) return
          let value: unknown
          try {
            value = def.codec().encodeSuccess(result.value)
          } catch {
            return report(failed(def.name, "encode"))
          }
          const key = keyOf(def, argsKey)
          saved.set(key, {
            version: options.version,
            value,
            timestamp: result.timestamp
          })
          dirty.set(key, () => report(failed(def.name, "write")))
          latch.openUnsafe()
        }
      }
      return persistence
    })
  )
}
