import { Component, Query, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Effect, Option, Schema } from "effect"
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
  view: (h, model) => {
    const list = (posts: ReadonlyArray<Post>, busy: boolean) =>
      h.ul.attr("aria-busy", String(busy)).children(
        posts.map((post) => h.li.key(post.id).children(post.title))
      )
    return h.div.children(
      h.input.attr("aria-label", "Search posts").value(model.search)
        .on(
          "input",
          ({ value }) => PostsMessage.UpdatedSearch({ search: value })
        ),
      // The result for the current args, as an AsyncResult.
      AsyncResult.match(h.queries.posts, {
        // No result for these args yet: the wait or the fetch is running.
        // h.previous holds the last posts, which stay on screen, busy.
        onInitial: () =>
          Option.match(h.previous.posts, {
            onNone: () => h.p.children("Loading posts"),
            onSome: (posts) => list(posts, true)
          }),
        onFailure: () => h.p.children("Could not load posts"),
        // waiting is true while a stale result is being refetched.
        onSuccess: ({ value, waiting }) => list(value, waiting)
      })
    )
  }
  // SearchPosts.layer needs PostsApi, which the app provides.
}).pipe(Component.provide(SearchPosts.layer))
