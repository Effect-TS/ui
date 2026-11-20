import { Command, Component, Head, Router, UiSchema } from "@effect/ui"
import { Console, Effect, Option, Schema } from "effect"
import { KeyValueStore } from "effect/persistence"
import { Session, SESSION_STORAGE_KEY } from "./auth/domain/Session.ts"
import { DashboardPage } from "./pages/dashboard/DashboardPage.ts"
import { HomePage } from "./pages/HomePage.ts"
import { LoginPage } from "./pages/login/LoginPage.ts"
import { NotFound } from "./pages/NotFound.ts"
import { SettingsPage } from "./pages/settings/SettingsPage.ts"
import {
  AppRoute,
  dashboardRoute,
  homeRoute,
  LoggedInRoute,
  LoggedOutRoute,
  loginRoute,
  settingsRoute
} from "./routes.ts"

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

// The app is either signed out or signed in, never a flat struct with an
// optional session. Each state holds only the routes it can show.
export const LoggedOut = Schema.TaggedStruct("LoggedOut", { route: LoggedOutRoute })
export const LoggedIn = Schema.TaggedStruct("LoggedIn", { route: LoggedInRoute, session: Session })
export const AppModel = Schema.Union([LoggedOut, LoggedIn])
export type AppModel = typeof AppModel.Type

const isLoggedOutRoute = Schema.is(LoggedOutRoute)
const isLoggedInRoute = Schema.is(LoggedInRoute)

// The route guard. A route the state can't show becomes the state's
// landing page, and `redirect` says the URL has to follow.
export const guard = (
  route: AppRoute,
  session: Option.Option<Session>
): { readonly model: AppModel; readonly redirect: AppRoute | undefined } =>
  Option.match(session, {
    onNone: () =>
      isLoggedOutRoute(route)
        ? { model: LoggedOut.make({ route }), redirect: undefined }
        : { model: LoggedOut.make({ route: loginRoute }), redirect: loginRoute },
    onSome: (session) =>
      isLoggedInRoute(route)
        ? { model: LoggedIn.make({ route, session }), redirect: undefined }
        : { model: LoggedIn.make({ route: dashboardRoute, session }), redirect: dashboardRoute }
  })

// ---------------------------------------------------------------------------
// Props: the route and the stored session, read before the app mounts
// ---------------------------------------------------------------------------

export const AppProps = Schema.Struct({ route: AppRoute, session: Schema.Option(Session) })

// What Foldkit calls flags. The entry module and the app test mount the
// root with this Effect, so `init` stays pure. A missing or unreadable
// session counts as signed out.
export const appProps = Effect.gen(function*() {
  const route = yield* Router.currentRoute(AppRoute)
  const store = KeyValueStore.toSchemaStore(yield* KeyValueStore.KeyValueStore, Session)
  const session = yield* store.get(SESSION_STORAGE_KEY).pipe(Effect.orElseSucceed(() => Option.none()))
  return { route, session }
})

// ---------------------------------------------------------------------------
// Messages and Commands
// ---------------------------------------------------------------------------

export const AppMessage = UiSchema.TaggedEnum({
  ChangedRoute: { route: AppRoute },
  SignedInLogin: { session: Session },
  ClickedSignOut: {},
  FailedSaveSession: { error: Schema.String },
  FailedClearSession: { error: Schema.String }
})

export class SaveSession extends Command.Service<SaveSession>()(
  "auth/SaveSession",
  { args: { session: Session } },
  Effect.gen(function*() {
    const store = KeyValueStore.toSchemaStore(yield* KeyValueStore.KeyValueStore, Session)
    return ({ session }) => store.set(SESSION_STORAGE_KEY, session)
  })
) {}

export class ClearSession extends Command.Service<ClearSession>()(
  "auth/ClearSession",
  { args: {} },
  Effect.gen(function*() {
    const store = yield* KeyValueStore.KeyValueStore
    return () => store.remove(SESSION_STORAGE_KEY)
  })
) {}

export const LogError = Command.make(
  "LogError",
  { args: { entries: Schema.Array(Schema.String) } },
  ({ entries }) => Console.error(...entries).pipe(Effect.as(Component.noop))
)

// A save or a clear that succeeds has nothing to report.
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

// The new route comes back through the Router subscription, so a redirect
// sends nothing of its own.
const redirectTo = (route: AppRoute) => Router.replace(AppRoute, route).pipe(Command.asNoop)

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

const AppDef = Component.define({
  name: "App",
  props: AppProps,
  model: AppModel,
  message: AppMessage
})

const LoggedOutView = AppDef.fragment((h, model: typeof LoggedOut.Type) =>
  h.div.class("py-8").children(
    LoggedOutRoute.match(model.route, {
      Home: () => HomePage(h),
      // Keyed by its path: leaving `/login` and coming back starts a fresh
      // form.
      Login: (route) =>
        LoginPage(h, {
          key: AppRoute.printPath(route),
          onEmit: { SignedIn: ({ session }) => AppMessage.SignedInLogin({ session }) }
        }),
      NotFound: (route) =>
        NotFound(h, { path: route.params["*"], backHref: AppRoute.print(homeRoute), backText: "Go Home" })
    })
  )
)

const NavLink = AppDef.fragment((h, label: string, route: LoggedInRoute, current: LoggedInRoute) => {
  const active = route._tag === current._tag
  return h.li.children(
    h.a.attr("href", AppRoute.print(route))
      .attr("aria-current", active ? "page" : undefined)
      .class("hover:bg-blue-600 font-medium px-3 py-1 rounded transition", active && "bg-blue-700/50")
      .children(label)
  )
})

const LoggedInView = AppDef.fragment((h, model: typeof LoggedIn.Type) =>
  h.div.class("min-h-screen").children(
    h.nav.class("bg-blue-500 text-white p-4").children(
      h.div.class("max-w-4xl mx-auto flex justify-between items-center").children(
        h.ul.class("flex gap-6 list-none").children(
          NavLink(h, "Dashboard", dashboardRoute, model.route),
          NavLink(h, "Settings", settingsRoute, model.route)
        ),
        h.div.class("text-sm").children(`Signed in as ${model.session.email}`)
      )
    ),
    h.main.class("py-8").children(
      LoggedInRoute.match(model.route, {
        Dashboard: () => DashboardPage(h, model.session),
        Settings: () => SettingsPage(h, { session: model.session, onSignOut: AppMessage.ClickedSignOut() }),
        NotFound: (route) =>
          NotFound(h, {
            path: route.params["*"],
            backHref: AppRoute.print(dashboardRoute),
            backText: "Go to Dashboard"
          })
      })
    )
  )
)

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AppNoDeps = AppDef.make({
  // A URL the state can't show is redirected from the first render.
  init: ($) => {
    const { model, redirect } = guard($.props.route, $.props.session)
    return redirect === undefined ? model : $.set(model).run(redirectTo(redirect))
  },
  update: {
    ChangedRoute: (model, { route }, $) => {
      const next = guard(route, model._tag === "LoggedIn" ? Option.some(model.session) : Option.none())
      return next.redirect === undefined ? next.model : $.set(next.model).run(redirectTo(next.redirect))
    },
    SignedInLogin: (_model, { session }, $) =>
      $.set(LoggedIn.make({ route: dashboardRoute, session })).run(saveSession(session), redirectTo(dashboardRoute)),
    ClickedSignOut: (_model, _message, $) =>
      $.set(LoggedOut.make({ route: homeRoute })).run(clearSession(), redirectTo(homeRoute)),
    FailedSaveSession: (_model, { error }, $) => $.run(LogError({ entries: ["Failed to save session:", error] })),
    FailedClearSession: (_model, { error }, $) => $.run(LogError({ entries: ["Failed to clear session:", error] }))
  },
  subscriptions: (model) => [
    Router.subscription(AppRoute, model.route, (route) => AppMessage.ChangedRoute({ route }))
  ],
  head: (model) => [Head.title(model.route._tag === "Home" ? "Auth" : `${model.route._tag} | Auth`)],
  view: (model, h) =>
    h.div.class("min-h-screen bg-gray-100").children(
      model._tag === "LoggedOut" ? LoggedOutView(h, model) : LoggedInView(h, model)
    )
})

// The session Commands capture the `KeyValueStore`, which the entry module
// provides.
export const App = AppNoDeps.pipe(Component.provide([SaveSession.layer, ClearSession.layer]))
