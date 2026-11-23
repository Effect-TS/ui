import { Component, Query } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Effect, Schema } from "effect"
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
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html,
  queries: {
    posts: { query: GetPosts, args: () => ({}) }
  }
}).make({
  init: () => ({}),
  update: (model) => model,
  view: (_model, h) => {
    const posts = h.queries.posts
    return AsyncResult.isSuccess(posts)
      ? h.ul.children(posts.value.map((post) => h.li.key(post.id).children(post.title)))
      : h.p.children("Loading posts")
  }
})
