// @vitest-environment happy-dom
import { Component, Feature, UiSchema } from "@effect/ui"
import { Html, HtmlServer } from "@effect/ui/html"
import * as HtmlHydrate from "@effect/ui/html/HtmlHydrate"
import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Layer, Option, Schema } from "effect"

const tick = Effect.promise(() =>
  new Promise<void>((resolve) => setTimeout(resolve, 0))
)

const container = (html: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const app = document.createElement("div")
      app.innerHTML = html
      document.body.appendChild(app)
      return app
    }),
    (app) => Effect.sync(() => app.remove())
  )

const comments = (node: Node): number => {
  const walker = document.createTreeWalker(node, 128)
  let count = 0
  while (walker.nextNode() !== null) count++
  return count
}

const Bumped = UiSchema.TaggedEnum({ Bumped: {} })

const Counter = Component.define({
  name: "Counter",
  props: Schema.Struct({ label: Schema.String }),
  model: Schema.Number,
  message: Bumped,
  elements: Html
}).make({
  init: () => 0,
  update: ($) => $.model + 1,
  view: (h, count) =>
    h.div(
      h.button.onClick(Bumped.Bumped()).children(h.props.label),
      h.span(String(count))
    )
})

const RowMessage = UiSchema.TaggedEnum({ Clicked: {} })
const Row = Component.define({
  name: "Row",
  props: Schema.Struct({ label: Schema.String }),
  model: Schema.Number,
  message: RowMessage,
  elements: Html
}).make({
  init: () => 0,
  update: ($) => $.model + 1,
  view: (h, clicks) =>
    h.li(
      h.button.onClick(RowMessage.Clicked()).children(h.props.label),
      h.span(`${clicks} clicked`),
      h.em(`row ${h.props.label}`)
    )
})

const List = Component.define({
  name: "List",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.div(
      h.h1("rows"),
      h.ul(...["A", "B", "C"].map((label) =>
        Row(h, { key: label, props: { label } })
      )),
      "tail ",
      "text"
    )
})

const Card = Component.define({
  name: "Card",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html,
  slots: ["body"]
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.section(h.b("["), h.slots.body, h.b("]"))
})

const Page = Component.define({
  name: "Page",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.div(
      Card(h, {
        key: "c",
        slots: {
          body: [h.p("before"), Row(h, { key: "s", props: { label: "S" } })]
        }
      })
    )
})

const sameElements = (app: Element, server: ReadonlyArray<Element>) => {
  const now = [...app.querySelectorAll("*")]
  assert.strictEqual(now.length, server.length)
  now.forEach((node, index) =>
    assert.strictEqual(
      node,
      server[index],
      `element ${index}, ${node.outerHTML}`
    )
  )
}

const texts = (app: Element, selector: string) =>
  [...app.querySelectorAll(selector)].map((node) => node.textContent)

describe("HtmlHydrate", () => {
  it.effect("reuses the server's nodes, starts from the shipped Model and handles events", () =>
    Effect.gen(function*() {
      const rendered = yield* HtmlServer.renderToHtml(Counter, { label: "add" })
      const app = yield* container(rendered.html)
      const state = { ...rendered.state, "/Counter": 5 }
      const server = [...app.querySelectorAll("*")]
      const root = yield* HtmlHydrate.hydrateEffect(
        Counter,
        { label: "add" },
        app,
        state as any
      )
      sameElements(app, server)
      assert.strictEqual(app.querySelector("span")!.textContent, "5")
      assert.strictEqual(root.model(), 5)
      assert.strictEqual(comments(app), 0)
      app.querySelector("button")!.click()
      yield* tick
      assert.strictEqual(app.querySelector("span")!.textContent, "6")
      assert.strictEqual(app.querySelector("span"), server[2])
    }).pipe(Effect.scoped))

  it.effect("keyed children start from their own shipped Models", () =>
    Effect.gen(function*() {
      const rendered = yield* HtmlServer.renderToHtml(List, {})
      assert.includeMembers(Object.keys(rendered.state), [
        "/List",
        "/List/Row[A]",
        "/List/Row[B]",
        "/List/Row[C]"
      ])
      const app = yield* container(rendered.html)
      const server = [...app.querySelectorAll("*")]
      const state = { ...rendered.state, "/List/Row[B]": 7, "/List/Row[C]": 2 }
      yield* HtmlHydrate.hydrateEffect(List, {}, app, state)
      sameElements(app, server)
      assert.deepStrictEqual(texts(app, "span"), [
        "0 clicked",
        "7 clicked",
        "2 clicked"
      ])
      assert.strictEqual(
        app.firstElementChild!.lastChild!.textContent,
        "tail text"
      )
      assert.strictEqual(comments(app), 0)
      for (const button of app.querySelectorAll("button")) button.click()
      yield* tick
      assert.deepStrictEqual(texts(app, "span"), [
        "1 clicked",
        "8 clicked",
        "3 clicked"
      ])
      sameElements(app, server)
    }).pipe(Effect.scoped))

  it.effect("finds a slot's content under the slot's path", () =>
    Effect.gen(function*() {
      const rendered = yield* HtmlServer.renderToHtml(Page, {})
      const path = "/Page/Card[c]/[body]/Row[s]"
      assert.include(Object.keys(rendered.state), path)
      const app = yield* container(rendered.html)
      const server = [...app.querySelectorAll("*")]
      yield* HtmlHydrate.hydrateEffect(Page, {}, app, {
        ...rendered.state,
        [path]: 4
      })
      sameElements(app, server)
      assert.strictEqual(app.textContent, "[beforeS4 clickedrow S]")
      app.querySelector("button")!.click()
      yield* tick
      assert.strictEqual(app.querySelector("span")!.textContent, "5 clicked")
    }).pipe(Effect.scoped))

  it.effect("adopts the fallback the server showed for a child that failed to start", () =>
    Effect.gen(function*() {
      const Boom = Component.define({
        name: "Boom",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      })
        .make({
          init: () => {
            throw new Error("boom")
          },
          update: ($) => $.model,
          view: (h) => h.p("never")
        })
      const Holder = Component.define({
        name: "Holder",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.div(
            Boom(h, { key: "b", fallback: () => h.span("boom fallback") }),
            h.i("after")
          )
      })
      const rendered = yield* HtmlServer.renderToHtml(Holder, {})
      const app = yield* container(rendered.html)
      const server = [...app.querySelectorAll("*")]
      assert.deepStrictEqual(server.map((node) => node.localName), [
        "div",
        "span",
        "i"
      ])
      yield* HtmlHydrate.hydrateEffect(Holder, {}, app, rendered.state)
      sameElements(app, server)
      assert.strictEqual(app.textContent, "boom fallbackafter")
    }).pipe(Effect.scoped))

  it.effect("shows the fallback the server shipped for a Layer-backed child until the Layer is ready here", () =>
    Effect.gen(function*() {
      class Panel extends Feature.Service<Panel>()("Panel", {
        props: Schema.Struct({}),
        events: Schema.Never
      }) {}
      const PanelLive = Component.define({
        name: "PanelLive",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.p("panel")
      })
      const gate = yield* Deferred.make<void>()
      const Shell = Component.provide(
        Component.define({
          name: "Shell",
          model: Schema.Number,
          message: Bumped,
          elements: Html
        }).make({
          init: () => 0,
          update: ($) => $.model + 1,
          view: (h, count) =>
            h.div(
              h.button.onClick(Bumped.Bumped()).children(String(count)),
              Panel.render(h, {
                key: "p",
                props: {},
                fallback: () => h.p("loading")
              }),
              h.i("after")
            )
        }),
        Layer.merge(
          Panel.toLayer(PanelLive),
          Layer.effectDiscard(Deferred.await(gate))
        ),
        { server: false }
      )
      const rendered = yield* HtmlServer.renderToHtml(Shell, {})
      assert.include(rendered.html, "<p>loading</p>")
      assert.deepStrictEqual(rendered.state["~deferred"], ["/Shell"])
      const app = yield* container(rendered.html)
      const server = [...app.querySelectorAll("*")]
      yield* HtmlHydrate.hydrateEffect(Shell, {}, app, rendered.state)
      sameElements(app, server)
      assert.strictEqual(app.textContent, "0loadingafter")
      yield* Deferred.succeed(gate, undefined)
      yield* tick
      assert.strictEqual(app.textContent, "0panelafter")
      const [div, button, loading, after] = server as Array<HTMLElement>
      assert.notStrictEqual(app.querySelector("p"), loading)
      assert.deepStrictEqual(
        [...app.querySelectorAll("*")].filter((node) => node.localName !== "p"),
        [
          div,
          button,
          after
        ]
      )
      button!.click()
      yield* tick
      assert.strictEqual(app.textContent, "1panelafter")
    }).pipe(Effect.scoped))

  it.effect("decodes the shipped Model through the component's Schema", () =>
    Effect.gen(function*() {
      const Picked = Component.define({
        name: "Picked",
        model: Schema.Struct({
          pick: Schema.Option(Schema.String),
          at: Schema.Date
        }),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({ pick: Option.some("server"), at: new Date(0) }),
        update: ($) => $.model,
        view: (h, model) =>
          h.p(
            Option.getOrElse(model.pick, () => "none"),
            " ",
            String(model.at.getTime())
          )
      })
      const rendered = yield* HtmlServer.renderToHtml(Picked, {})
      const encoded = rendered.state["/Picked"] as {
        pick: unknown
        at: unknown
      }
      assert.strictEqual(typeof encoded.at, "string")
      const app = yield* container(rendered.html)
      const server = [...app.querySelectorAll("*")]
      const root = yield* HtmlHydrate.hydrateEffect(
        Picked,
        {},
        app,
        rendered.state
      )
      sameElements(app, server)
      const model = root.model()!
      assert.isTrue(Option.isOption(model.pick))
      assert.isTrue(model.at instanceof Date)
      assert.strictEqual(app.textContent, "server 0")
    }).pipe(Effect.scoped))

  describe("where the server's nodes don't match", () => {
    const hydrateList = Effect.fnUntraced(
      function*(tamper: (html: string) => string) {
        const rendered = yield* HtmlServer.renderToHtml(List, {})
        const html = tamper(rendered.html)
        assert.notStrictEqual(html, rendered.html)
        const app = yield* container(html)
        const server = {
          items: [...app.querySelectorAll("li")],
          all: [...app.querySelectorAll("*")]
        }
        yield* HtmlHydrate.hydrateEffect(List, {}, app, {
          ...rendered.state,
          "/List/Row[A]": 1,
          "/List/Row[C]": 3
        })
        assert.deepStrictEqual(texts(app, "li"), [
          "A1 clickedrow A",
          "B0 clickedrow B",
          "C3 clickedrow C"
        ])
        assert.strictEqual(app.querySelectorAll("hr").length, 0)
        assert.strictEqual(comments(app), 0)
        const clicked = Effect.gen(function*() {
          for (const button of app.querySelectorAll("button")) button.click()
          yield* tick
          assert.deepStrictEqual(texts(app, "span"), [
            "2 clicked",
            "1 clicked",
            "4 clicked"
          ])
        })
        return { app, server, clicked }
      }
    )

    it.effect("corrects a text in place", () =>
      Effect.gen(function*() {
        const { app, clicked, server } = yield* hydrateList((html) =>
          html.replace("row C", "stale")
        )
        sameElements(app, server.all)
        yield* clicked
      }).pipe(Effect.scoped))

    it.effect("keeps the rows before a node the view doesn't render, and builds the rest", () =>
      Effect.gen(function*() {
        const { app, clicked, server } = yield* hydrateList((html) =>
          html.replace("<li><button>C", "<hr>$&")
        )
        const items = [...app.querySelectorAll("li")]
        assert.strictEqual(items[0], server.items[0])
        assert.strictEqual(items[1], server.items[1])
        assert.notStrictEqual(items[2], server.items[2])
        assert.isFalse(server.items[2]!.isConnected)
        yield* clicked
      }).pipe(Effect.scoped))

    it.effect("drops a node after the last the view renders", () =>
      Effect.gen(function*() {
        const { app, clicked, server } = yield* hydrateList((html) =>
          html.replace("</ul>", "<hr>$&")
        )
        assert.deepStrictEqual([...app.querySelectorAll("li")], server.items)
        yield* clicked
      }).pipe(Effect.scoped))

    it.effect("keeps the nodes before a mismatch inside a row, and the rows after it", () =>
      Effect.gen(function*() {
        const { app, clicked, server } = yield* hydrateList((html) =>
          html.replace("<em>row B</em>", "<i>row B</i>")
        )
        const all = [...app.querySelectorAll("*")]
        const em = server.all.findIndex((node) => node.localName === "i")
        assert.strictEqual(all.length, server.all.length)
        all.forEach((node, index) =>
          index === em
            ? assert.notStrictEqual(node, server.all[index])
            : assert.strictEqual(node, server.all[index])
        )
        yield* clicked
      }).pipe(Effect.scoped))

    it.effect("builds the rest of a row anew after a mismatch", () =>
      Effect.gen(function*() {
        const { app, clicked, server } = yield* hydrateList((html) =>
          html.replace("<span>0 clicked</span><em>row B", "<i>x</i><em>row B")
        )
        const [, b] = [...app.querySelectorAll("li")]
        assert.strictEqual(b, server.items[1])
        assert.strictEqual(
          b!.firstElementChild,
          server.items[1]!.firstElementChild
        )
        const was = server.all.find((node) =>
          server.items[1]!.contains(node) && node.localName === "em"
        )
        assert.notStrictEqual(b!.querySelector("em"), was)
        yield* clicked
      }).pipe(Effect.scoped))

    it.effect("rebuilds nothing outside a range whose nodes don't match", () =>
      Effect.gen(function*() {
        const Texty = Component.define({
          name: "Texty",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        })
          .make({
            init: () => null,
            update: ($) => $.model,
            view: (h) => h.text("hello")
          })
        const Holder = Component.define({
          name: "Holder",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) =>
            h.div(h.b("before"), Texty(h, { key: "t" }), h.i("after"))
        })
        const rendered = yield* HtmlServer.renderToHtml(Holder, {})
        assert.include(
          rendered.html,
          "<!--[/Holder/Texty[t]-->hello<!--]/Holder/Texty[t]-->"
        )
        const app = yield* container(
          rendered.html.replace("hello", "<s>stale</s>")
        )
        const server = [...app.querySelectorAll("*")]
        yield* HtmlHydrate.hydrateEffect(Holder, {}, app, rendered.state)
        assert.strictEqual(
          app.innerHTML,
          "<div><b>before</b>hello<i>after</i></div>"
        )
        sameElements(app, server.filter((node) => node.localName !== "s"))
      }).pipe(Effect.scoped))
  })
})
