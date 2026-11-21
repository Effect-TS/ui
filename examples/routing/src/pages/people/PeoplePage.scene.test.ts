import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { searchPeople } from "../../people/domain/Person.ts"
import { AppRoute } from "../../routes.ts"
import { PeoplePage } from "./PeoplePage.ts"

const person = (name: string) => HtmlLocator.role("heading", { name })

describe("PeoplePage", () => {
  it.effect("lists every person without a search", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(PeoplePage, { route: AppRoute.People(), searchHistory: [] })
      s.expect(Locator.text("Searching…")).toExist()
        .loaded("people", searchPeople(""))
        .expect(Locator.text("Click on any person to view their details:")).toExist()
        .expect(Locator.tag("li")).toHaveCount(5)
        .expect(Locator.text("Recent searches:")).toBeAbsent()
    }))

  it.effect("shows the matches, the count, the search it came from and the recent searches", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(PeoplePage, {
        route: AppRoute.People({ search: { searchText: "designer" } }),
        searchHistory: ["designer", "dev"]
      })
      s.loaded("people", searchPeople("designer"))
        .expect(HtmlLocator.label("Search people")).toHaveValue("designer")
        .expect(Locator.text("2 results for “designer”")).toExist()
        .expect(person("Alice Johnson")).toExist()
        .expect(person("Eva Brown")).toExist()
        .expect(person("Bob Smith")).toBeAbsent()
        .expect(Locator.text("dev", { exact: true })).toExist()
    }))
})
