// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Html, HtmlHydrate, HtmlServer } from "@effect/ui/html"
import { HtmlLocator, ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

/** Lets the render flush and Commands run. */
const tick = Effect.promise(() =>
  new Promise<void>((resolve) => setTimeout(resolve, 30))
)

const container = Effect.acquireRelease(
  Effect.sync(() => document.body.appendChild(document.createElement("div"))),
  (element) => Effect.sync(() => element.remove())
)

const CounterMsg = UiSchema.TaggedEnum({ Add: {} })
const Counter = Html.component({
  name: "Counter",
  model: Schema.Number,
  message: CounterMsg,
  events: UiSchema.TaggedEnum({ Added: { count: Schema.Number } })
}).make({
  init: () => 0,
  update: ($) => $.set($.model + 1).emit({ _tag: "Added", count: $.model + 1 }),
  view: (h, n) => h.button.on("click", CounterMsg.Add()).children("add " + n)
})

const Card = Html.component({
  name: "Card",
  model: Schema.Null,
  message: Schema.Never,
  slots: ["title", "body", "aside"]
}).make({
  init: () => null,
  update: ($) => $.model,
  // Text either side of the title, and an aside its parent leaves empty.
  view: (h) =>
    h.article(
      h.h2("[", h.slots.title, "]"),
      h.slots.body,
      h.aside(h.slots.aside)
    )
})

const where = { server: true }
const PageMsg = UiSchema.TaggedEnum({ Added: { count: Schema.Number } })
const Page = Html.component({
  name: "Page",
  model: Schema.Number,
  message: PageMsg
}).make({
  init: () => 0,
  update: (_, msg) => msg.count,
  view: (h, n) =>
    h.main(
      Card(h, {
        key: "c",
        slots: {
          title: "note",
          body: [
            h.p(where.server ? "from the server" : "from the client"),
            Counter(h, {
              key: "n",
              onEmit: (event) => PageMsg.Added({ count: event.count })
            })
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
      assert.strictEqual(
        result.container.querySelector("h2")!.textContent,
        "[note]"
      )
      assert.strictEqual(
        result.container.querySelector("aside")!.childNodes.length,
        1
      )
      assert.strictEqual(
        result.container.querySelector("aside")!.textContent,
        ""
      )
      // Live: the content's child reports to the parent that wrote it.
      HtmlLocator.click(result.container.querySelector("button")!)
      yield* TestHost.settle
      assert.strictEqual(
        result.container.querySelector("output")!.textContent,
        "added 1"
      )
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("adopts a slotted child's shipped state instead of re-initializing it", () =>
    Effect.gen(function*() {
      where.server = true
      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      const app = yield* container
      app.innerHTML = rendered.html.replace("add 0", "add 4")
      const button = app.querySelector("button")!
      const label = button.firstChild

      const root = yield* HtmlHydrate.hydrateEffect(Page, {}, app, {
        ...rendered.state,
        "/Page/Card[c]/[body]/Counter[n]": 4
      })
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("button"), button)
      assert.strictEqual(button.firstChild, label)
      assert.strictEqual(button.textContent, "add 4")
      assert.notInclude(app.innerHTML, "<!--")
      button.click()
      yield* tick
      assert.strictEqual(button.textContent, "add 5")
      assert.strictEqual(app.querySelector("output")!.textContent, "added 5")
    }).pipe(Effect.scoped))

  it.effect("builds content fresh when it doesn't match the server's, and adopts the rest", () =>
    Effect.gen(function*() {
      where.server = true
      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      where.server = false
      const app = yield* container
      app.innerHTML = rendered.html
      const article = app.querySelector("article")!
      const title = app.querySelector("h2")!

      const root = yield* HtmlHydrate.hydrateEffect(
        Page,
        {},
        app,
        rendered.state
      )
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
      const Flip = Html.component({
        name: "Flip",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          Card(h, {
            key: "c",
            slots: { body: h.p(renders++ === 0 ? "server" : "client") }
          })
      })
      const error = yield* Effect.flip(ssr(Flip, {}))
      assert.include(
        String(error),
        "/Flip/Card[c]/[body]: the client rebuilt the server's nodes instead of adopting them"
      )
    }).pipe(Effect.provide(TestHost.layer())))
})
