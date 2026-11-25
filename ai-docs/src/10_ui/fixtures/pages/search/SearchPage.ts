import { type NoteResults, NoteSort } from "#domain/Note"
import { SearchNotes } from "#queries/SearchNotes"
import { Command, Component, Head, Router, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Layer, Option, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Notes } from "../../notes/services/Notes.ts"
import { AppRoute } from "../../routes.ts"

// A one-case subset of the union types the page's props. Its values are
// route values of `AppRoute`, so the page can pass its route to
// `patchSearch`.
const SearchRoute = AppRoute.subset(["Search"])

const noteUrl = (id: string) =>
  AppRoute.print(AppRoute.Note({ params: { id } }))

export const SearchPageMessage = UiSchema.TaggedEnum({
  UpdatedSearch: { text: Schema.String },
  SelectedOrder: { sort: NoteSort },
  ClickedPage: { page: Schema.Number }
})

export const SearchPageNoDeps = Html.component({
  name: "SearchPage",
  // The page takes its whole route as props. The URL is the only copy of
  // the text, the order and the page number. The Model holds no draft of
  // them, so there is nothing to keep in sync with the URL. The results live
  // in the query's result, so the Model is empty.
  props: Schema.Struct({ route: SearchRoute }),
  model: Schema.Struct({}),
  message: SearchPageMessage,
  queries: {
    results: {
      query: SearchNotes,
      // Typing changes the args on every keystroke. `debounce` fetches once
      // they have held still for 300 ms. Args whose results are cached and
      // fresh, such as a page seen moments ago, show at once, and so does the
      // first fetch at mount.
      debounce: "300 millis",
      args: ({ props }) => {
        const { page, q, sort } = props.route.search
        return { q: q ?? "", page, sort }
      }
    }
  }
}).make({
  init: () => ({}),
  update: ($, message) =>
    SearchPageMessage.match(message, {
      // `patchSearch` writes some of the search and keeps the rest. It
      // replaces the history entry by default, so typing doesn't fill the
      // back button. `undefined` removes a param or resets it to its
      // default, so a new search starts on page 1. The new route comes back
      // as props, through the root, so the Command sends nothing.
      UpdatedSearch: ({ text }) =>
        $.run(
          Router.patchSearch(AppRoute, $.props.route, {
            q: text || undefined,
            page: undefined
          }).pipe(Command.asNoop)
        ),
      SelectedOrder: ({ sort }) =>
        $.run(
          Router.patchSearch(AppRoute, $.props.route, { sort, page: undefined })
            .pipe(Command.asNoop)
        ),
      // A page change is worth a history entry, so it pushes, and it
      // scrolls to the top like a new page would. Unlike a link to
      // `?page=2`, it isn't announced and focus stays on the button.
      ClickedPage: ({ page }) =>
        $.run(
          Router.patchSearch(AppRoute, $.props.route, { page }, {
            history: "push",
            scroll: true
          }).pipe(Command.asNoop)
        )
    }),
  head: () => [Head.title("Search notes")],
  view: (h) => {
    const { page, q, sort } = h.props.route.search

    const resultsView = (results: NoteResults) =>
      h.div(
        h.ul(
          results.notes.map((note) =>
            h.li.key(note.id).children(
              h.a.attr("href", noteUrl(note.id)).children(note.title)
            )
          )
        ),
        h.nav.attr("aria-label", "Pages").children(
          h.button.attr("type", "button").disabled(page <= 1)
            .on("click", SearchPageMessage.ClickedPage({ page: page - 1 }))
            .children("Previous"),
          h.span(`Page ${page} of ${results.pages}`),
          h.button.attr("type", "button").disabled(page >= results.pages)
            .on("click", SearchPageMessage.ClickedPage({ page: page + 1 }))
            .children("Next")
        )
      )

    return h.section(
      h.h1("Search notes"),
      // The field's value is read from the search. The route changes in the
      // same render as the keystroke, so the field keeps what the user typed
      // and where the caret is. The browser Router writes the address bar at
      // most every 200 ms, to stay under the browsers' limits on history
      // calls.
      h.input.attrs({ type: "search", "aria-label": "Search" }).value(q ?? "")
        .on(
          "input",
          ({ value }) => SearchPageMessage.UpdatedSearch({ text: value })
        ),
      h.select.attr("aria-label", "Order").value(sort)
        .on("change", ({ value }) =>
          SearchPageMessage.SelectedOrder({
            sort: value === "desc" ? "desc" : "asc"
          }))
        .children(
          h.option.attr("value", "asc").children("A to Z"),
          h.option.attr("value", "desc").children("Z to A")
        ),
      AsyncResult.match(h.queries.results, {
        // While a fetch waits or runs, `h.previous` holds the last results,
        // so the list stays on screen instead of flashing a loading state.
        onInitial: () =>
          Option.match(h.previous.results, {
            onNone: () => h.p("Searching…"),
            onSome: resultsView
          }),
        onFailure: () => h.p("The search failed."),
        onSuccess: ({ value }) => resultsView(value)
      })
    )
  }
})

// The page requires `PatchSearch` as well as its query. `PatchSearch` is a
// navigation Command, which the Router Layer in the entry module provides
// with the others, so only the query is provided here.
export const SearchPage = SearchPageNoDeps.pipe(
  Component.provide(SearchNotes.layer.pipe(Layer.provide(Notes.layerHttp)))
)
