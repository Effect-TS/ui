import { Component } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { TestClock } from "effect/testing"
import { PostsApi } from "../Posts.ts"
import { Posts } from "./Posts.ts"

const joins = Locator.text("Effect 4.1 release notes")
const becomes = Locator.text("Introducing Effect UI")
const loading = Locator.text("Loading posts")
const search = HtmlLocator.label("Search posts")
const refetching = Locator.attr("aria-busy", "true")

const all = "{\"search\":\"\"}"
const ui = "{\"search\":\"ui\"}"

// The app's root, which provides the service the fetcher uses.
const mount = (api: Layer.Layer<PostsApi>) =>
  HtmlPlay.make(Posts.pipe(Component.provide(api)), {})

// The args of every fetch the cache has started, in order.
const fetched = (
  play: {
    readonly root: {
      readonly fetches: () => ReadonlyArray<
        { readonly logKey: string }
      >
    }
  }
) => play.root.fetches().map((fetch) => fetch.logKey)

const TwoPosts = Html.component({
  name: "TwoPosts",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.div.children(
      Posts(h, { key: "first" }),
      Posts(h, { key: "second" })
    )
}).pipe(Component.provide(PostsApi.layer))

it.layer(TestHost.layer(), { buildPerTest: true })(
  "Effect UI posts",
  (it) => {
    it.effect("shows Loading posts, then every post", () =>
      Effect.gen(function*() {
        const play = yield* mount(PostsApi.layer)
        yield* play.expect(loading).toExist()
        yield* TestClock.adjust("300 millis")
        yield* play.expect(joins).toExist()
        yield* play.expect(becomes).toExist()
        yield* play.expect(refetching).toBeAbsent()
        assert.deepStrictEqual(fetched(play), [all])
      }))

    it.effect("fetches 300 ms after the last keystroke", () =>
      Effect.gen(function*() {
        const play = yield* mount(PostsApi.layer)
        yield* TestClock.adjust("300 millis")
        yield* play.type(search, "u")
        yield* play.expect(joins).toExist()
        yield* play.expect(refetching).toExist()
        yield* play.expect(loading).toBeAbsent()
        yield* TestClock.adjust("200 millis")
        yield* play.type(search, "ui")
        yield* TestClock.adjust("299 millis")
        assert.deepStrictEqual(fetched(play), [all])
        yield* TestClock.adjust("1 millis")
        assert.deepStrictEqual(fetched(play), [all, ui])
        yield* TestClock.adjust("300 millis")
        yield* play.expect(becomes).toExist()
        yield* play.expect(joins).toBeAbsent()
        yield* play.expect(refetching).toBeAbsent()
      }))

    it.effect("shows a fresh result at once, without a fetch", () =>
      Effect.gen(function*() {
        const play = yield* mount(PostsApi.layer)
        yield* TestClock.adjust("300 millis")
        yield* play.type(search, "ui")
        yield* TestClock.adjust("600 millis")
        yield* play.type(search, "")
        yield* play.expect(joins).toExist()
        yield* TestClock.adjust("1 second")
        assert.deepStrictEqual(fetched(play), [all, ui])
      }))

    it.effect("shows a stale result while it refetches it", () =>
      Effect.gen(function*() {
        const play = yield* mount(PostsApi.layer)
        yield* TestClock.adjust("300 millis")
        yield* play.type(search, "ui")
        yield* TestClock.adjust("1 minute")
        yield* play.type(search, "")
        yield* play.expect(joins).toBeAbsent()
        yield* play.expect(becomes).toExist()
        yield* play.expect(refetching).toExist()
        yield* TestClock.adjust("300 millis")
        yield* play.expect(joins).toExist()
        yield* play.expect(refetching).toExist()
        yield* TestClock.adjust("300 millis")
        yield* play.expect(joins).toExist()
        yield* play.expect(refetching).toBeAbsent()
        assert.deepStrictEqual(fetched(play), [all, ui, all])
      }))

    it.effect("shows Could not load posts when the fetch fails", () =>
      Effect.gen(function*() {
        const play = yield* mount(
          Layer.succeed(PostsApi, {
            search: () => Effect.fail("offline")
          })
        )
        yield* play.expect(Locator.text("Could not load posts"))
          .toExist()
      }))

    it.effect("two instances share one fetch", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(TwoPosts, {})
        yield* TestClock.adjust("300 millis")
        yield* play.expect(joins).toHaveCount(2)
        yield* play.expect(becomes).toHaveCount(2)
        assert.deepStrictEqual(fetched(play), [all])
      }))
  }
)
