import { Context, Effect, Layer, Schema } from "effect"
import { KeyValueStore } from "effect/persistence"

export const Session = Schema.Struct({
  userId: Schema.String,
  email: Schema.String,
  name: Schema.String
})
export type Session = typeof Session.Type

const SESSION_STORAGE_KEY = "auth_session"

export class SessionStore extends Context.Service<SessionStore>()("auth/SessionStore", {
  make: Effect.gen(function*() {
    const store = KeyValueStore.toSchemaStore(yield* KeyValueStore.KeyValueStore, Session)
    return {
      get: store.get(SESSION_STORAGE_KEY),
      set: (session: Session) => store.set(SESSION_STORAGE_KEY, session),
      remove: store.remove(SESSION_STORAGE_KEY)
    }
  })
}) {
  static readonly layer = Layer.effect(SessionStore, SessionStore.make)
}
