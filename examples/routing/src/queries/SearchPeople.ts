import { Person, searchPeople } from "#domain/Person"
import { Query } from "@effect/ui"
import { Duration, Effect, Schema } from "effect"

const SEARCH_LATENCY = Duration.millis(300)

export class SearchPeople extends Query.Service<SearchPeople>()(
  "people/SearchPeople",
  {
    args: { searchText: Schema.String },
    success: Schema.Array(Person),
    error: Schema.Never,
    staleTime: "Infinity"
  },
  Effect.succeed(({ searchText }) =>
    Effect.as(Effect.sleep(SEARCH_LATENCY), searchPeople(searchText))
  )
) {}
