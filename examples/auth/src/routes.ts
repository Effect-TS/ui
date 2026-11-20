import { Route } from "@effect/ui"

export const AppRoute = Route.union({
  Home: Route.make("/"),
  Login: Route.make("/login"),
  Dashboard: Route.make("/dashboard"),
  Settings: Route.make("/settings"),
  NotFound: Route.make("/*")
})
export type AppRoute = typeof AppRoute.Type

// NotFound is in both subsets so an unknown path shows a 404 whether signed in or out.
export const LoggedOutRoute = AppRoute.subset(["Home", "Login", "NotFound"])
export type LoggedOutRoute = typeof LoggedOutRoute.Type

export const LoggedInRoute = AppRoute.subset(["Dashboard", "Settings", "NotFound"])
export type LoggedInRoute = typeof LoggedInRoute.Type

export const homeRoute = LoggedOutRoute.make({ _tag: "Home" })
export const loginRoute = LoggedOutRoute.make({ _tag: "Login" })
export const dashboardRoute = LoggedInRoute.make({ _tag: "Dashboard" })
export const settingsRoute = LoggedInRoute.make({ _tag: "Settings" })
