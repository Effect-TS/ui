import { Component, Query } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Effect, Option, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { fetchPosts, Post } from "../Posts.ts"

export class GetPosts extends Query.Service<GetPosts>()("GetPosts", {
  args: {},
  success: Schema.Array(Post),
  error: Schema.String,
  staleTime: "1 minute"
}, Effect.succeed(() => fetchPosts)) {}

export const Posts = Component.define({
  name: "Posts",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html,
  queries: {
    posts: { query: GetPosts, args: () => ({}) }
  }
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    Option.match(AsyncResult.value(h.queries.posts), {
      onNone: () => h.p.children("Loading posts"),
      onSome: (posts) =>
        h.ul.children(
          posts.map((post) => h.li.key(post.id).children(post.title))
        )
    })
}).pipe(Component.provide(GetPosts.layer))
