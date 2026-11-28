/**
 * Persists `persist: true` query Successes to a `KeyValueStore` and restores
 * them into the next cache so reloads show the last data while refetching,
 * including offline.
 *
 * Provide `layerKvs` to a mount or `Query.layer()` with a `KeyValueStore`
 * beneath it. Without the Layer, `persist: true` does nothing.
 *
 * - On build, `layerKvs` loads entries under `prefix` before mount (so the
 *   first frame has saved data) and prunes entries past `maxAge`, under
 *   another `version`, or unparseable. Entries that fail to decode are dropped
 *   on first read.
 * - Restored entries start stale with their original timestamp: a watch or
 *   `get` refetches immediately, and a failed refetch keeps the saved value as
 *   `previousSuccess` (including fetches that fail before hydration adoption).
 * - Fetches, Command `writes`, and infinite query `loadMore`/`reset` are saved;
 *   optimistic patches and Failures are not. Writes flush at most once per
 *   second and once on Scope close.
 *
 * **Gotchas**
 *
 * - Server hydration (`~query`) wins; omitted entries restore after adoption.
 * - Queries whose args, success, or error Schema holds `Schema.Redacted` are
 *   never saved.
 * - Signed-out users' entries aren't cleared automatically; include the user
 *   id in `prefix`.
 * - Saved entries remain in memory (encoded) for the session alongside decoded
 *   cache values.
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
  /** The Success's timestamp, for display. */
  readonly timestamp: number
  /** When the Layer saved it, for `maxAge`. */
  readonly savedAt: number
}

const parse = (text: string | undefined): Saved | undefined => {
  try {
    const saved = JSON.parse(text!)
    return typeof saved.timestamp === "number" &&
        typeof saved.savedAt === "number" && "value" in saved
      ? saved
      : undefined
  } catch {
    return undefined
  }
}

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
 * - `maxAge` is how long a saved entry is kept, from its last save. A
 *   restored Success keeps its own timestamp.
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
      const clock = yield* Clock.Clock
      const now = clock.currentTimeMillisUnsafe()
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
                now - entry.savedAt <= maxAge
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
            timestamp: result.timestamp,
            savedAt: clock.currentTimeMillisUnsafe()
          })
          dirty.set(key, () => report(failed(def.name, "write")))
          latch.openUnsafe()
        }
      }
      return persistence
    })
  )
}
