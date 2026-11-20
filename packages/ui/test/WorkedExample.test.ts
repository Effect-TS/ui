/**
 * The experiments of the query spec's worked example (§5.7), run on the app
 * in `fixtures/users.ts`.
 */
import { Component, Router } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Locator, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { TestClock } from "effect/testing"
import * as users from "./fixtures/users.ts"

const setup = (url: string) => {
  const server = users.makeServer()
  const history = Router.memoryHistory(url)
  const deps = Layer.mergeAll(
    users.layer.pipe(Layer.provide(server.layer)),
    Router.make({ routes: users.AppRoute, history })
  )
  return { server, deps }
}

const run = <A, E>(deps: Layer.Layer<any>, effect: Effect.Effect<A, E, any>, flush?: TestHost.Flush) =>
  effect.pipe(Effect.provide(deps), Effect.scoped, Effect.provide(TestHost.layer({ flush }))) as Effect.Effect<A, E>

const mount = Effect.flatMap(Router.currentRoute(users.AppRoute), (route) => TestHost.mount(users.App, { route }))

const navigate = Effect.fnUntraced(function*(url: string) {
  const router = yield* Router.Router
  yield* router.navigate(url)
  yield* TestHost.settle
})

type Root = Pick<TestHost.TestRoot<any, any, any>, "get" | "fetches">

const click = (root: Root, text: string) => Locator.fire(root.get(Locator.text(text, { exact: true })), "click")
const nameInput = (root: Root) => root.get(Locator.attr("aria-label", "Name")) as TestHost.TestElement
const rename = (root: Root, name: string) => {
  Locator.fire(nameInput(root), "input", { value: name })
  Locator.fire(root.get(Locator.tag("form")), "submit")
}
/** The card's heading: the user's name as the card shows it. */
const cardName = (root: Root) => Locator.textOf(root.get(Locator.tag("h2")))
const fetchesOf = (root: Root, read: string) => root.fetches().filter((fetch) => fetch.query === read)
const count = (text: string, part: string) => text.split(part).length - 1

/** The list page and the detail page side by side. */
const Both = Component.define({
  name: "Both",
  lifetime: "view",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) =>
    h.div(
      users.ListPage(h, { key: "list" }),
      users.DetailPage(h, { key: "detail", props: { id: "1" } })
    )
})

describe("the worked example", () => {
  it.effect("a patch reaches the list row and the detail card in the same first frame as the issuing update", () => {
    const { deps } = setup("/")
    return run(
      deps,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Both, {})
        yield* TestHost.settle
        yield* TestClock.adjust("10 millis")
        click(root, "Rename")
        yield* TestHost.settle
        rename(root, "Bob")
        yield* TestHost.settle
        const frames = root.frames()
        const first = frames.findIndex((frame) => frame.includes("Bob"))
        // The list row and the card heading, and the form already saving.
        assert.strictEqual(count(frames[first], "Bob"), 2)
        assert.include(frames[first], "Saving…")
        assert.isTrue(frames.every((frame) => count(frame, "Bob") === 0 || count(frame, "Bob") === 2))
        yield* TestClock.adjust("100 millis")
        yield* TestHost.settle
        assert.strictEqual(count(root.text(), "Bob"), 2)
      })
    )
  })

  it.effect("two queued saves of one field show B, C, C with no refetch between them", () => {
    const { deps, server } = setup("/users/1")
    return run(
      deps,
      Effect.gen(function*() {
        const root = yield* mount
        yield* TestHost.settle
        yield* TestClock.adjust("10 millis")
        click(root, "Rename")
        yield* TestHost.settle
        const gets = server.calls.get
        rename(root, "B")
        yield* TestHost.settle
        const shown = [cardName(root)]
        rename(root, "C")
        yield* TestHost.settle
        shown.push(cardName(root))
        yield* TestClock.adjust("100 millis")
        shown.push(cardName(root))
        yield* TestClock.adjust("100 millis")
        yield* TestHost.settle
        shown.push(cardName(root))
        assert.deepStrictEqual(shown, ["B", "C", "C", "C"])
        assert.strictEqual(server.calls.rename, 2)
        assert.strictEqual(server.calls.get, gets)
        assert.deepStrictEqual(fetchesOf(root, "users/GetUser").length, 1)
      })
    )
  })

  it.effect("a likes + 1 patch across a Visibility edge never double-counts", () => {
    const { deps, server } = setup("/users/1")
    return run(
      deps,
      Effect.gen(function*() {
        const root = yield* mount
        yield* TestHost.settle
        yield* TestClock.adjust("10 millis")
        // The entry goes stale while it is on screen.
        yield* TestClock.adjust("31 seconds")
        click(root, "♥ 0")
        yield* TestHost.settle
        assert.include(root.text(), "♥ 1")
        // The edge finds the entry stale, and the refetch waits for the run.
        yield* TestHost.setVisible(false)
        yield* TestHost.setVisible(true)
        yield* TestHost.settle
        assert.deepStrictEqual(root.entry(users.GetUser, { id: "1" })?.fetch, "held")
        yield* TestClock.adjust("100 millis")
        yield* TestClock.adjust("10 millis")
        yield* TestHost.settle
        assert.strictEqual(server.users.get("1")?.likes, 1)
        assert.include(root.text(), "♥ 1")
        assert.isFalse(root.frames().some((frame) => frame.includes("♥ 2")))
      })
    )
  })

  it.effect("going from route A to route B on a stale shared entry refetches, and a child joining a watched stale entry doesn't", () => {
    const { deps } = setup("/users/1")
    return run(
      deps,
      Effect.gen(function*() {
        const root = yield* mount
        yield* TestHost.settle
        yield* TestClock.adjust("10 millis")
        yield* navigate("/")
        yield* TestClock.adjust("10 millis")
        yield* TestClock.adjust("31 seconds")
        const before = root.frames().length
        yield* navigate("/users/1")
        // The card's watch is a zero-to-one over a stale entry.
        assert.deepStrictEqual(fetchesOf(root, "users/GetUser").map((fetch) => fetch.trigger), ["watch", "watch"])
        yield* TestClock.adjust("10 millis")
        // No "Loading" frame over a warm entry.
        assert.isFalse(root.frames().slice(before).some((frame) => frame.includes("Loading")))
        yield* TestClock.adjust("31 seconds")
        click(root, "Rename")
        yield* TestHost.settle
        assert.strictEqual(root.entry(users.GetUser, { id: "1" })?.watchers, 2)
        assert.strictEqual(fetchesOf(root, "users/GetUser").length, 2)
      })
    )
  })

  it.effect("rename on the detail page, wait for success, go back: the list never shows the old name", () => {
    const { deps } = setup("/")
    return run(
      deps,
      Effect.gen(function*() {
        const root = yield* mount
        yield* TestHost.settle
        yield* TestClock.adjust("10 millis")
        assert.include(root.text(), "Ann")
        yield* navigate("/users/1")
        yield* TestClock.adjust("10 millis")
        click(root, "Rename")
        yield* TestHost.settle
        rename(root, "Bob")
        yield* TestHost.settle
        yield* TestClock.adjust("100 millis")
        yield* TestHost.settle
        const before = root.frames().length
        yield* navigate("/")
        yield* TestClock.adjust("10 millis")
        yield* TestHost.settle
        const after = root.frames().slice(before)
        assert.isTrue(after.some((frame) => frame.includes("Bob")))
        assert.isFalse(after.some((frame) => frame.includes("Ann")))
        // The invalidated list refetched when it was watched again.
        assert.deepStrictEqual(fetchesOf(root, "users/ListUsers").map((fetch) => fetch.trigger), ["watch", "watch"])
      })
    )
  })

  it.effect("the derived draft survives a visibility refetch", () => {
    const { deps } = setup("/users/1")
    return run(
      deps,
      Effect.gen(function*() {
        const root = yield* mount
        yield* TestHost.settle
        yield* TestClock.adjust("10 millis")
        click(root, "Rename")
        yield* TestHost.settle
        Locator.fire(nameInput(root), "input", { value: "Zed" })
        yield* TestHost.settle
        yield* TestClock.adjust("31 seconds")
        yield* TestHost.setVisible(false)
        yield* TestHost.setVisible(true)
        yield* TestHost.settle
        yield* TestClock.adjust("10 millis")
        yield* TestHost.settle
        assert.deepStrictEqual(fetchesOf(root, "users/GetUser").map((fetch) => fetch.trigger), ["watch", "visibility"])
        assert.strictEqual(nameInput(root).props.value, "Zed")
      })
    )
  })

  it.effect("a save ends with its form: the running one is interrupted and the queued one never starts", () => {
    const { deps, server } = setup("/users/1")
    return run(
      deps,
      Effect.gen(function*() {
        const root = yield* mount
        yield* TestHost.settle
        yield* TestClock.adjust("10 millis")
        click(root, "Rename")
        yield* TestHost.settle
        rename(root, "B")
        rename(root, "C")
        click(root, "Close")
        yield* TestHost.settle
        assert.isUndefined(root.query(Locator.tag("form")))
        assert.deepStrictEqual(root.pending(), [])
        yield* TestClock.adjust("200 millis")
        yield* TestHost.settle
        // Neither save reached the server: the first was cut mid-request.
        assert.strictEqual(server.calls.rename, 0)
        assert.notInclude(["B", "C"], server.users.get("1")?.name)
      }),
      // The flush that removes the form runs before the first save's fiber takes a step, so the save
      // never begins. A flush after that step cuts it mid-request instead, and the user it patched is
      // fetched again.
      "queued"
    )
  })

  // What the tree did, as the facts and what followed from each, without the entries' numbers: a
  // render that ran earlier or later numbers them differently and changes nothing else.
  const timelineOf = (flush: TestHost.Flush) => {
    const { deps } = setup("/users/1")
    return run(
      deps,
      Effect.gen(function*() {
        const root = yield* mount
        yield* TestHost.settle
        yield* TestClock.adjust("10 millis")
        click(root, "Rename")
        yield* TestHost.settle
        rename(root, "B")
        yield* TestHost.settle
        yield* TestClock.adjust("100 millis")
        yield* TestHost.settle
        yield* TestClock.adjust("100 millis")
        yield* TestHost.settle
        yield* navigate("/")
        yield* TestClock.adjust("10 millis")
        yield* TestHost.settle
        const log = root.log()
        const mounted = log.filter((entry) => entry._tag === "Mounted")
        assert.isAbove(mounted.length, 3)
        for (const entry of mounted) {
          const replay = Story.fromLog(
            entry.component as Component.Component<any, any, any, any, any, any, any, any, any>,
            log,
            { path: entry.path }
          )
          assert.isUndefined(replay.divergence, entry.path)
        }
        return {
          text: root.text(),
          timeline: TestHost.formatTimeline(log).replace(/ ?\(?(after )?#\d+\)? ?/g, " ")
        }
      }),
      flush
    )
  }

  it.effect("one script replays and gives one timeline, whenever the render flush runs", () =>
    Effect.gen(function*() {
      const expected = yield* timelineOf("queued")
      assert.include(expected.timeline, "Update")
      for (const flush of ["first", "last", { seed: 1 }] as const) {
        const actual = yield* timelineOf(flush)
        assert.strictEqual(actual.text, expected.text, JSON.stringify(flush))
        assert.strictEqual(actual.timeline, expected.timeline, JSON.stringify(flush))
      }
    }))
})
