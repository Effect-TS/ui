import { Person, searchPeople } from "#domain/Person"
import { Query } from "@effect/ui"
import { Duration, Effect, Schema } from "effect"

const SEARCH_LATENCY = Duration.millis(300)

export class SearchPeople extends Query.Service<SearchPeople>()(
  "people/SearchPeople",
  {
    args: { searchText: Schema.String },
    success: Schema.Array(Person),
    staleTime: "Infinity"
  }
) {
  static readonly layer = this.toLayer(({ searchText }) =>
    Effect.as(Effect.sleep(SEARCH_LATENCY), searchPeople(searchText))
  )
}
