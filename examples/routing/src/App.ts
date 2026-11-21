import { Command, Component, Head, Router, Subscription, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Duration, Effect, Schema, Stream } from "effect"
import { FilesIndexPage } from "./pages/files/FilesIndexPage.ts"
import { FilesPage } from "./pages/files/FilesPage.ts"
import { HomePage } from "./pages/HomePage.ts"
import { NestedPage } from "./pages/nested/route/is/very/nested/NestedPage.ts"
import { NotFoundPage } from "./pages/NotFoundPage.ts"
import { PeoplePage, PeoplePageMessage } from "./pages/people/PeoplePage.ts"
import { PersonPage } from "./pages/people/PersonPage.ts"
import { addSearchToHistory } from "./people/domain/SearchHistory.ts"
import { AppRoute } from "./routes.ts"

const filesPathOf = (route: typeof AppRoute.cases.Files.Type): ReadonlyArray<string> => route.params["*"].split("/")

const routeTitle = (route: AppRoute): string => {
  switch (route._tag) {
    case "Home":
      return "Routing"
    case "Person":
      return `Person ${route.params.personId} | Routing`
    case "FilesIndex":
      return "Files | Routing"
    case "Files":
      return `${filesPathOf(route).at(-1)} | Files | Routing`
    default:
      return `${route._tag} | Routing`
  }
}

const recordSearch = (history: ReadonlyArray<string>, route: AppRoute): ReadonlyArray<string> =>
  route._tag === "People" ? addSearchToHistory(history, route.search.searchText ?? "") : history

const SHORTCUT_PREFIX = "g"
const SHORTCUT_TIMEOUT = Duration.seconds(1)

const shortcutRoutes: ReadonlyMap<string, AppRoute> = new Map<string, AppRoute>([
  ["h", AppRoute.Home()],
  ["p", AppRoute.People()],
  ["f", AppRoute.FilesIndex()],
  ["n", AppRoute.Nested()]
])

export const AppMessage = UiSchema.TaggedEnum({
  ChangedRoute: { route: AppRoute },
  PressedShortcutKey: { key: Schema.String },
  ExpiredShortcutPrefix: {},
  FocusedSearchInput: {},
  BlurredSearchInput: {}
})

const People = PeoplePage.ref("People")

const AppDef = Component.define({
  name: "App",
  props: Schema.Struct({ route: AppRoute }),
  model: Schema.Struct({
    route: AppRoute,
    searchHistory: Schema.Array(Schema.String),
    searchInputFocused: Schema.Boolean,
    shortcutPending: Schema.Boolean
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
  init: ($) => ({
    route: $.props.route,
    searchHistory: recordSearch([], $.props.route),
    searchInputFocused: false,
    shortcutPending: false
  }),

  update: {
    ChangedRoute: (model, { route }, $) => {
      const step = $.evolve({
        route,
        searchHistory: (history) => recordSearch(history, route),
        // An input removed along with its page sends no blur.
        searchInputFocused: (focused) => focused && route._tag === "People"
      })
      return model.route._tag === "People" && route._tag === "People"
        ? step.send(People, PeoplePageMessage.ChangedRoute())
        : step
    },

    PressedShortcutKey: (model, { key }, $) => {
      const route = model.shortcutPending ? shortcutRoutes.get(key) : undefined
      return route === undefined
        ? $.evolve({ shortcutPending: key === SHORTCUT_PREFIX })
        : $.evolve({ shortcutPending: false }).run(Router.push(AppRoute, route).pipe(Command.asNoop))
    },

    ExpiredShortcutPrefix: (_model, _message, $) => $.evolve({ shortcutPending: false }),

    FocusedSearchInput: (_model, _message, $) => $.evolve({ searchInputFocused: true }),

    BlurredSearchInput: (_model, _message, $) => $.evolve({ searchInputFocused: false })
  },

  subscriptions: (model) => [
    Router.subscription(AppRoute, model.route, (route) => AppMessage.ChangedRoute({ route })),
    !model.searchInputFocused &&
    Html.onDocument("keydown", ({ key, ctrl, alt, meta, composing, defaultPrevented }) => {
      if (defaultPrevented || ctrl || alt || meta || composing || key.length !== 1) {
        return undefined
      }
      const pressed = key.toLowerCase()
      return model.shortcutPending || pressed === SHORTCUT_PREFIX
        ? AppMessage.PressedShortcutKey({ key: pressed })
        : undefined
    }),
    model.shortcutPending &&
    Subscription.make(
      "shortcutTimeout",
      Stream.fromEffect(Effect.as(Effect.sleep(SHORTCUT_TIMEOUT), AppMessage.ExpiredShortcutPrefix()))
    )
  ],

  head: (model) => [Head.title(routeTitle(model.route))],

  view: ({ route, searchHistory }, h) =>
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
      h.main.class("py-8").children(
        AppRoute.match(route, {
          Home: () => HomePage(h),
          Nested: () => NestedPage(h),
          People: (route) =>
            PeoplePage(h, {
              ref: People,
              props: { route, searchHistory },
              onEmit: {
                FocusedSearchInput: () => AppMessage.FocusedSearchInput(),
                BlurredSearchInput: () => AppMessage.BlurredSearchInput()
              }
            }),
          Person: ({ params }) => PersonPage(h, params.personId),
          FilesIndex: () => FilesIndexPage(h),
          Files: (route) => FilesPage(h, filesPathOf(route)),
          NotFound: ({ params }) => NotFoundPage(h, `/${params["*"]}`)
        })
      )
    )
})
