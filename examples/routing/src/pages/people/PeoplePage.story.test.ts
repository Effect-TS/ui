import { Router } from "@effect/ui"
import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { searchPeople } from "../../people/domain/Person.ts"
import { AppRoute } from "../../routes.ts"
import { PeoplePage, PeoplePageEvents, PeoplePageMessage } from "./PeoplePage.ts"

const people = (searchText?: string) => AppRoute.People(searchText === undefined ? {} : { search: { searchText } })

const makeStory = Effect.fn(function*(searchText?: string) {
  const s = yield* Story.make(PeoplePage, { route: people(searchText), searchHistory: [] })
  return s.loaded("people", searchPeople(searchText ?? ""))
})

describe("PeoplePage", () => {
  it.effect("typing changes only the input, and submitting pushes it to the URL", () =>
    Effect.gen(function*() {
      const s = yield* makeStory()
      s.send(PeoplePageMessage.ChangedSearchInput({ value: "designer" })).expectNone()
      assert.deepStrictEqual(s.model, { searchInput: "designer" })
      s.send(PeoplePageMessage.SubmittedSearch()).expectExact(Router.PatchSearch)
      assert.deepStrictEqual(s.pending[0].command.args, {
        route: people(),
        patch: { searchText: "designer" },
        history: "push",
        scroll: false
      })
      s.resolve(Router.PatchSearch, "navigated").expectNone()
      assert.deepStrictEqual(s.model, { searchInput: "designer" })
    }))

  it.effect("submitting an empty input removes the query parameter", () =>
    Effect.gen(function*() {
      const s = yield* makeStory("designer")
      s.send(PeoplePageMessage.ChangedSearchInput({ value: "" }))
        .send(PeoplePageMessage.SubmittedSearch())
        .expectExact(Router.PatchSearch)
      assert.deepStrictEqual(s.pending[0].command.args, {
        route: people("designer"),
        patch: { searchText: undefined },
        history: "push",
        scroll: false
      })
      s.resolve(Router.PatchSearch, "navigated")
    }))

  it.effect("a route change replaces the input with the URL's search", () =>
    Effect.gen(function*() {
      const s = yield* makeStory("designer")
      assert.deepStrictEqual(s.model, { searchInput: "designer" })
      s.send(PeoplePageMessage.ChangedSearchInput({ value: "unsent" }))
        .props({ route: people("dev"), searchHistory: ["dev", "designer"] })
        .loaded("people", searchPeople("dev"))
        .receive(PeoplePageMessage.ChangedRoute())
      assert.deepStrictEqual(s.model, { searchInput: "dev" })
    }))

  it.effect("reports the search input gaining and losing focus", () =>
    Effect.gen(function*() {
      const s = yield* makeStory()
      s.send(PeoplePageMessage.FocusedSearchInput())
        .emitted(PeoplePageEvents.FocusedSearchInput())
        .send(PeoplePageMessage.BlurredSearchInput())
        .emitted(PeoplePageEvents.BlurredSearchInput())
    }))
})
