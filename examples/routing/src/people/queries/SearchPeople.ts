import { Query } from "@effect/ui"
import { Duration, Effect, Schema } from "effect"
import { Person, searchPeople } from "../domain/Person.ts"

const SEARCH_LATENCY = Duration.millis(300)

const runSearchPeople = Effect.fn("people/SearchPeople")(
  function*({ searchText }: { readonly searchText: string }) {
    yield* Effect.sleep(SEARCH_LATENCY)
    return searchPeople(searchText)
  }
)

export class SearchPeople extends Query.Service<SearchPeople>()(
  "people/SearchPeople",
  {
    args: { searchText: Schema.String },
    success: Schema.Array(Person),
    error: Schema.Never,
    staleTime: "Infinity"
  },
  Effect.succeed((args) => runSearchPeople(args))
) {}
