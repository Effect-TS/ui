import * as Route from "@effect/ui/Route"

export const AppRoute = Route.union({
  Home: Route.make("/"),
  About: Route.make("/about")
})
