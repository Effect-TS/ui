import { Route } from "@effect/ui"
import { Effect, Schema } from "effect"

export const AppRoute = Route.union({
  Home: Route.make("/"),
  Nested: Route.make("/nested/route/is/very/nested"),
  People: Route.make("/people", {
    search: { searchText: Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed(""))) }
  }),
  Person: Route.make("/people/:personId", { params: { personId: Schema.Int } }),
  FilesIndex: Route.make("/files"),
  Files: Route.make("/files/*"),
  NotFound: Route.make("/*")
})
export type AppRoute = typeof AppRoute.Type
