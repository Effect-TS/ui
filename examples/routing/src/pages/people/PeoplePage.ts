import { Command, Component, Router, UiSchema } from "@effect/ui"
import { Button, Input } from "@effect/ui-kit"
import { Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import type { Person } from "../../people/domain/Person.ts"
import { SearchPeople } from "../../people/queries/SearchPeople.ts"
import { AppRoute, PeopleRoute } from "../../routes.ts"

const searchTextOf = (route: PeopleRoute): string => route.search.searchText ?? ""

const statusText = (searchText: string, people: ReadonlyArray<Person>): string => {
  if (searchText === "") {
    return "Click on any person to view their details:"
  }
  return `${people.length} ${people.length === 1 ? "result" : "results"} for “${searchText}”`
}

export const PeoplePageMessage = UiSchema.TaggedEnum({
  ChangedSearchInput: { value: Schema.String },
  SubmittedSearch: {},
  FocusedSearchInput: {},
  BlurredSearchInput: {},
  ChangedRoute: {}
})

export const PeoplePageEvents = UiSchema.TaggedEnum({
  FocusedSearchInput: {},
  BlurredSearchInput: {}
})

const PeoplePageDef = Component.define({
  name: "PeoplePage",
  props: Schema.Struct({ route: PeopleRoute, searchHistory: Schema.Array(Schema.String) }),
  model: Schema.Struct({ searchInput: Schema.String }),
  message: PeoplePageMessage,
  events: PeoplePageEvents,
  receives: ["ChangedRoute"],
  queries: {
    people: { query: SearchPeople, args: (_model, props) => ({ searchText: searchTextOf(props.route) }) }
  }
})

export const PeoplePageNoDeps = PeoplePageDef.make({
  init: ($) => ({ searchInput: searchTextOf($.props.route) }),

  update: {
    ChangedSearchInput: (_model, { value }, $) => $.evolve({ searchInput: value }),

    SubmittedSearch: (model, _message, $) =>
      $.run(
        Router.patchSearch(AppRoute, $.props.route, { searchText: model.searchInput || undefined }, {
          history: "push"
        }).pipe(Command.asNoop)
      ),

    FocusedSearchInput: (_model, _message, $) => $.emit(PeoplePageEvents.FocusedSearchInput()),

    BlurredSearchInput: (_model, _message, $) => $.emit(PeoplePageEvents.BlurredSearchInput()),

    ChangedRoute: (_model, _message, $) => $.evolve({ searchInput: searchTextOf($.props.route) })
  },

  view: (model, h) => {
    const people = h.queries.people
    return h.div.class("max-w-4xl mx-auto px-4").children(
      h.h1.class("text-4xl font-bold text-gray-800 mb-6").children("People"),
      h.search.class("mb-6").children(
        h.form.onSubmit(PeoplePageMessage.SubmittedSearch()).class("flex gap-2").children(
          h.div.class("flex-1").children(
            h.label.attr("for", "people-search").class("sr-only").children("Search people"),
            Input(h, {
              props: { value: model.searchInput },
              onUpdate: ({ value }) => PeoplePageMessage.ChangedSearchInput({ value })
            })
              .attr("id", "people-search")
              .attr("type", "search")
              .attr("placeholder", "Search by name or role...")
              .attr("autocomplete", "off")
              .onFocus(PeoplePageMessage.FocusedSearchInput())
              .onBlur(PeoplePageMessage.BlurredSearchInput())
              .class(
                "w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              )
          ),
          Button(h, { props: { type: "submit" } })
            .class("px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer")
            .children("Search")
        )
      ),
      h.props.searchHistory.length > 0 &&
        h.div.class("mb-6 text-sm text-gray-600 flex flex-wrap gap-2").children(
          h.span.class("font-medium").children("Recent searches:"),
          h.props.searchHistory.map((term) =>
            h.span.key(term).class("px-2 py-1 bg-gray-200 rounded font-mono text-gray-800").children(term)
          )
        ),
      h.p.key("status").attr("aria-live", "polite").class("text-lg text-gray-600 mb-6").children(
        AsyncResult.isSuccess(people) ? statusText(searchTextOf(h.props.route), people.value) : "Searching…"
      ),
      AsyncResult.isSuccess(people) &&
        h.ul.class("space-y-3").children(
          people.value.map((person) =>
            h.li.key(String(person.id)).class("border border-gray-200 rounded-lg hover:bg-gray-50").children(
              h.a.attr("href", AppRoute.print(AppRoute.Person({ params: { personId: person.id } })))
                .class("block p-4")
                .children(
                  h.div.class("flex justify-between items-center").children(
                    h.h2.class("text-xl font-semibold text-gray-800").children(person.name),
                    h.p.class("text-gray-600").children(person.role)
                  )
                )
            )
          )
        )
    )
  }
})

export const PeoplePage = PeoplePageNoDeps.pipe(Component.provide(SearchPeople.layer))
