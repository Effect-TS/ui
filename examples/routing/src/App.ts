import { addSearchToHistory } from "#domain/SearchHistory"
import { Component, Head, Router, UiSchema } from "@effect/ui"
import { NavigationLinks } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Array, Schema, String } from "effect"
import { FilesIndexPage } from "./pages/files/FilesIndexPage.ts"
import { FilesPage } from "./pages/files/FilesPage.ts"
import { HomePage } from "./pages/HomePage.ts"
import { NestedPage } from "./pages/nested/route/is/very/nested/NestedPage.ts"
import { NotFoundPage } from "./pages/NotFoundPage.ts"
import { PersonPage } from "./pages/people/PersonPage.ts"
import { AppRoute } from "./routes.ts"

const PeoplePage = Component.lazy(
  "PeoplePage",
  () =>
    import("./pages/people/PeoplePage.ts").then((module) => module.PeoplePage)
)

const filesPathOf = (route: typeof AppRoute.cases.Files.Type) =>
  String.split(route.params["*"], "/")

const routeTitle = (route: AppRoute): string =>
  AppRoute.match(route, {
    Home: () => "Routing",
    Nested: () => "Nested | Routing",
    People: () => "People | Routing",
    Person: ({ params }) => `Person ${params.personId} | Routing`,
    FilesIndex: () => "Files | Routing",
    Files: (route) =>
      `${Array.lastNonEmpty(filesPathOf(route))} | Files | Routing`,
    NotFound: () => "NotFound | Routing"
  })

const searchTextOf = (route: AppRoute): string =>
  route._tag === "People" ? route.search.searchText : ""

export const AppMessage = UiSchema.TaggedEnum({
  ChangedRoute: { route: AppRoute },
  ChangedSearchInput: { value: Schema.String }
})

const AppDef = Html.component({
  name: "App",
  props: Schema.Struct({ route: AppRoute }),
  model: Schema.Struct({
    route: AppRoute,
    searchInput: Schema.String,
    searchHistory: Schema.Array(Schema.String)
  }),
  message: AppMessage
})

const navLinks = (route: AppRoute) => [
  { label: "Home", to: AppRoute.Home(), active: route._tag === "Home" },
  {
    label: "People",
    to: AppRoute.People(),
    active: route._tag === "People",
    inSection: route._tag === "Person"
  },
  {
    label: "Files",
    to: AppRoute.FilesIndex(),
    active: route._tag === "FilesIndex",
    inSection: route._tag === "Files"
  },
  { label: "Nested", to: AppRoute.Nested(), active: route._tag === "Nested" }
]

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
    ChangedRoute: ($, { route }) => {
      const searchText = searchTextOf(route)
      return $.evolve({
        route,
        searchInput: searchText,
        searchHistory: (history) => addSearchToHistory(history, searchText)
      })
    },

    ChangedSearchInput: ($, { value }) => $.evolve({ searchInput: value })
  },

  subscriptions: ({ model }) => [
    Router.subscription(
      AppRoute,
      model.route,
      (route) => AppMessage.ChangedRoute({ route })
    )
  ],

  head: ({ model }) => [Head.title(routeTitle(model.route))],

  view: (h, { route, searchHistory, searchInput }) =>
    h.div.class("min-h-screen bg-gray-100").children(
      h.header.children(
        NavigationLinks(h, {
          view: (navigationLinks) =>
            navigationLinks.root(
              h.nav.class("bg-blue-500 text-white p-4 mb-6").attr(
                "aria-label",
                "Main"
              )
            ).children(
              navigationLinks.list(
                h.ul.class("max-w-4xl mx-auto flex gap-6 list-none")
              ).children(
                navLinks(route).map(({ active, inSection, label, to }) =>
                  navigationLinks.item(h.li.key(label)).children(
                    navigationLinks.link({
                      element: h.a.attr("href", AppRoute.print(to))
                        .class(
                          "hover:bg-blue-600 font-medium px-3 py-1 rounded transition data-active:bg-blue-700/50",
                          inSection && "bg-blue-700/50"
                        ),
                      active
                    }).children(label)
                  )
                )
              )
            )
        })
      ),
      h.main.class("max-w-4xl mx-auto px-4 py-8").children(
        AppRoute.match(route, {
          Home: () => HomePage(h),
          Nested: () => NestedPage(h),
          People: (route) =>
            PeoplePage(h, {
              props: { route, searchInput, searchHistory },
              onEmit: {
                ChangedSearchInput: ({ value }) =>
                  AppMessage.ChangedSearchInput({ value })
              },
              fallback: (result) =>
                h.p.class("text-lg text-gray-600").children(
                  result._tag === "Failure"
                    ? "Couldn't load this page. Reload to try again."
                    : "Loading…"
                )
            }),
          Person: ({ params }) => PersonPage(h, params.personId),
          FilesIndex: () => FilesIndexPage(h),
          Files: (route) => FilesPage(h, filesPathOf(route)),
          NotFound: ({ params }) => NotFoundPage(h, `/${params["*"]}`)
        })
      )
    )
})
