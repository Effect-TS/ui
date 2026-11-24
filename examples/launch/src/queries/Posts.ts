import { Context, Effect, Layer, Schema } from "effect"

export const Post = Schema.Struct({
  id: Schema.String,
  title: Schema.String
})
export type Post = typeof Post.Type

const posts: ReadonlyArray<Post> = [
  { id: "1", title: "Foldkit Joins Effect" },
  { id: "2", title: "Foldkit 0.x becomes Effect UI" }
]

/** The posts backend both examples search. */
export class PostsApi extends Context.Service<PostsApi, {
  readonly search: (
    search: string
  ) => Effect.Effect<ReadonlyArray<Post>, string>
}>()("PostsApi") {
  /** Answers after 300 ms with the posts whose title has `search`. */
  static readonly layer = Layer.succeed(PostsApi, {
    search: (search) =>
      Effect.succeed(
        posts.filter((post) =>
          post.title.toLowerCase().includes(search.toLowerCase())
        )
      ).pipe(Effect.delay("300 millis"))
  })
}
