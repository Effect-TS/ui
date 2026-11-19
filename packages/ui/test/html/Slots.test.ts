// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlServer } from "@effect/ui/html"
import { HtmlLocator, ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

/** Lets the render flush and Commands run. */
const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))

const container = Effect.acquireRelease(
  Effect.sync(() => document.body.appendChild(document.createElement("div"))),
  (element) => Effect.sync(() => element.remove())
)

const CounterMsg = UiSchema.TaggedEnum({ Add: {} })
const Counter = Component.define({
  name: "Counter",
  model: Schema.Number,
  message: CounterMsg,
  events: UiSchema.TaggedEnum({ Added: { count: Schema.Number } }),
  elements: Html
}).make({
  init: () => 0,
  update: (n, _, $) => $.set(n + 1).emit({ _tag: "Added", count: n + 1 }),
  view: (n, h) => h.button.onClick(CounterMsg.Add()).children("add " + n)
})

const Card = Component.define({
  name: "Card",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html,
  slots: ["title", "body", "aside"]
}).make({
  init: () => null,
  update: (model) => model,
  // Text either side of the title, and an aside its parent leaves empty.
  view: (_, h) => h.article(h.h2("[", h.slots.title, "]"), h.slots.body, h.aside(h.slots.aside))
})

const where = { server: true }
const PageMsg = UiSchema.TaggedEnum({ Added: { count: Schema.Number } })
const Page = Component.define({
  name: "Page",
  model: Schema.Number,
  message: PageMsg,
  elements: Html
}).make({
  init: () => 0,
  update: (_, msg) => msg.count,
  view: (n, h) =>
    h.main(
      Card(h, {
        key: "c",
        slots: {
          title: "note",
          body: [
            h.p(where.server ? "from the server" : "from the client"),
            Counter(h, { key: "n", onEmit: (event) => PageMsg.Added({ count: event.count }) })
          ]
        }
      }),
      h.output("added " + n)
    )
})

describe("slots on the server", () => {
  it.effect("writes a marker pair per outlet, and the client adopts the content", () =>
    Effect.gen(function*() {
      where.server = true
      // ssr() fails if the client rebuilds a node the server rendered outside a deferred instance.
      const result = yield* ssr(Page, {})
      for (const slot of ["title", "body", "aside"]) {
        assert.include(result.html, `<!--[/Page/Card[c]/[${slot}]-->`)
        assert.include(result.html, `<!--]/Page/Card[c]/[${slot}]-->`)
      }
      assert.include(result.adopted, "/Page/Card[c]")
      assert.include(result.adopted, "/Page/Card[c]/[body]/Counter[n]")
      assert.strictEqual(result.container.querySelector("h2")!.textContent, "[note]")
      assert.strictEqual(result.container.querySelector("aside")!.childNodes.length, 1)
      assert.strictEqual(result.container.querySelector("aside")!.textContent, "")
      // Live: the content's child reports to the parent that wrote it.
      HtmlLocator.click(result.container.querySelector("button")!)
      yield* TestHost.settle
      assert.strictEqual(result.container.querySelector("output")!.textContent, "added 1")
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("builds content fresh when it doesn't match the server's, and adopts the rest", () =>
    Effect.gen(function*() {
      where.server = true
      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      where.server = false
      const app = yield* container
      app.innerHTML = rendered.html
      const article = app.querySelector("article")!
      const title = app.querySelector("h2")!

      const root = yield* BrowserHost.mountEffect(Page, {}, app, { state: rendered.state })
      yield* root.adopted
      yield* tick
      // Card and the slots that match keep the server's nodes; the body shows the client's content.
      assert.strictEqual(app.querySelector("article"), article)
      assert.strictEqual(app.querySelector("h2"), title)
      assert.strictEqual(app.querySelector("p")!.textContent, "from the client")
      assert.strictEqual(app.querySelectorAll("p").length, 1)
      assert.notInclude(app.innerHTML, "<!--")
    }).pipe(Effect.scoped))

  it.effect("ssr() names the slot whose content the client rebuilt", () =>
    Effect.gen(function*() {
      // The view reads `where` on each side: the server's render, then the client's.
      let renders = 0
      const Flip = Component.define({ name: "Flip", model: Schema.Null, message: Schema.Never, elements: Html }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => Card(h, { key: "c", slots: { body: h.p(renders++ === 0 ? "server" : "client") } })
      })
      const error = yield* Effect.flip(ssr(Flip, {}))
      assert.include(
        String(error),
        "/Flip/Card[c]/[body]: the client rebuilt the server's nodes instead of adopting them"
      )
    }).pipe(Effect.provide(TestHost.layer())))
})
