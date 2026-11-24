import { Command, Component, Route, Router, UiSchema } from "@effect/ui"
import { Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"

const AppRoute = Route.union({
  Home: Route.make("/"),
  Search: Route.make("/search", {
    search: {
      q: Schema.optional(Schema.String),
      page: Schema.Number.pipe(Schema.withDecodingDefaultKey(Effect.succeed(1)))
    }
  }),
  NotFound: Route.make("/*")
})
const SearchRoute = AppRoute.subset(["Search"])
const search = SearchRoute.Search()

describe("Router.patchSearch", () => {
  it("types the patch by the held route's search fields", () => {
    expect<Router.SearchPatch<typeof search>>().type.toBe<
      { readonly q?: string | undefined; readonly page?: number | undefined }
    >()
    expect(Router.patchSearch(AppRoute, search, { q: "a" })).type.toBe<
      Command.Issued<
        Router.PatchOutcome,
        Router.PatchSearch,
        Router.PatchOutcome,
        "Effect"
      >
    >()
    expect(Router.patchSearch).type.toBeCallableWith(AppRoute, search, {})
    // undefined removes a param, or resets a defaulted one.
    expect(Router.patchSearch).type.toBeCallableWith(AppRoute, search, {
      q: undefined,
      page: undefined
    })
    expect(Router.patchSearch).type.toBeCallableWith(AppRoute, search, {
      page: 2
    }, { history: "push", scroll: true })
    expect(Router.patchSearch).type.not.toBeCallableWith(AppRoute, search, {
      page: "2"
    })
    expect(Router.patchSearch).type.not.toBeCallableWith(AppRoute, search, {
      tab: "x"
    })
    expect(Router.patchSearch).type.not.toBeCallableWith(AppRoute, search, {
      q: "a"
    }, { history: "pop" })
  })

  it("takes a held route that is a member of the union", () => {
    const Other = Route.union({
      Search: Route.make("/search", { search: { q: Schema.Number } })
    })
    expect(Router.patchSearch).type.toBeCallableWith(SearchRoute, search, {
      q: "a"
    })
    expect(Router.patchSearch).type.not.toBeCallableWith(
      AppRoute.subset(["Home"]),
      search,
      { q: "a" }
    )
    expect(Router.patchSearch).type.not.toBeCallableWith(AppRoute, {
      _tag: "Search"
    }, { q: "a" })
    expect(Router.patchSearch).type.not.toBeCallableWith(
      AppRoute,
      Other.Search({ search: { q: 1 } }),
      {}
    )
  })

  it("adds stale to the outcome, and PatchSearch to the requirements", () => {
    expect<Router.PatchOutcome>().type.toBe<"navigated" | "blocked" | "stale">()
    const Message = UiSchema.TaggedEnum({
      Typed: { value: Schema.String },
      Patched: {}
    })
    const Box = Component.define({
      name: "Box",
      props: Schema.Struct({ route: SearchRoute }),
      model: Schema.Struct({ typed: Schema.Number }),
      message: Message
    }).make({
      init: () => ({ typed: 0 }),
      update: ($, message) =>
        message._tag === "Typed"
          ? $.run([
            Router.patchSearch(AppRoute, $.props.route, {
              q: message.value || undefined
            }).pipe(
              Command.map(() => Message.Patched())
            )
          ])
          : $.model,
      view: (h) => h.text("")
    })
    expect<Component.Requirements<typeof Box>>().type.toBe<Router.PatchSearch>()
  })
})
