import { NoteSort } from "#domain/Note"
import { Route } from "@effect/ui"
import { Effect, Schema } from "effect"

// A route union is a `Schema.TaggedUnion` with a parser and a printer that
// agree. Params and search are decoded through their Schemas, and `/*` is the
// catch-all. Always build URLs with `print`, never by hand. `printPath`
// prints the path alone, without the search. Build a route value with the
// union's constructor for its tag, as `AppRoute.Note({ params: { id } })`.
//
// The routes have their own file. Pages build links from them and `App`
// imports the pages, so routes kept in `App.ts` would be an import cycle.
//
// The folders under `pages/` follow these paths. A page is in the folder
// named by the static segments of its path.
export const AppRoute = Route.union({
  Index: Route.make("/"),
  // An optional or defaulted search field decodes leniently: a value that
  // fails, such as `?page=abc`, is treated as absent and the Router removes
  // it from the URL. A field with `Schema.withDecodingDefaultKey` has a plain
  // type, so `page` is a `number` that is 1 when the URL leaves it out.
  // The constructors fill in the defaults, and `print` leaves out a param that holds
  // its default, so a URL never carries `?page=1`.
  Search: Route.make("/search", {
    search: {
      q: Schema.optional(Schema.String),
      page: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).pipe(
        Schema.withDecodingDefaultKey(Effect.succeed(1))
      ),
      sort: NoteSort.pipe(Schema.withDecodingDefaultKey(Effect.succeed("asc" as const)))
    }
  }),
  Note: Route.make("/notes/:id", { params: { id: Schema.String } }),
  NotFound: Route.make("/*")
})
