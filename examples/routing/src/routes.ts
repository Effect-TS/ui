import { Route } from "@effect/ui"
import { Schema } from "effect"

export const AppRoute = Route.union({
  Home: Route.make("/"),
  Nested: Route.make("/nested/route/is/very/nested"),
  People: Route.make("/people", { search: { searchText: Schema.optional(Schema.String) } }),
  Person: Route.make("/people/:personId", { params: { personId: Schema.Int } }),
  FilesIndex: Route.make("/files"),
  Files: Route.make("/files/*"),
  NotFound: Route.make("/*")
})
export type AppRoute = typeof AppRoute.Type

export const PeopleRoute = AppRoute.subset(["People"])
export type PeopleRoute = typeof PeopleRoute.Type
