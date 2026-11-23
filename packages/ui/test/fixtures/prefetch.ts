/**
 * An app that declares its routes' queries with `Router.prefetch`: a sidebar
 * mounted on every route, a detail page, a page whose walk reaches a component
 * child through another's slot, a feature child and two components whose query the declarer can't
 * see, a page whose view throws, and a page whose Layer fails.
 */
import { Component, Feature, Query, Route, Router, UiSchema } from "@effect/ui"
import { Context, Effect, Layer, Schema } from "effect"
import { GetPerson } from "./router.ts"

export const Routes = Route.union({
  Home: Route.make("/"),
  // A declared search: a key it doesn't declare is dropped, so it doesn't change the printed route.
  Person: Route.make("/people/:id", { params: { id: Schema.Number }, search: { tab: Schema.optional(Schema.String) } }),
  Walk: Route.make("/walk"),
  Broken: Route.make("/broken"),
  Empty: Route.make("/empty"),
  Failing: Route.make("/failing")
})
export type Routes = typeof Routes.Type

/** A query the app never provides at the declarer. */
export class GetNote extends Query.Service<GetNote>()("GetNote", {
  args: { id: Schema.Number },
  success: Schema.String,
  error: Schema.Never,
  staleTime: "1 minute"
}, Effect.succeed(({ id }) => Effect.succeed(`Note ${id}`))) {}

const reader = <const Name extends string>(name: Name) =>
  Component.define({
    name,
    scoped: false,
    props: Schema.Struct({ id: Schema.Number }),
    model: Schema.Struct({}),
    message: Schema.Never,
    queries: { person: { query: GetPerson, args: ({ props }) => ({ id: props.id }) } }
  }).make({
    init: () => ({}),
    update: ($) => $.model,
    view: (h) => h.el("p", name)
  })

export const Sidebar = reader("Sidebar")
export const Detail = reader("Detail")
export const Card = reader("Card")

/** Reads `GetNote`, which the declarer can't see. */
export const Note = Component.define({
  name: "Note",
  scoped: false,
  props: Schema.Struct({ id: Schema.Number }),
  model: Schema.Struct({}),
  message: Schema.Never,
  queries: { note: { query: GetNote, args: ({ props }) => ({ id: props.id }) } }
}).make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) => h.el("p", "Note")
})

/** Places what its parent passes, so a walk reaches the parent's content through it. */
export const Frame = Component.define({
  name: "Frame",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  slots: ["body"]
})
  .make({ init: () => null, update: ($) => $.model, view: (h) => h.el("section", h.slots.body) })

export class Badge extends Feature.Service<Badge>()("test/Badge", { props: Schema.Struct({}) }) {}

/** Reads person 1, and shows a card for person 2 in a frame's slot, a feature, and a note with and without a `provide`. */
export const Walked = Component.define({
  name: "Walked",
  scoped: false,
  model: Schema.Struct({}),
  message: Schema.Never,
  queries: { person: { query: GetPerson, args: () => ({ id: 1 }) } }
}).make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) =>
    h.el(
      "div",
      Frame(h, { key: "frame", slots: { body: Card(h, { key: "card", props: { id: 2 } }) } }),
      Badge.render(h, { key: "badge", fallback: () => h.text("") }),
      Note.pipe(Component.provide(GetNote.layer))(h, { key: "provided", props: { id: 1 } }),
      Note(h, { key: "bare", props: { id: 2 } })
    )
})

/** Reads person 3, then its view throws. */
export const Broken = Component.define({
  name: "Broken",
  scoped: false,
  model: Schema.Struct({}),
  message: Schema.Never,
  queries: { person: { query: GetPerson, args: () => ({ id: 3 }) } }
}).make({
  init: () => ({}),
  update: ($) => $.model,
  view: () => {
    throw new Error("Broken view")
  }
})

class Nothing extends Context.Service<Nothing, string>()("test/Nothing") {}

/** A page whose provided Layer fails. */
export const Failing = Component.define({
  name: "Failing",
  scoped: false,
  model: Schema.Struct({}),
  message: Schema.Never
}).make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) => h.el("p", "Failing")
}).pipe(Component.provide(Layer.effect(Nothing, Effect.die("no build"))))

/** What the Person handler saw as the current location when it ran. */
export const probe = { location: (): string => "", seen: [] as Array<string> }

const AppMessage = UiSchema.TaggedEnum({ ChangedRoute: { route: Routes } })

export const App = Component.define({
  name: "App",
  scoped: false,
  props: Schema.Struct({ route: Routes }),
  model: Schema.Struct({ route: Routes }),
  message: AppMessage
}).make({
  init: ($) => ({ route: $.props.route }),
  update: (_, message) => ({ route: message.route }),
  subscriptions: ({ model }) => [
    Router.subscription(Routes, model.route, (route) => AppMessage.ChangedRoute({ route })),
    Router.prefetch(Routes, {
      // The sidebar is mounted already: the check after a push skips it.
      Home: () => [Router.page(Sidebar, { id: 9 })],
      Person: ({ params }) => {
        probe.seen.push(probe.location())
        // Person 7 declares an entry its page never watches.
        return [Router.page(Detail, { id: params.id === 7 ? 70 : params.id })]
      },
      Walk: () => [Router.page(Walked)],
      Broken: () => [Router.page(Broken), Router.page(Detail, { id: 4 })],
      // Nothing mounts the declared page.
      Empty: () => [Router.page(Detail, { id: 5 })],
      Failing: () => [Router.page(Detail, { id: 6 })]
    })
  ],
  view: (h, model) =>
    h.el(
      "div",
      Sidebar(h, { key: "sidebar", props: { id: 0 } }),
      Routes.match(model.route, {
        Home: () => h.el("h1", "Home"),
        Person: (route) => Detail(h, { key: Routes.print(route), props: { id: route.params.id } }),
        Walk: () => h.el("h1", "Walk"),
        Broken: () => h.el("h1", "Broken"),
        Empty: () => h.el("h1", "Empty"),
        Failing: (route) => Failing(h, { key: Routes.print(route), props: {} })
      })
    )
})
