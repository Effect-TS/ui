import { Command, Component, Head, Router, UiSchema } from "@effect/ui"
import { HtmlHead } from "@effect/ui/html"
import { Schema } from "effect"
import { NotePage } from "./pages/notes/NotePage.ts"
import { NotesIndex } from "./pages/NotesIndex.ts"
import { SearchPage } from "./pages/search/SearchPage.ts"
import { AppRoute } from "./routes.ts"

// The union has a constructor per route, keyed by its tag. A route without
// fields that need a value takes no argument.
const indexRoute = AppRoute.Index()
// The constructor fills in the search defaults, and `print` leaves them out,
// so this prints as `/search`.
const searchRoute = AppRoute.Search()

export const AppMessage = UiSchema.TaggedEnum({
  ChangedRoute: { route: AppRoute },
  ClickedBackToNotes: {}
})

// The root needs no domain Layers of its own, because each page provides
// what it uses. Only the Router is left, so there is no `AppNoDeps`.
export const App = Component.define({
  name: "App",
  // The root holds the route. The first one arrives through props and every
  // later change arrives as a message, which puts navigation in the message
  // log. That includes every search change a page writes, and `init` stays
  // pure.
  props: Schema.Struct({ route: AppRoute }),
  model: Schema.Struct({ route: AppRoute }),
  message: AppMessage
}).make({
  init: ($) => ({ route: $.props.route }),
  update: ($, message) =>
    AppMessage.match(message, {
      ChangedRoute: ({ route }) => ({ route }),
      // The new route comes back through the Router subscription, so the
      // navigation sends nothing. `Command.asNoop` ends it with no message,
      // and with no no-op variant in `AppMessage`. It also hides a
      // navigation a guard blocked, which this one has no use for.
      ClickedBackToNotes: () =>
        $.run([Router.push(AppRoute, indexRoute).pipe(Command.asNoop)])
    }),
  subscriptions: ({ model }) => [
    Router.subscription(
      AppRoute,
      model.route,
      (route) => AppMessage.ChangedRoute({ route })
    )
  ],
  // App-wide head defaults go in the root's `head`, not in the HTML shell.
  // The template wraps the title a page below sets, giving
  // "All notes · Notes".
  head: () => [
    Head.titleTemplate((title) => `${title} · Notes`),
    HtmlHead.lang("en")
  ],
  view: (h, { route }) =>
    h.div([
      h.header([
        h.a.attr("href", AppRoute.print(indexRoute)).children(["Notes"]),
        h.a.attr("href", AppRoute.print(searchRoute)).children(["Search"])
      ]),
      h.main([
        // `match` is exhaustive. Key each page by its path with `printPath`,
        // so a new path mounts a fresh page instead of reusing the old state.
        // `printPath` leaves out the search, so a search change updates the
        // page in place with new props, and its queries keep their last
        // results. Keyed by `print`, the search page would remount on every
        // keystroke.
        //
        // A page that should start over when one param changes adds that
        // param to its key, as `${AppRoute.printPath(route)}?sort=${route.search.sort}`.
        AppRoute.match(route, {
          Index: (route) => NotesIndex(h, { key: AppRoute.printPath(route) }),
          // A page that uses its search takes the whole route as props.
          Search: (route) =>
            SearchPage(h, { key: AppRoute.printPath(route), props: { route } }),
          // A page that doesn't can keep taking picked fields.
          Note: (route) =>
            NotePage(h, {
              key: AppRoute.printPath(route),
              props: { id: route.params.id }
            }),
          NotFound: () =>
            h.section([
              h.h1(["Page not found"]),
              h.button.onClick(AppMessage.ClickedBackToNotes()).children([
                "Back to all notes"
              ])
            ])
        })
      ])
    ])
})
