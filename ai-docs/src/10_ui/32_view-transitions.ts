/**
 * @title View transitions
 *
 * Animate an update with the browser's View Transitions API: a board that
 * morphs its cards between a grid and a list, and a root that slides pages in
 * the direction of the navigation. `$.viewTransition` asks for the animation
 * in `update`, and `BrowserHost` runs it.
 */
import { ListNotes } from "#queries/ListNotes"
import { Component, Router, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Layer, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Notes } from "./fixtures/notes/services/Notes.ts"
import { NotePage } from "./fixtures/pages/notes/NotePage.ts"
import { NotesIndex } from "./fixtures/pages/NotesIndex.ts"
import { AppRoute } from "./fixtures/routes.ts"

// ---------------------------------------------------------------------------
// Animating one update of a component
// ---------------------------------------------------------------------------

const Layout = Schema.Literals(["grid", "list"])

export const NoteBoardMessage = UiSchema.TaggedEnum({
  ClickedLayout: { layout: Layout },
  TypedFilter: { value: Schema.String }
})

// Only the updates that call `$.viewTransition` animate. Switching the layout
// does; typing in the filter commits at once, so the field never lags behind
// the keyboard. Any component can ask, not only the root: the board owns its
// layout and animates it itself.
export const NoteBoardNoDeps = Component.define({
  name: "NoteBoard",
  model: Schema.Struct({ layout: Layout, filter: Schema.String }),
  message: NoteBoardMessage,
  queries: { notes: { query: ListNotes, args: () => ({}) } },
  elements: Html
}).make({
  init: () => ({ layout: "grid" as const, filter: "" }),
  update: {
    // The types tag the transition, so the stylesheet can give this
    // animation its own timing with `:active-view-transition-type(layout)`.
    ClickedLayout: ($, { layout }) =>
      $.evolve({ layout }).viewTransition(["layout"]),
    TypedFilter: ($, { value }) => $.evolve({ filter: value })
  },
  view: (h, model) =>
    h.section([
      h.div([
        h.input.attr("aria-label", "Filter").value(model.filter).onInput((
          { value }
        ) => NoteBoardMessage.TypedFilter({ value })),
        h.button.onClick(NoteBoardMessage.ClickedLayout({ layout: "grid" }))
          .children(["Grid"]),
        h.button.onClick(NoteBoardMessage.ClickedLayout({ layout: "list" }))
          .children(["List"])
      ]),
      AsyncResult.isSuccess(h.queries.notes)
        ? h.ul.class([model.layout]).children(
          h.queries.notes.value
            .filter((note) =>
              note.title.toLowerCase().includes(model.filter.toLowerCase())
            )
            .map((note) =>
              // A `viewTransitionName` makes the browser morph the card from
              // its old box to its new one instead of cross-fading the page.
              // Each name must be unique among the elements on screen, so it
              // carries the note's id.
              h.li.key(note.id).style({ viewTransitionName: `note-${note.id}` })
                .children([note.title])
            )
        )
        : h.p(["Loading notes…"])
    ])
})

export const NoteBoard = NoteBoardNoDeps.pipe(
  Component.provide(ListNotes.layer.pipe(Layer.provide(Notes.layerHttp)))
)

// ---------------------------------------------------------------------------
// Animating navigation by direction
// ---------------------------------------------------------------------------

// The root's `update` for a route change sees the route on screen as its
// Model and the new one in the message, so it can name the direction. A
// navigation that should cross-fade plainly gets no types, and one between
// unrelated pages could skip `viewTransition` altogether.
const directionOf = (
  from: typeof AppRoute.Type,
  to: typeof AppRoute.Type
): ReadonlyArray<string> => {
  if (from._tag === "Index" && to._tag === "Note") return ["forward"]
  if (from._tag === "Note" && to._tag === "Index") return ["back"]
  return []
}

const TransitionAppMessage = UiSchema.TaggedEnum({
  ChangedRoute: { route: AppRoute }
})

// Link clicks, back and forward, and `Router.push` from any `update` all
// arrive here as `ChangedRoute`, so one handler animates every navigation.
// A `Router.push` delivers the new route within the flush its `update`
// caused, and that flush still animates.
export const TransitionApp = Component.define({
  name: "TransitionApp",
  props: Schema.Struct({ route: AppRoute }),
  model: AppRoute,
  message: TransitionAppMessage,
  elements: Html
}).make({
  init: ($) => $.props.route,
  update: ($, { route: next }) =>
    $.set(next).viewTransition(directionOf($.model, next)),
  subscriptions: ({ model: route }) => [
    Router.subscription(
      AppRoute,
      route,
      (next) => TransitionAppMessage.ChangedRoute({ route: next })
    )
  ],
  view: (h, route) =>
    h.main([
      AppRoute.match(route, {
        Index: (route) => NotesIndex(h, { key: AppRoute.printPath(route) }),
        Note: (route) =>
          NotePage(h, {
            key: AppRoute.printPath(route),
            props: { id: route.params.id }
          }),
        Search: () => h.h1(["Search"]),
        NotFound: () => h.h1(["Page not found"])
      })
    ])
})

// The stylesheet picks the animation by type. Without types, or for a
// navigation that gave none, the browser cross-fades.
//
//   :root:active-view-transition-type(forward)::view-transition-new(root) {
//     animation-name: slide-in-from-right;
//   }
//   :root:active-view-transition-type(back)::view-transition-new(root) {
//     animation-name: slide-in-from-left;
//   }
//   :root:active-view-transition-type(layout)::view-transition-group(*) {
//     animation-duration: 250ms;
//   }
//
// Where the browser lacks the API, or the user prefers reduced motion, the
// same updates commit at once without animation. The first render never
// animates, and nor does a host without a document, such as `TestHost`, so
// tests and server renders are unaffected. While the browser prepares the
// transition, about a frame, the update waits: its DOM patch, the head, the
// Router's scroll and focus, and messages that arrive meanwhile all commit
// together when it calls back.
