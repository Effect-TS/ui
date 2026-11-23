import { Option, Schema } from "effect"
import { AsyncData, type Update } from "foldkit"
import { Query } from "foldkit/experimental"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { fetchPosts, Post } from "../Posts.ts"

export const postsQuery = Query.define({
  name: "Posts",
  data: Schema.Array(Post),
  error: Schema.String,
  execute: fetchPosts
})

export const Model = Schema.Struct({ posts: postsQuery.Model })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotPostsMessage: { message: postsQuery.Message }
})
export type Message = typeof Message.Type

const posts = postsQuery.lift<Model, Message>({
  parentField: "posts",
  toParentMessage: (message) => Message.GotPostsMessage({ message })
})

export const init = () => posts.revalidateOrLoad({ posts: postsQuery.init() })

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match(message, {
    GotPostsMessage: ({ message }) => posts.fold(model, message)
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(AsyncData.getData(postsQuery.read(model.posts)), {
    onNone: () => h.p([], ["Loading posts"]),
    onSome: (posts) => h.ul([], posts.map((post) => h.li([], [post.title])))
  })
