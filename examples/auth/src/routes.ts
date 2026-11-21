import { Route } from "@effect/ui"

export const AppRoute = Route.union({
  Home: Route.make("/"),
  Login: Route.make("/login"),
  Dashboard: Route.make("/dashboard"),
  Settings: Route.make("/settings"),
  NotFound: Route.make("/*")
})
export type AppRoute = typeof AppRoute.Type

export const LoggedOutRoute = AppRoute.subset(["Home", "Login", "NotFound"])
export type LoggedOutRoute = typeof LoggedOutRoute.Type

export const LoggedInRoute = AppRoute.subset(["Dashboard", "Settings", "NotFound"])
export type LoggedInRoute = typeof LoggedInRoute.Type
