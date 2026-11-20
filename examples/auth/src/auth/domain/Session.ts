import { Effect, Schema } from "effect"
import { KeyValueStore } from "effect/persistence"

export const Session = Schema.Struct({
  userId: Schema.String,
  email: Schema.String,
  name: Schema.String
})
export type Session = typeof Session.Type

const SESSION_STORAGE_KEY = "auth_session"

export const sessionStore = Effect.map(KeyValueStore.KeyValueStore, (keyValueStore) => {
  const store = KeyValueStore.toSchemaStore(keyValueStore, Session)
  return {
    get: store.get(SESSION_STORAGE_KEY),
    set: (session: Session) => store.set(SESSION_STORAGE_KEY, session),
    remove: store.remove(SESSION_STORAGE_KEY)
  }
})
