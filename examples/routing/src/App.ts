import { addSearchToHistory } from "#domain/SearchHistory"
import { Component, Head, Router, UiSchema } from "@effect/ui"
import { Schema } from "effect"
import { FilesIndexPage } from "./pages/files/FilesIndexPage.ts"
import { FilesPage } from "./pages/files/FilesPage.ts"
import { HomePage } from "./pages/HomePage.ts"
import { NestedPage } from "./pages/nested/route/is/very/nested/NestedPage.ts"
import { NotFoundPage } from "./pages/NotFoundPage.ts"
import { PeoplePage } from "./pages/people/PeoplePage.ts"
import { PersonPage } from "./pages/people/PersonPage.ts"
import { AppRoute } from "./routes.ts"

const filesPathOf = (route: typeof AppRoute.cases.Files.Type): ReadonlyArray<string> => route.params["*"].split("/")

const routeTitle = (route: AppRoute): string =>
  AppRoute.match(route, {
    Home: () => "Routing",
    Nested: () => "Nested | Routing",
    People: () => "People | Routing",
    Person: ({ params }) => `Person ${params.personId} | Routing`,
    FilesIndex: () => "Files | Routing",
    Files: (route) => `${filesPathOf(route).at(-1)} | Files | Routing`,
    NotFound: () => "NotFound | Routing"
  })

const searchTextOf = (route: AppRoute): string => route._tag === "People" ? route.search.searchText : ""

export const AppMessage = UiSchema.TaggedEnum({
  ChangedRoute: { route: AppRoute },
  ChangedSearchInput: { value: Schema.String }
})

const AppDef = Component.define({
  name: "App",
  props: Schema.Struct({ route: AppRoute }),
  model: Schema.Struct({
    route: AppRoute,
    searchInput: Schema.String,
    searchHistory: Schema.Array(Schema.String)
  }),
  message: AppMessage
})

const NavLink = AppDef.fragment((h, label: string, route: AppRoute, active: boolean) =>
  h.li.children(
    h.a.attr("href", AppRoute.print(route))
      .attr("aria-current", active ? "page" : undefined)
      .class("hover:bg-blue-600 font-medium px-3 py-1 rounded transition", active && "bg-blue-700/50")
      .children(label)
  )
)

export const App = AppDef.make({
  init: ($) => {
    const searchText = searchTextOf($.props.route)
    return {
      route: $.props.route,
      searchInput: searchText,
      searchHistory: addSearchToHistory([], searchText)
    }
  },

  update: {
    ChangedRoute: (_model, { route }, $) => {
      const searchText = searchTextOf(route)
      return $.evolve({
        route,
        searchInput: searchText,
        searchHistory: (history) => addSearchToHistory(history, searchText)
      })
    },

    ChangedSearchInput: (_model, { value }, $) => $.evolve({ searchInput: value })
  },

  subscriptions: (model) => [
    Router.subscription(AppRoute, model.route, (route) => AppMessage.ChangedRoute({ route }))
  ],

  head: (model) => [Head.title(routeTitle(model.route))],

  view: ({ route, searchHistory, searchInput }, h) =>
    h.div.class("min-h-screen bg-gray-100").children(
      h.header.children(
        h.nav.class("bg-blue-500 text-white p-4 mb-6").children(
          h.ul.class("max-w-4xl mx-auto flex gap-6 list-none").children(
            NavLink(h, "Home", AppRoute.Home(), route._tag === "Home"),
            NavLink(h, "People", AppRoute.People(), route._tag === "People" || route._tag === "Person"),
            NavLink(h, "Files", AppRoute.FilesIndex(), route._tag === "FilesIndex" || route._tag === "Files"),
            NavLink(h, "Nested", AppRoute.Nested(), route._tag === "Nested")
          )
        )
      ),
      h.main.class("max-w-4xl mx-auto px-4 py-8").children(
        AppRoute.match(route, {
          Home: () => HomePage(h),
          Nested: () => NestedPage(h),
          People: (route) =>
            PeoplePage(h, {
              props: { route, searchInput, searchHistory },
              onEmit: { ChangedSearchInput: ({ value }) => AppMessage.ChangedSearchInput({ value }) }
            }),
          Person: ({ params }) => PersonPage(h, params.personId),
          FilesIndex: () => FilesIndexPage(h),
          Files: (route) => FilesPage(h, filesPathOf(route)),
          NotFound: ({ params }) => NotFoundPage(h, `/${params["*"]}`)
        })
      )
    )
})
