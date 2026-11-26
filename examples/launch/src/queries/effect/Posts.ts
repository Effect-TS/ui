import { Component, Query, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Effect, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Post, PostsApi } from "../Posts.ts"

// A query caches one result per args; attach its fetcher with `toLayer`.
export class SearchPosts extends Query.Service<SearchPosts>()(
  "SearchPosts",
  {
    args: { search: Schema.String },
    success: Schema.Array(Post),
    error: Schema.String,
    // Stale entries refetch on next use.
    staleTime: "1 minute"
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function*() {
      const api = yield* PostsApi
      return ({ search }) => api.search(search)
    })
  )
}

export const PostsMessage = UiSchema.TaggedEnum({
  UpdatedSearch: { search: Schema.String }
})

export const Posts = Html.component({
  name: "Posts",
  model: Schema.Struct({ search: Schema.String }),
  message: PostsMessage,
  queries: {
    posts: {
      query: SearchPosts,
      // The query's args, derived from the Model when it changes.
      args: ({ model }) => ({ search: model.search }),
      // New args wait this long before they fetch, and newer args
      // restart the wait. A fresh cached result is shown at once.
      debounce: "300 millis"
    }
  }
}).make({
  init: () => ({ search: "" }),
  update: { UpdatedSearch: ($, { search }) => $.evolve({ search }) },
  view: (h, model) =>
    h.div.children(
      h.input.attr("aria-label", "Search posts").value(model.search)
        .on("input", ({ value }) =>
          PostsMessage.UpdatedSearch({ search: value })),
      // The result for the current args, as an AsyncResult.
      AsyncResult.match(h.queries.posts, {
        // No posts to keep: the first fetch, or a fetch after a failure.
        onInitial: () =>
          h.p.children("Loading posts"),
        onFailure: () => h.p.children("Could not load posts"),
        // waiting is true while newer posts load: a refetch of stale
        // posts, or the last posts kept while a new search waits or loads.
        onSuccess: ({ value, waiting }) =>
          h.ul.attr("aria-busy", String(waiting)).children(
            value.map((post) =>
              h.li.key(post.id).children(post.title)
            )
          )
      })
    )
  // SearchPosts.layer needs PostsApi, which the app provides.
}).pipe(Component.provide(SearchPosts.layer))
