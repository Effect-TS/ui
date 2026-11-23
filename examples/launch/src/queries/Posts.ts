import { Effect, Schema } from "effect"

export const Post = Schema.Struct({
  id: Schema.String,
  title: Schema.String
})
export type Post = typeof Post.Type

export const fetchPosts: Effect.Effect<ReadonlyArray<Post>, string> =
  Effect.succeed([
    { id: "1", title: "Foldkit Joins Effect" },
    { id: "2", title: "Foldkit 0.x becomes Effect UI" }
  ]).pipe(Effect.delay("300 millis"))
