import { Effect, Schema } from "effect"
import { AsyncData, Command, type Update } from "foldkit"
import { Query } from "foldkit/experimental"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { Post, PostsApi } from "../Posts.ts"

export const postsQuery = Query.define({
  name: "Posts",
  args: { search: Schema.String },
  data: Schema.Array(Post),
  error: Schema.String,
  execute: ({ search }) => PostsApi.use((api) => api.search(search))
})

export const Model = Schema.Struct({
  search: Schema.String,
  searchVersion: Schema.Number,
  posts: postsQuery.Model
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  UpdatedSearch: { search: Schema.String },
  CompletedDelaySearch: { version: Schema.Number },
  GotPostsMessage: { message: postsQuery.Message }
})
export type Message = typeof Message.Type

export const DelaySearch = Command.define("DelaySearch", {
  args: { version: Schema.Number },
  messages: [Message.CompletedDelaySearch],
  execute: ({ version }) =>
    Effect.sleep("300 millis").pipe(
      Effect.as(Message.CompletedDelaySearch({ version }))
    )
})

const posts = postsQuery.lift<Model, Message>({
  parentField: "posts",
  toParentMessage: (message) => Message.GotPostsMessage({ message })
})

export const init = () =>
  posts.loadIfMissing(
    { search: "", searchVersion: 0, posts: postsQuery.init() },
    { search: "" }
  )

export const update = (
  model: Model,
  message: Message
): Update.Return<Model, Message, PostsApi> =>
  Message.match(message, {
    UpdatedSearch: ({ search }) => {
      const searchVersion = model.searchVersion + 1
      return {
        model: { ...model, search, searchVersion },
        commands: [DelaySearch({ version: searchVersion })]
      }
    },
    // Only the delay that the last keystroke started fetches.
    CompletedDelaySearch: ({ version }) =>
      version === model.searchVersion
        ? posts.loadIfMissing(model, { search: model.search })
        : { model },
    GotPostsMessage: ({ message }) => posts.fold(model, message)
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([], [
    h.input([
      h.AriaLabel("Search posts"),
      h.Value(model.search),
      h.OnInput((search) => Message.UpdatedSearch({ search }))
    ]),
    AsyncData.matchData(
      postsQuery.read(model.posts, { search: model.search }),
      {
        onEmpty: () => h.p([], ["Loading posts"]),
        onFailure: () => h.p([], ["Could not load posts"]),
        onData: (posts) =>
          h.ul([], posts.map((post) => h.li([], [post.title])))
      }
    )
  ])
