import { Context, Effect, Layer, type Option, Schema } from "effect"
import { KeyValueStore } from "effect/persistence"

export const Session = Schema.Struct({
  userId: Schema.String,
  email: Schema.String,
  name: Schema.String
})
export type Session = typeof Session.Type

const SESSION_STORAGE_KEY = "auth_session"

export class SessionStore extends Context.Service<SessionStore, {
  readonly get: Effect.Effect<Option.Option<Session>, KeyValueStore.KeyValueStoreError | Schema.SchemaError>
  readonly set: (session: Session) => Effect.Effect<void, KeyValueStore.KeyValueStoreError | Schema.SchemaError>
  readonly remove: Effect.Effect<void, KeyValueStore.KeyValueStoreError>
}>()("auth/SessionStore") {
  static readonly layer = Layer.effect(
    SessionStore,
    Effect.gen(function*() {
      const store = KeyValueStore.toSchemaStore(yield* KeyValueStore.KeyValueStore, Session)
      return SessionStore.of({
        get: store.get(SESSION_STORAGE_KEY),
        set: (session) => store.set(SESSION_STORAGE_KEY, session),
        remove: store.remove(SESSION_STORAGE_KEY)
      })
    })
  )
}
