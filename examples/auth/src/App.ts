import { Command, Component, Head, Router, UiSchema } from "@effect/ui"
import { Console, Effect, Option, Schema } from "effect"
import { Session, SessionStore } from "./auth/domain/Session.ts"
import { LoggedIn } from "./LoggedIn.ts"
import { LoggedOut } from "./LoggedOut.ts"
import { AppRoute, LoggedInRoute, LoggedOutRoute } from "./routes.ts"

export const AppModel = UiSchema.TaggedEnum({
  LoggedOut: { route: LoggedOutRoute },
  LoggedIn: { route: LoggedInRoute, session: Session }
})
export type AppModel = typeof AppModel.Type

const isLoggedOutRoute = Schema.is(LoggedOutRoute)
const isLoggedInRoute = Schema.is(LoggedInRoute)

const guard = (route: AppRoute, session: Option.Option<Session>): AppModel =>
  Option.match(session, {
    onNone: () => AppModel.LoggedOut({ route: isLoggedOutRoute(route) ? route : LoggedOutRoute.Login() }),
    onSome: (session) =>
      AppModel.LoggedIn({ route: isLoggedInRoute(route) ? route : LoggedInRoute.Dashboard(), session })
  })

const redirected = (model: AppModel, route: AppRoute) => model.route._tag !== route._tag

const AppProps = Schema.Struct({ route: AppRoute, session: Schema.Option(Session) })

export const appProps = Effect.gen(function*() {
  const route = yield* Router.currentRoute(AppRoute)
  const store = yield* SessionStore
  const session = yield* store.get.pipe(Effect.orElseSucceed(() => Option.none()))
  return { route, session }
})

export const AppMessage = UiSchema.TaggedEnum({
  ChangedRoute: { route: AppRoute },
  SignedIn: { session: Session },
  SignedOut: {},
  FailedSaveSession: { error: Schema.String },
  FailedClearSession: { error: Schema.String }
})

export class SaveSession extends Command.Service<SaveSession>()(
  "auth/SaveSession",
  { args: { session: Session } },
  Effect.map(SessionStore, (store) => ({ session }) => store.set(session))
) {}

export class ClearSession extends Command.Service<ClearSession>()(
  "auth/ClearSession",
  { args: {} },
  Effect.map(SessionStore, (store) => () => store.remove)
) {}

export const LogError = Command.make(
  "LogError",
  { args: { entries: Schema.Array(Schema.String) } },
  ({ entries }) => Console.error(...entries).pipe(Effect.as(Component.noop))
)

const saveSession = (session: Session) =>
  SaveSession.make({ session }).pipe(Command.match({
    onSuccess: () => Component.noop,
    onFailure: (error) => AppMessage.FailedSaveSession({ error: error.message })
  }))

const clearSession = () =>
  ClearSession.make({}).pipe(Command.match({
    onSuccess: () => Component.noop,
    onFailure: (error) => AppMessage.FailedClearSession({ error: error.message })
  }))

const redirectTo = (route: AppRoute) => Router.replace(AppRoute, route).pipe(Command.asNoop)

export const AppNoDeps = Component.define({
  name: "App",
  props: AppProps,
  model: AppModel,
  message: AppMessage
}).make({
  init: ($) => {
    const model = guard($.props.route, $.props.session)
    return redirected(model, $.props.route) ? $.set(model).run(redirectTo(model.route)) : model
  },

  update: {
    ChangedRoute: (model, { route }, $) => {
      const next = guard(route, model._tag === "LoggedIn" ? Option.some(model.session) : Option.none())
      return redirected(next, route) ? $.set(next).run(redirectTo(next.route)) : next
    },

    SignedIn: (_model, { session }, $) =>
      $.set(AppModel.LoggedIn({ route: LoggedInRoute.Dashboard(), session })).run(
        saveSession(session),
        redirectTo(LoggedInRoute.Dashboard())
      ),

    SignedOut: (_model, _message, $) =>
      $.set(AppModel.LoggedOut({ route: LoggedOutRoute.Home() })).run(
        clearSession(),
        redirectTo(LoggedOutRoute.Home())
      ),

    FailedSaveSession: (_model, { error }, $) => $.run(LogError({ entries: ["Failed to save session:", error] })),

    FailedClearSession: (_model, { error }, $) => $.run(LogError({ entries: ["Failed to clear session:", error] }))
  },

  subscriptions: (model) => [
    Router.subscription(AppRoute, model.route, (route) => AppMessage.ChangedRoute({ route }))
  ],

  head: (model) => [Head.title(model.route._tag === "Home" ? "Auth" : `${model.route._tag} | Auth`)],

  view: (model, h) =>
    h.div.class("min-h-screen bg-gray-100").children(
      AppModel.match(model, {
        LoggedOut: ({ route }) =>
          LoggedOut(h, {
            props: { route },
            onEmit: { SignedIn: ({ session }) => AppMessage.SignedIn({ session }) }
          }),
        LoggedIn: ({ route, session }) =>
          LoggedIn(h, { props: { route, session }, onEmit: { SignedOut: () => AppMessage.SignedOut() } })
      })
    )
})

export const App = AppNoDeps.pipe(Component.provide([SaveSession.layer, ClearSession.layer]))
