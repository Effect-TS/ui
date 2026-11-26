// @vitest-environment happy-dom
import { Component, Query } from "@effect/ui"
import { BrowserHost, Html, HtmlHydrate, HtmlServer } from "@effect/ui/html"
import { ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import {
  Context,
  Deferred,
  Effect,
  Layer,
  Schema,
  SchemaGetter,
  SchemaIssue
} from "effect"
import { AsyncResult } from "effect/reactivity"
import { collectGarbage } from "../utils/gc.ts"

let inits = { avatar: 0, profile: 0, badge: 0 }
const side = (count: number) => count === 0 ? "server" : "client"

const Avatar = Html.component({
  name: "Avatar",
  model: Schema.String,
  message: Schema.Never
}).make({
  init: () => "avatar from the " + side(inits.avatar++),
  update: ($) => $.model,
  view: (h, text) => h.i(text)
})

const Badge = Html.component({
  name: "Badge",
  model: Schema.String,
  message: Schema.Never
}).make({
  init: () => "badge from the " + side(inits.badge++),
  update: ($) => $.model,
  view: (h, text) => h.b(text)
})

const Broken = Html.component({
  name: "Broken",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (): never => {
    throw new Error("broken")
  }
})

const Pin = Html.component({
  name: "Pin",
  model: Schema.Null,
  message: Schema.Never
})
  .make({ init: () => null, update: ($) => $.model, view: (h) => h.u("pin") })

const Profile = Html.component({
  name: "Profile",
  model: Schema.String,
  message: Schema.Never
})
  .make({
    init: () => "draft from the " + side(inits.profile++),
    update: ($) => $.model,
    view: (h, draft) =>
      h.form(
        h.p(draft),
        Avatar(h, { key: "a" }),
        h.keepAlive((s) => Badge(s, { key: "b" })),
        Broken(h, { key: "x", fallback: () => h.s("down") })
      )
  })

class GetTab extends Query.Service<GetTab>()("GetTab", {
  args: {},
  success: Schema.String,
  error: Schema.Never,
  staleTime: "30 seconds"
}) {
  static readonly layer = this.toLayer(() => Effect.succeed("billing"))
}

const Settings = Html.component({
  name: "Settings",
  model: Schema.Boolean,
  message: Schema.Boolean,
  queries: { tab: { query: GetTab, args: () => ({}) } }
}).make({
  init: () => false,
  update: (_, shown) => shown,
  view: (h, shown) => {
    const billing = AsyncResult.isSuccess(h.queries.tab) &&
      h.queries.tab.value === "billing"
    return h.main(
      h.h1(billing ? "billing" : "profile"),
      h.keepAlive((s) => Pin(s, {})),
      shown || !billing ? h.keepAlive((s) => Profile(s, { key: "p" })) : null
    )
  }
}).pipe(Component.provide(GetTab.layer))

const Sketch = Html.component({
  name: "Sketch",
  model: Schema.declare((u): u is () => string => typeof u === "function"),
  message: Schema.Never
}).make({
  init: () => () => "sketch",
  update: ($) => $.model,
  view: (h, text) => h.em(text())
})

const Board = Html.component({
  name: "Board",
  model: Schema.Boolean,
  message: Schema.Boolean,
  queries: { tab: { query: GetTab, args: () => ({}) } }
}).make({
  init: () => false,
  update: (_, shown) => shown,
  view: (h, shown) =>
    h.main(
      h.keepAlive((s) => Sketch(s, { key: "drawn" })),
      shown || !AsyncResult.isSuccess(h.queries.tab)
        ? h.keepAlive((s) => Sketch(s, { key: "kept" }))
        : null
    )
}).pipe(Component.provide(GetTab.layer))

describe("keep-alive children on the server", () => {
  it.effect("writes no nodes for a kept child, and the client takes its state once it's written", () =>
    Effect.gen(function*() {
      inits = { avatar: 0, profile: 0, badge: 0 }
      const result = yield* ssr(Settings, {})
      assert.notInclude(result.html, "draft from")
      assert.deepStrictEqual(result.adopted, ["/Settings", "/Settings/Pin[]"])

      result.root.send(true)
      yield* TestHost.settle
      assert.strictEqual(
        result.container.querySelector("p")!.textContent,
        "draft from the server"
      )
      assert.strictEqual(
        result.container.querySelector("i")!.textContent,
        "avatar from the server"
      )
      assert.strictEqual(
        result.container.querySelector("b")!.textContent,
        "badge from the server"
      )
      assert.strictEqual(
        result.container.querySelector("s")!.textContent,
        "down"
      )
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("lists a child whose Model doesn't encode as deferred where it's drawn, and sends a kept one no state", () =>
    Effect.gen(function*() {
      const result = yield* ssr(Board, {})
      assert.deepStrictEqual(result.state["~deferred"], [
        "/Board/Sketch[drawn]"
      ])
      assert.deepStrictEqual(result.state["~kept"], {
        "/Board": { "/Board/Sketch[kept]": {} }
      })

      result.root.send(true)
      yield* TestHost.settle
      assert.strictEqual(result.container.textContent, "sketchsketch")
    }).pipe(Effect.provide(TestHost.layer())))
})

let leafInits = 0
let noteInits = 0
const Note = Html.component({
  name: "Note",
  model: Schema.String,
  message: Schema.Never
})
  .make({
    init: () => noteInits++ === 0 ? "server-note" : "client-note",
    update: ($) => $.model,
    view: (h, note) => h.i(note)
  })
const Leaf = Html.component({
  name: "Leaf",
  model: Schema.String,
  message: Schema.Never
})
  .make({
    init: () => leafInits++ === 0 ? "server-draft" : "client-initial",
    update: ($) => $.model,
    view: (h, draft) => h.div(h.p(draft), Note(h, { key: "n" }))
  })

const Frame = Html.component({
  name: "Frame",
  model: Schema.Null,
  message: Schema.Never,
  slots: ["body"]
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.section(h.slots.body)
})

const Page = Html.component({
  name: "Page",
  props: Schema.Struct({ where: Schema.String }),
  model: Schema.NullOr(Schema.String),
  message: Schema.String
}).make({
  init: () => null,
  update: (_, where) => where,
  view: (h, moved) => {
    const where = moved ?? h.props.where
    return h.keepAlive((s) =>
      h.main(
        where === "a"
          ? Frame(h, { key: "a", slots: { body: Leaf(s, { key: "l" }) } })
          : null,
        where === "b"
          ? Frame(h, { key: "b", slots: { body: Leaf(s, { key: "l" }) } })
          : null
      )
    )
  }
})

const hydrateAt = Effect.fnUntraced(function*(where: string) {
  leafInits = 0
  noteInits = 0
  const rendered = yield* HtmlServer.renderToHtml(Page, { where: "a" })
  const app = yield* Effect.acquireRelease(
    Effect.sync(() => {
      const element = document.body.appendChild(document.createElement("div"))
      element.innerHTML = rendered.html
      return element
    }),
    (element) => Effect.sync(() => element.remove())
  )
  const root = yield* HtmlHydrate.hydrateEffect(
    Page,
    { where },
    app,
    rendered.state
  )
  yield* root.adopted
  return { app, root }
})

describe("keep-alive children on the client after hydration", () => {
  it.effect("keep the server's Model when the client draws them somewhere new", () =>
    Effect.gen(function*() {
      const { app } = yield* hydrateAt("b")
      assert.strictEqual(app.querySelector("p")?.textContent, "server-draft")
      assert.strictEqual(app.querySelector("i")?.textContent, "server-note")
    }).pipe(Effect.scoped))

  it.effect("keep the server's Model when the client first hides them", () =>
    Effect.gen(function*() {
      const { app, root } = yield* hydrateAt("none")
      assert.strictEqual(app.querySelector("p"), null)
      root.send("a")
      yield* Effect.promise(() =>
        new Promise<void>((resolve) => setTimeout(resolve, 30))
      )
      assert.strictEqual(app.querySelector("p")?.textContent, "server-draft")
    }).pipe(Effect.scoped))
})

const tick = Effect.promise(() =>
  new Promise<void>((resolve) => setTimeout(resolve, 0))
)

class Slow extends Context.Service<Slow, string>()("test/Slow") {}
const SlowFrame = Html.component({
  name: "SlowFrame",
  model: Schema.Null,
  message: Schema.Never,
  slots: ["body"]
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.section(h.slots.body)
})
  .pipe(
    Component.provide(
      Layer.effect(Slow, Effect.as(Effect.sleep("30 millis"), "ready"))
    )
  )
const SlowPage = Html.component({
  name: "SlowPage",
  model: Schema.Null,
  message: Schema.Never
})
  .make({
    init: () => null,
    update: ($) => $.model,
    view: (h) =>
      h.keepAlive((s) =>
        h.main(
          SlowFrame(h, { key: "f", slots: { body: Leaf(s, { key: "l" }) } })
        )
      )
  })

describe("keep-alive children in a receiver that waits for its Layer", {
  concurrent: false
}, () => {
  it.live("keep the server's nodes once the receiver adopts them", () =>
    Effect.gen(function*() {
      leafInits = 0
      noteInits = 0
      const rendered = yield* HtmlServer.renderToHtml(SlowPage, {})
      const app = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const element = document.body.appendChild(
            document.createElement("div")
          )
          element.innerHTML = rendered.html
          return element
        }),
        (element) => Effect.sync(() => element.remove())
      )
      const field = app.querySelector("p")
      const root = yield* HtmlHydrate.hydrateEffect(
        SlowPage,
        {},
        app,
        rendered.state
      )
      yield* root.adopted
      assert.strictEqual(app.querySelector("p"), field)
    }).pipe(Effect.scoped))

  let gate: Effect.Effect<void> = Effect.void
  const Gated = Html.component({
    name: "Gated",
    model: Schema.Null,
    message: Schema.Never,
    slots: ["body"]
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => h.section(h.slots.body)
  })
    .pipe(
      Component.provide(Layer.effect(
        Slow,
        Effect.suspend(() => Effect.as(gate, "ready"))
      ))
    )
  const serve = Effect.fnUntraced(
    function*(page: Effect.Effect<HtmlServer.Rendered<unknown>>) {
      gate = Effect.void
      const rendered = yield* page
      const latch = yield* Deferred.make<void>()
      gate = Deferred.await(latch)
      const app = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const element = document.body.appendChild(
            document.createElement("div")
          )
          element.innerHTML = rendered.html
          return element
        }),
        (element) => Effect.sync(() => element.remove())
      )
      return {
        app,
        state: rendered.state,
        open: Deferred.succeed(latch, undefined)
      }
    }
  )

  const Field = Html.component({
    name: "Field",
    model: Schema.String,
    message: Schema.String
  }).make({
    init: () => "server",
    update: (_, text) => text,
    view: (h, text) => h.input.value(text).on("input", ({ value }) => value)
  })
  const Box = Html.component({
    name: "Box",
    model: Schema.Null,
    message: Schema.Never
  })
    .make({ init: () => null, update: ($) => $.model, parts: () => ({}) })
  const fieldPage = (
    placed:
      | "bare"
      | "in an element"
      | "by a forwarded builder"
      | "by a headless child's view"
  ) =>
    Html.component({
      name: "FieldPage",
      model: Schema.Number,
      message: Schema.Null
    })
      .make({
        init: () => 0,
        update: ($) => $.model + 1,
        view: (h) =>
          h.keepAlive((s) => {
            const field = Field(s, { key: "f" })
            const body = placed === "bare"
              ? field
              : placed === "in an element"
              ? h.div(field)
              : placed === "by a forwarded builder"
              ? h.label.forward((label) => h.div(label, field))
              : Box(h, { key: "box", view: () => h.div(field) })
            return h.main(Gated(h, { key: "f", slots: { body } }))
          })
      })

  it.effect.each(
    ["bare", "by a forwarded builder", "by a headless child's view"] as const
  )(
    "keep what the user typed into a field its author writes again, %s, while the receiver waits",
    (placed) =>
      Effect.gen(function*() {
        const Page = fieldPage(placed)
        const { app, open, state } = yield* serve(
          HtmlServer.renderToHtml(Page, {})
        )
        const field = app.querySelector("input")!
        field.value = "typed"
        const root = yield* HtmlHydrate.hydrateEffect(Page, {}, app, state)
        root.send(null)
        yield* tick
        yield* open
        yield* root.adopted
        assert.strictEqual(app.querySelector("input"), field)
        assert.strictEqual(field.value, "typed")
      }).pipe(Effect.scoped)
  )

  const Note = Html.component({
    name: "Note",
    model: Schema.String,
    message: Schema.String
  }).make({
    init: () => "server",
    update: (_, text) => text,
    view: (h, note) => h.input.value(note).on("input", ({ value }) => value)
  })
  const Bare = Html.component({
    name: "Bare",
    model: Schema.Null,
    message: Schema.Never,
    slots: ["body"]
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => h.slots.body
  })
    .pipe(
      Component.provide(Layer.effect(
        Slow,
        Effect.suspend(() => Effect.as(gate, "ready"))
      ))
    )
  const Row = Html.component({
    name: "Row",
    model: Schema.String,
    message: Schema.Never
  }).make({
    init: () => "",
    update: ($) => $.model,
    view: (h, row) => h.p(row)
  })
  let drafts = 0
  let start: "slot" | "aside" = "slot"
  const Where = Schema.Literals(["slot", "aside", "none", "ended"])
  const draft = (name: string) =>
    Html.component({
      name,
      model: Schema.String,
      message: Schema.Never
    }).make({
      init: () => side(drafts++),
      update: ($) => $.model,
      view: (h, text) => h.input.value(text)
    })
  const Draft = draft("Draft")
  const SlowDraft = draft("SlowDraft")
    .pipe(
      Component.provide(Layer.effect(
        Slow,
        Effect.suspend(() => Effect.as(gate, "ready"))
      ))
    )
  const moving = (headless: boolean) =>
    Html.component({
      name: "Moving",
      model: Where,
      message: Where
    })
      .make({
        init: () => "slot" as const,
        update: (_, where) => where,
        view: (h, where) =>
          h.keepAlive(({ model }) => model !== "ended", (s) => {
            const written = Draft(s, { key: "d" })
            const body = where === "slot" || where === "ended" ? written : null
            return h.main(
              Gated(h, {
                key: "g",
                slots: {
                  body: headless
                    ? Box(h, { key: "box", view: () => h.div(body) })
                    : body
                }
              }),
              h.aside(where === "aside" ? written : null)
            )
          })
      })
  const Moving = moving(false)
  const Restarting = Html.component({
    name: "Restarting",
    model: Where,
    message: Where
  }).make({
    init: () => start,
    update: (_, where) => where,
    view: (h, where) =>
      h.keepAlive((s) => {
        const written = SlowDraft(s, { key: "d" })
        return h.main(
          h.p(where === "slot" ? written : null),
          h.aside(where === "aside" ? written : null)
        )
      })
  })

  it.effect("take the server's Model and new nodes when moved out of the receiver while it waits", () =>
    Effect.gen(function*() {
      drafts = 0
      const { app, open, state } = yield* serve(
        HtmlServer.renderToHtml(Moving, {})
      )
      const served = app.querySelector("input")!
      const root = yield* HtmlHydrate.hydrateEffect(Moving, {}, app, state)
      root.send("aside")
      yield* tick
      const moved = app.querySelector<HTMLInputElement>("aside input")!
      assert.notStrictEqual(moved, served)
      assert.strictEqual(moved.value, "server")
      yield* open
      yield* root.adopted
      assert.deepStrictEqual(Array.from(app.querySelectorAll("input")), [moved])
    }).pipe(Effect.scoped))

  it.effect("keep the nodes they got outside the receiver when moved back in before it resumes", () =>
    Effect.gen(function*() {
      drafts = 0
      const { app, open, state } = yield* serve(
        HtmlServer.renderToHtml(Moving, {})
      )
      const root = yield* HtmlHydrate.hydrateEffect(Moving, {}, app, state)
      root.send("aside")
      yield* tick
      const moved = app.querySelector<HTMLInputElement>("aside input")!
      root.send("slot")
      yield* tick
      yield* open
      yield* root.adopted
      assert.deepStrictEqual(Array.from(app.querySelectorAll("input")), [moved])
      assert.strictEqual(app.querySelector("aside input"), null)
      assert.strictEqual(moved.value, "server")
    }).pipe(Effect.scoped))

  it.effect.each([["none", "server"], ["ended", "client"]] as const)(
    "left out of the slot as the receiver resumes (%s), start as the %s's when written again",
    ([left, expected]) =>
      Effect.gen(function*() {
        drafts = 0
        const { app, open, state } = yield* serve(
          HtmlServer.renderToHtml(Moving, {})
        )
        const root = yield* HtmlHydrate.hydrateEffect(Moving, {}, app, state)
        root.send(left)
        yield* tick
        yield* open
        yield* root.adopted
        assert.strictEqual(app.querySelector("input"), null)
        root.send("aside")
        yield* tick
        assert.strictEqual(
          app.querySelector<HTMLInputElement>("aside input")!.value,
          expected
        )
      }).pipe(Effect.scoped)
  )

  it.effect.each([["slot", "aside"], ["slot", "slot"]] as const)(
    "that wait for their own Layer in the %s keep the server's Model when next placed in the %s",
    ([from, to]) =>
      Effect.gen(function*() {
        drafts = 0
        start = from
        const { app, open, state } = yield* serve(
          HtmlServer.renderToHtml(Restarting, {})
        )
        const served = app.querySelector("input")!
        const root = yield* HtmlHydrate.hydrateEffect(
          Restarting,
          {},
          app,
          state
        )
        root.send(to)
        yield* tick
        yield* open
        yield* root.adopted
        const placed = app.querySelector<HTMLInputElement>(
          to === "slot" ? "p input" : "aside input"
        )!
        assert.deepStrictEqual(Array.from(app.querySelectorAll("input")), [
          placed
        ])
        assert.strictEqual(placed === served, from === to)
        assert.strictEqual(placed.value, "server")
      }).pipe(Effect.scoped)
  )

  it.effect("keep what the user typed, when the one drawn before them leaves the slot", () =>
    Effect.gen(function*() {
      const Mixed = Html.component({
        name: "Mixed",
        model: Schema.Boolean,
        message: Schema.Boolean
      }).make({
        init: () => false,
        update: (_, moved) => moved,
        view: (h, moved) =>
          h.keepAlive((s) => {
            const row = Row(s, { key: "r" })
            return h.main(
              Bare(h, {
                key: "g",
                slots: { body: [moved ? null : row, Note(s, {})] }
              }),
              moved ? h.article(row) : null
            )
          })
      })
      const { app, open, state } = yield* serve(
        HtmlServer.renderToHtml(Mixed, {})
      )
      const field = app.querySelector("input")!
      field.value = "typed"
      const root = yield* HtmlHydrate.hydrateEffect(Mixed, {}, app, state)
      root.send(true)
      yield* tick
      yield* open
      yield* root.adopted
      assert.strictEqual(app.querySelector("input"), field)
      assert.strictEqual(field.value, "typed")
    }).pipe(Effect.scoped))

  it.effect("leave the one field drawn after them, which takes an edit once, when moved out of the slot", () =>
    Effect.gen(function*() {
      const Lead = Html.component({
        name: "Lead",
        props: Schema.Struct({ moved: Schema.Boolean }),
        model: Schema.String,
        message: Schema.String
      }).make({
        init: () => "",
        update: ($, typed) => $.model + typed,
        view: (h, text) =>
          h.keepAlive((s) => {
            const row = Row(s, { key: "r" })
            return h.main(
              Bare(h, {
                key: "g",
                slots: { body: h.props.moved ? null : row }
              }),
              h.article(
                h.props.moved ? row : null,
                h.input.value(text).on("input", ({ value }) => value)
              ),
              h.em(text)
            )
          })
      })
      const { app, open, state } = yield* serve(
        HtmlServer.renderToHtml(Lead, { moved: false })
      )
      const field = app.querySelector("input")!
      const root = yield* HtmlHydrate.hydrateEffect(
        Lead,
        { moved: true },
        app,
        state
      )
      yield* open
      yield* root.adopted
      field.value = "typed"
      field.dispatchEvent(new Event("input", { bubbles: true }))
      yield* tick
      assert.deepStrictEqual(Array.from(app.querySelectorAll("input")), [field])
      assert.strictEqual(app.querySelector("em")!.textContent, "typed")
    }).pipe(Effect.scoped))

  const Item = Html.component({
    name: "Item",
    props: Schema.Struct({ n: Schema.Number }),
    model: Schema.Null,
    message: Schema.Never
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => h.b(String(h.props.n))
  })

  it.effect("keep the server's nodes of a receiver they draw, when taken out of the document and drawn again while it waits", () =>
    Effect.gen(function*() {
      const Card = Html.component({
        name: "Card",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          Bare(h, { key: "g", slots: { body: [h.p("a"), h.p("b")] } })
      })
      const Cards = Html.component({
        name: "Cards",
        model: Schema.Boolean,
        message: Schema.Boolean
      }).make({
        init: () => true,
        update: (_, shown) => shown,
        view: (h, shown) =>
          h.keepAlive((s) => {
            const card = Card(s, { key: "c" })
            return h.main(shown ? card : null)
          })
      })
      const { app, open, state } = yield* serve(
        HtmlServer.renderToHtml(Cards, {})
      )
      const served = Array.from(app.querySelectorAll("p"))
      const root = yield* HtmlHydrate.hydrateEffect(Cards, {}, app, state)
      root.send(false)
      yield* tick
      assert.strictEqual(app.querySelector("p"), null)
      root.send(true)
      yield* tick
      yield* open
      yield* root.adopted
      assert.deepStrictEqual(Array.from(app.querySelectorAll("p")), served)
    }).pipe(Effect.scoped))

  it.effect.skipIf(
    process.versions.bun !== undefined || process.versions.deno !== undefined
  )(
    "release a receiver that adopted them and was removed, while another still waits",
    () =>
      Effect.gen(function*() {
        let stuck = false
        const Stuck = Html.component({
          name: "Stuck",
          model: Schema.Null,
          message: Schema.Never
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.aside("stuck")
        })
          .pipe(
            Component.provide(Layer.effect(
              Slow,
              Effect.suspend(() =>
                stuck ? Effect.never : Effect.succeed("ready")
              )
            ))
          )
        let passed: Array<WeakRef<object>> = []
        const Page = Html.component({
          name: "Page",
          model: Schema.Boolean,
          message: Schema.Boolean
        }).make({
          init: () => true,
          update: (_, shown) => shown,
          view: (h, shown) =>
            h.keepAlive((s) => {
              const slots = { body: Item(s, { key: "i", props: { n: 0 } }) }
              passed.push(new WeakRef(slots))
              return h.main(
                shown ? Gated(h, { key: "a", slots }) : null,
                Stuck(h, { key: "b" })
              )
            })
        })
        const { app, open, state } = yield* serve(
          HtmlServer.renderToHtml(Page, {})
        )
        stuck = true
        passed = []
        const root = yield* HtmlHydrate.hydrateEffect(Page, {}, app, state)
        yield* open
        yield* tick
        assert.strictEqual(app.querySelector("section")?.textContent, "0")
        root.send(false)
        yield* tick
        yield* collectGarbage
        assert.isUndefined(passed[0].deref())
      }).pipe(Effect.scoped)
  )

  it.effect(
    "let adoption finish when their receiver is removed as they wait for their own Layer in the slot of a keep-alive child there",
    () =>
      Effect.gen(function*() {
        const Waits = Html.component({
          name: "Waits",
          model: Schema.Null,
          message: Schema.Never
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.b("waits")
        })
          .pipe(Component.provide(Layer.effect(
            Slow,
            Effect.suspend(() => Effect.as(gate, "ready"))
          )))
        const Shell = Html.component({
          name: "Shell",
          model: Schema.Null,
          message: Schema.Never,
          slots: ["inner"]
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.div(h.slots.inner)
        })
        const Page = Html.component({
          name: "Page",
          model: Schema.Boolean,
          message: Schema.Boolean
        }).make({
          init: () => true,
          update: (_, shown) => shown,
          view: (h, shown) => {
            const body = h.keepAlive((s) =>
              Shell(s, { key: "s", slots: { inner: Waits(s, { key: "w" }) } })
            )
            return h.main(
              shown ? Frame(h, { key: "f", slots: { body } }) : null
            )
          }
        })
        const { app, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
        const root = yield* HtmlHydrate.hydrateEffect(Page, {}, app, state)
        let adopted = false
        yield* Effect.forkChild(
          Effect.andThen(root.adopted, Effect.sync(() => adopted = true))
        )
        root.send(false)
        yield* tick
        assert.isTrue(adopted)
      }).pipe(Effect.scoped)
  )

  it.effect(
    "keep the server's nodes under the predicate their author last wrote them with, when the receiver resumes",
    () =>
      Effect.gen(function*() {
        const Page = Html.component({
          name: "Page",
          model: Schema.Boolean,
          message: Schema.Boolean
        }).make({
          init: () => false,
          update: (_, changed) => changed,
          view: (h, changed) => {
            const body = h.keepAlive(
              changed ? ({ model }) => model : ({ model }) => !model,
              (s) => Leaf(s, { key: "l" })
            )
            return h.main(Gated(h, { key: "f", slots: { body } }))
          }
        })
        leafInits = 0
        noteInits = 0
        const { app, open, state } = yield* serve(
          HtmlServer.renderToHtml(Page, {})
        )
        const drawn = app.querySelector("p")
        const root = yield* HtmlHydrate.hydrateEffect(Page, {}, app, state)
        root.send(true)
        yield* tick
        yield* open
        yield* root.adopted
        yield* tick
        assert.strictEqual(app.querySelector("p"), drawn)
        assert.strictEqual(drawn?.textContent, "server-draft")
      }).pipe(Effect.scoped)
  )

  it.effect.each(
    [
      [
        "a child of theirs whose state decodes late",
        "server",
        "at once",
        "late"
      ],
      [
        "a child of theirs whose state fails to decode late",
        "client",
        "at once",
        "never"
      ],
      [
        "them when their own state fails to decode late",
        "client",
        "never",
        "at once"
      ]
    ] as const
  )(
    "start what's below %s from the %s",
    ([_, from, card, mid]) =>
      Effect.gen(function*() {
        const decoding = yield* Deferred.make<void>()
        const stored = (decodes: "at once" | "late" | "never") =>
          Schema.String.pipe(Schema.decode({
            decode: SchemaGetter.transformEffect((text: string) =>
              decodes === "at once" ? Effect.succeed(text) : Effect.andThen(
                Deferred.await(decoding),
                decodes === "late"
                  ? Effect.succeed(text)
                  : Effect.fail(
                    new SchemaIssue.InvalidValue({ message: "an older Model" })
                  )
              )
            ),
            encode: SchemaGetter.passthrough()
          }))
        let tips = 0
        let dots = 0
        const Tip = Html.component({
          name: "Tip",
          model: Schema.String,
          message: Schema.Never
        }).make({
          init: () => side(tips++),
          update: ($) => $.model,
          view: (h, tip) => h.i(tip)
        })
        const Dot = Html.component({
          name: "Dot",
          model: Schema.String,
          message: Schema.Never
        }).make({
          init: () => side(dots++),
          update: ($) => $.model,
          view: (h, dot) => h.u(dot)
        })
        const Mid = Html.component({
          name: "Mid",
          model: stored(mid),
          message: Schema.Never
        }).make({
          init: () => "mid",
          update: ($) => $.model,
          view: (h) =>
            h.div(
              Tip(h, { key: "t" }),
              h.keepAlive((s) => Dot(s, { key: "d" }))
            )
        })
        const Card = Html.component({
          name: "Card",
          model: stored(card),
          message: Schema.Never
        }).make({
          init: () => "card",
          update: ($) => $.model,
          view: (h) => h.article(Mid(h, { key: "m" }))
        })
        const Page = Html.component({
          name: "Page",
          model: Schema.Number,
          message: Schema.Number
        }).make({
          init: () => 0,
          update: (_, step) => step,
          view: (h, step) =>
            h.main(
              step === 0
                ? Gated(h, {
                  key: "f",
                  slots: { body: h.keepAlive((s) => Card(s, { key: "c" })) }
                })
                : step === 2
                ? h.keepAlive((s) => Card(s, { key: "c" }))
                : null
            )
        })
        const { app, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
        const root = yield* HtmlHydrate.hydrateEffect(Page, {}, app, state)
        root.send(1)
        yield* tick
        root.send(2)
        yield* tick
        yield* Deferred.succeed(decoding, undefined)
        yield* tick
        assert.deepStrictEqual(
          ["i", "u"].map((tag) => app.querySelector(tag)?.textContent),
          [from, from]
        )
      }).pipe(Effect.scoped)
  )

  it.effect("stop decoding their state when they're no longer written as it decodes", () =>
    Effect.gen(function*() {
      let decoding = 0
      const Slowly = Html.component({
        name: "Slowly",
        model: Schema.String.pipe(Schema.decode({
          decode: SchemaGetter.transformEffect((text: string) =>
            Effect.acquireUseRelease(
              Effect.sync(() => decoding++),
              () => Effect.as(Effect.never, text),
              () => Effect.sync(() => decoding--)
            )
          ),
          encode: SchemaGetter.passthrough()
        })),
        message: Schema.Never
      }).make({
        init: () => "slowly",
        update: ($) => $.model,
        view: (h, text) => h.b(text)
      })
      const Page = Html.component({
        name: "Page",
        model: Schema.Boolean,
        message: Schema.Boolean
      }).make({
        init: () => true,
        update: (_, shown) => shown,
        view: (h, shown) =>
          h.main(shown ? h.keepAlive((s) => Slowly(s, { key: "s" })) : null)
      })
      const { app, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
      const root = yield* HtmlHydrate.hydrateEffect(Page, {}, app, state)
      yield* tick
      assert.strictEqual(decoding, 1)
      root.send(false)
      yield* tick
      assert.strictEqual(decoding, 0)
    }).pipe(Effect.scoped))

  it.effect.skipIf(
    process.versions.bun !== undefined || process.versions.deno !== undefined
  )(
    "leave with an author removed before it drew them, while another component waits: one made at its key starts them afresh",
    () =>
      Effect.gen(function*() {
        let passed: Array<WeakRef<object>> = []
        const Author = Html.component({
          name: "Author",
          props: Schema.Struct({ drawn: Schema.Boolean }),
          model: Schema.Null,
          message: Schema.Never
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => {
            passed.push(new WeakRef(h.props))
            return h.article(
              h.props.drawn ? h.keepAlive((s) => Leaf(s, { key: "l" })) : null
            )
          }
        })
        const Page = Html.component({
          name: "Page",
          props: Schema.Struct({ drawn: Schema.Boolean }),
          model: Schema.Number,
          message: Schema.Number
        }).make({
          init: () => 0,
          update: (_, step) => step,
          view: (h, step) =>
            h.main(
              step === 1
                ? null
                : Author(h, {
                  key: "a",
                  props: { drawn: step === 2 || h.props.drawn }
                }),
              Gated(h, { key: "g", slots: { body: h.i() } })
            )
        })
        leafInits = 0
        noteInits = 0
        const { app, state } = yield* serve(
          HtmlServer.renderToHtml(Page, { drawn: true })
        )
        passed = []
        const root = yield* HtmlHydrate.hydrateEffect(
          Page,
          { drawn: false },
          app,
          state
        )
        root.send(1)
        yield* tick
        yield* collectGarbage
        assert.isUndefined(passed[0].deref())
        root.send(2)
        yield* tick
        assert.strictEqual(
          app.querySelector("p")?.textContent,
          "client-initial"
        )
      }).pipe(Effect.scoped)
  )

  const labels: Array<string> = []
  const decoded: Array<string> = []
  const Labelled = Html.component({
    name: "Labelled",
    props: Schema.Struct({ label: Schema.String }),
    model: Schema.String.pipe(Schema.decode({
      decode: SchemaGetter.transform((label: string) => {
        decoded.push(label)
        return label
      }),
      encode: SchemaGetter.passthrough()
    })),
    message: Schema.Never
  }).make({
    init: ($) => {
      labels.push($.props.label)
      return $.props.label
    },
    update: ($) => $.model,
    view: (h, label) => h.b(label)
  })

  it.effect.each(
    [
      ["props", true, ["new l"], ["old l"], ["old l"]],
      ["key", true, ["new m"], ["new m"], []],
      ["order", false, ["new m", "new l"], ["new m", "new l"], []]
    ] as const
  )(
    "start with the %s their author last wrote them with, when the receiver resumes (drawn by the server: %s)",
    ([last, drawn, started, shown, read]) =>
      Effect.gen(function*() {
        const Page = Html.component({
          name: "Page",
          model: Schema.Boolean,
          message: Schema.Boolean
        }).make({
          init: () => false,
          update: (_, changed) => changed,
          view: (h, changed) => {
            const keys = last === "order"
              ? changed ? ["m", "l"] : ["l", "m"]
              : [changed && last === "key" ? "m" : "l"]
            const body = h.keepAlive(
              ({ model }) => model || drawn,
              (s) =>
                keys.map((key) =>
                  Labelled(s, {
                    key,
                    props: { label: (changed ? "new " : "old ") + key }
                  })
                )
            )
            return h.main(Gated(h, { key: "f", slots: { body } }))
          }
        })
        const { app, open, state } = yield* serve(
          HtmlServer.renderToHtml(Page, {})
        )
        labels.length = decoded.length = 0
        const root = yield* HtmlHydrate.hydrateEffect(Page, {}, app, state)
        root.send(true)
        yield* tick
        yield* open
        yield* root.adopted
        yield* tick
        assert.deepStrictEqual(
          [
            labels,
            Array.from(app.querySelectorAll("b"), (label) => label.textContent),
            decoded
          ],
          [started, shown, read]
        )
      }).pipe(Effect.scoped)
  )

  it.effect.each(
    ["a headless child's view", "a slot nobody places"] as const
  )(
    "don't start when their author last wrote them out of %s, as the receiver resumes",
    (out) =>
      Effect.gen(function*() {
        const Two = Html.component({
          name: "Two",
          props: Schema.Struct({ open: Schema.Boolean }),
          model: Schema.Null,
          message: Schema.Never,
          slots: ["body", "unplaced"]
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.section(h.props.open ? h.slots.body : null)
        })
          .pipe(Component.provide(Layer.effect(
            Slow,
            Effect.suspend(() => Effect.as(gate, "ready"))
          )))
        const Page = Html.component({
          name: "Page",
          model: Schema.Boolean,
          message: Schema.Boolean
        }).make({
          init: () => false,
          update: (_, moved) => moved,
          view: (h, moved) => {
            const written = h.keepAlive((s) =>
              Labelled(s, { key: "l", props: { label: "drawn" } })
            )
            const body = out === "a headless child's view"
              ? Box(h, {
                key: "box",
                view: () => h.div(moved ? null : written)
              })
              : moved
              ? null
              : written
            const unplaced = moved && out === "a slot nobody places"
              ? written
              : null
            return h.main(
              Two(h, {
                key: "f",
                props: { open: true },
                slots: { body, unplaced }
              })
            )
          }
        })
        const { app, open, state } = yield* serve(
          HtmlServer.renderToHtml(Page, {})
        )
        labels.length = decoded.length = 0
        const root = yield* HtmlHydrate.hydrateEffect(Page, {}, app, state)
        root.send(true)
        yield* tick
        yield* open
        yield* root.adopted
        yield* tick
        assert.deepStrictEqual([labels, decoded, app.querySelector("b")], [
          [],
          [],
          null
        ])
      }).pipe(Effect.scoped)
  )

  const Sides = Html.component({
    name: "Sides",
    props: Schema.Struct({ shows: Schema.Array(Schema.Literals(["a", "b"])) }),
    model: Schema.Null,
    message: Schema.Never,
    slots: ["a", "b"]
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => h.section(h.props.shows.map((slot) => h.slots[slot]))
  })
    .pipe(
      Component.provide(Layer.effect(
        Slow,
        Effect.suspend(() => Effect.as(gate, "ready"))
      ))
    )

  it.effect.each(
    [
      ["neither slot", ["a"], [], ["y"], []],
      ["a slot that holds one more", ["a"], ["a"], ["x", "y"], ["x", "y"]],
      ["its slots the other way around", ["a", "b"], ["b", "a"], ["x"], [
        "z",
        "x"
      ]]
    ] as const
  )(
    "start in the order drawn, and only where placed, when the receiver resumes placing %s",
    ([_, before, after, left, started]) =>
      Effect.gen(function*() {
        const Page = Html.component({
          name: "Page",
          model: Schema.Boolean,
          message: Schema.Boolean
        }).make({
          init: () => false,
          update: (_, changed) => changed,
          view: (h, changed) => {
            const fields = (keys: ReadonlyArray<string>) =>
              h.keepAlive(({ model }) => model, (s) =>
                keys.map((key) =>
                  Labelled(s, { key, props: { label: key } })
                ))
            const slots = {
              a: fields(changed ? left : ["x"]),
              b: fields(["z"])
            }
            return h.main(
              Sides(h, {
                key: "f",
                props: { shows: changed ? after : before },
                slots
              })
            )
          }
        })
        const { app, open, state } = yield* serve(
          HtmlServer.renderToHtml(Page, {})
        )
        labels.length = 0
        const root = yield* HtmlHydrate.hydrateEffect(Page, {}, app, state)
        root.send(true)
        yield* tick
        yield* open
        yield* root.adopted
        yield* tick
        assert.deepStrictEqual(
          [
            labels,
            Array.from(app.querySelectorAll("b"), (label) => label.textContent)
          ],
          [started, started]
        )
      }).pipe(Effect.scoped)
  )

  it.effect("keep the server's Model when first written out of a slot the receiver resumes without", () =>
    Effect.gen(function*() {
      const Page = Html.component({
        name: "Page",
        props: Schema.Struct({ first: Schema.String }),
        model: Schema.Number,
        message: Schema.Number
      }).make({
        init: () => 0,
        update: (_, step) => step,
        view: (h, step) => {
          const a = h.keepAlive(
            ({ model }) => model !== 1,
            (s) =>
              Labelled(s, {
                key: step === 0 ? h.props.first : "l",
                props: { label: side(step) }
              })
          )
          return h.main(
            Sides(h, {
              key: "f",
              props: { shows: step === 1 ? [] : ["a"] },
              slots: { a, b: null }
            })
          )
        }
      })
      const { app, open, state } = yield* serve(
        HtmlServer.renderToHtml(Page, { first: "l" })
      )
      const root = yield* HtmlHydrate.hydrateEffect(
        Page,
        { first: "other" },
        app,
        state
      )
      root.send(1)
      yield* tick
      yield* open
      yield* root.adopted
      root.send(2)
      yield* tick
      assert.strictEqual(app.querySelector("b")?.textContent, "server")
    }).pipe(Effect.scoped))

  it.effect("are built where the client last drew them, when their state decodes after the receiver resumes", () =>
    Effect.gen(function*() {
      const decoding = yield* Deferred.make<void>()
      let inits = 0
      const Late = Html.component({
        name: "Late",
        model: Schema.String.pipe(Schema.decode({
          decode: SchemaGetter.transformEffect((text: string) =>
            Effect.as(Deferred.await(decoding), text)
          ),
          encode: SchemaGetter.passthrough()
        })),
        message: Schema.Never
      }).make({
        init: () => side(inits++),
        update: ($) => $.model,
        view: (h, text) => h.b(text)
      })
      const Page = Html.component({
        name: "Page",
        props: Schema.Struct({ compact: Schema.Boolean }),
        model: Schema.Boolean,
        message: Schema.Boolean
      }).make({
        init: () => false,
        update: (_, drawn) => drawn,
        view: (h) => {
          const field = h.keepAlive((s) => Late(s, { key: "l" }))
          return h.main(
            Gated(h, {
              key: "f",
              slots: { body: h.props.compact ? h.nav(field) : h.header(field) }
            })
          )
        }
      })
      const { app, open, state } = yield* serve(
        HtmlServer.renderToHtml(Page, { compact: false })
      )
      const root = yield* HtmlHydrate.hydrateEffect(
        Page,
        { compact: true },
        app,
        state
      )
      root.send(true)
      yield* tick
      yield* open
      yield* tick
      yield* Deferred.succeed(decoding, undefined)
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("nav b")?.textContent, "server")
    }).pipe(Effect.scoped))

  it.effect(
    "don't start when the receiver resumes after a render that wasn't their author's and the predicate is false",
    () =>
      Effect.gen(function*() {
        const Middle = Html.component({
          name: "Middle",
          model: Schema.Number,
          message: Schema.Null,
          slots: ["passed"]
        }).make({
          init: () => 0,
          update: ($) => $.model + 1,
          view: (h) =>
            h.div(
              h.button.on("click", null).children("again"),
              Gated(h, { key: "f", slots: { body: h.slots.passed } })
            )
        })
        const Page = Html.component({
          name: "Page",
          props: Schema.Struct({ allowed: Schema.Boolean }),
          model: Schema.Null,
          message: Schema.Never
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) =>
            h.main(
              Middle(h, {
                key: "m",
                slots: {
                  passed: h.keepAlive(
                    ({ props }) => props.allowed,
                    (s) => Leaf(s, { key: "l" })
                  )
                }
              })
            )
        })
        leafInits = 0
        noteInits = 0
        const { app, open, state } = yield* serve(
          HtmlServer.renderToHtml(Page, { allowed: true })
        )
        const root = yield* HtmlHydrate.hydrateEffect(
          Page,
          { allowed: false },
          app,
          state
        )
        app.querySelector("button")!.click()
        yield* tick
        yield* open
        yield* root.adopted
        yield* tick
        assert.strictEqual(app.querySelector("p"), null)
      }).pipe(Effect.scoped)
  )

  it.effect.each(
    [["Author", "client-initial"], ["Outer", "server-draft"]] as const
  )(
    "start from what's left of their state when one made at its key replaces %s, removed as it waited for its Layer",
    ([removed, draft]) =>
      Effect.gen(function*() {
        const slow = Component.provide(
          Layer.effect(Slow, Effect.suspend(() => Effect.as(gate, "ready")))
        )
        const Author = Html.component({
          name: "Author",
          model: Schema.Null,
          message: Schema.Never
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.article(h.keepAlive((s) => Leaf(s, { key: "l" })))
        }).pipe(slow)
        const Outer = Html.component({
          name: "Outer",
          model: Schema.Null,
          message: Schema.Never
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.article(h.keepAlive((s) => Leaf(s, { key: "l" })))
        }).pipe(slow)
        const Page = Html.component({
          name: "Page",
          model: Schema.Number,
          message: Schema.Number
        }).make({
          init: () => 0,
          update: (_, step) => step,
          view: (h, step) =>
            h.main(
              removed === "Outer"
                ? Frame(h, {
                  key: "at" + step,
                  slots: { body: h.keepAlive((s) => Outer(s, { key: "o" })) }
                })
                : step === 1
                ? null
                : Author(h, { key: "a" }),
              Gated(h, { key: "g", slots: { body: h.i() } })
            )
        })
        leafInits = 0
        noteInits = 0
        const { app, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
        const root = yield* HtmlHydrate.hydrateEffect(Page, {}, app, state)
        root.send(1)
        yield* tick
        root.send(2)
        yield* tick
        assert.strictEqual(app.querySelector("p")?.textContent, draft)
      }).pipe(Effect.scoped)
  )

  it.effect(
    "adopt a preloaded lazy child and restore its saved Model once the receiver resumes",
    () =>
      Effect.gen(function*() {
        const Card = Html.component({
          name: "Card",
          model: Schema.Date,
          message: Schema.Never
        }).make({
          init: () => new Date(0),
          update: ($) => $.model,
          view: (h, at) => h.b(String(at.getTime()))
        })
        const LazyCard = Component.lazy("LazyCard", () => Promise.resolve(Card))
        const Page = Html.component({
          name: "Page",
          model: Schema.Null,
          message: Schema.Never
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) =>
            h.main(
              Gated(h, {
                key: "f",
                slots: { body: h.keepAlive((s) => LazyCard(s, { key: "c" })) }
              })
            )
        })
        yield* Effect.promise(() => LazyCard.preload())
        const { app, open, state } = yield* serve(
          HtmlServer.renderToHtml(Page, {})
        )
        const served = app.querySelector("b")!
        const root = yield* HtmlHydrate.hydrateEffect(Page, {}, app, {
          ...state,
          "/Page/LazyCard[c]": "1970-01-01T00:00:01.000Z"
        })
        yield* open
        yield* root.adopted
        assert.strictEqual(app.querySelector("b"), served)
        assert.strictEqual(served.textContent, "1000")
      }).pipe(Effect.scoped)
  )
})

describe("keep-alive children of a headless child", () => {
  it.effect.skipIf(
    process.versions.bun !== undefined || process.versions.deno !== undefined
  )(
    "a kept one doesn't keep alive the closure's nodes once the headless child is removed",
    () =>
      Effect.gen(function*() {
        const Editor = Html.component({
          name: "Editor",
          model: Schema.Null,
          message: Schema.Never
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.p("editor")
        })
        const Pane = Html.component({
          name: "Pane",
          model: Schema.Null,
          message: Schema.Never
        }).make({ init: () => null, update: ($) => $.model, parts: () => ({}) })
        const Page = Html.component({
          name: "Page",
          model: Schema.Boolean,
          message: Schema.Boolean
        }).make({
          init: () => true,
          update: (_, shown) => shown,
          view: (h, shown) =>
            h.keepAlive((s) =>
              h.main(
                shown
                  ? Pane(h, {
                    key: "p",
                    view: () => h.div(h.button("pane"), Editor(s, { key: "e" }))
                  })
                  : null
              )
            )
        })
        const app = yield* Effect.acquireRelease(
          Effect.sync(() =>
            document.body.appendChild(document.createElement("div"))
          ),
          (element) => Effect.sync(() => element.remove())
        )
        const root = yield* BrowserHost.mountEffect(Page, {}, app)
        yield* tick
        const button = new WeakRef(app.querySelector("button")!)
        root.send(false)
        yield* tick
        yield* collectGarbage
        assert.isUndefined(button.deref())
      }).pipe(Effect.scoped)
  )

  it.effect.skipIf(
    process.versions.bun !== undefined || process.versions.deno !== undefined
  )(
    "a waiting receiver doesn't keep alive the writes its author replaced",
    () =>
      Effect.gen(function*() {
        let stuck = false
        let made: Array<WeakRef<object>> = []
        const Stuck = Html.component({
          name: "Stuck",
          model: Schema.Null,
          message: Schema.Never,
          slots: ["body"]
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.section(h.slots.body)
        })
          .pipe(
            Component.provide(Layer.effect(
              Slow,
              Effect.suspend(() =>
                stuck ? Effect.never : Effect.succeed("ready")
              )
            ))
          )
        const Item = Html.component({
          name: "Item",
          props: Schema.Struct({ n: Schema.Number }),
          model: Schema.Null,
          message: Schema.Never
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.b(String(h.props.n))
        })
        const Rows = Html.component({
          name: "Rows",
          model: Schema.Number,
          message: Schema.Null
        }).make({
          init: () => 0,
          update: ($) => $.model + 1,
          view: (h, n) => {
            const props = { n }
            made.push(new WeakRef(props))
            return h.keepAlive((s) =>
              h.main(
                Stuck(h, {
                  key: "f",
                  slots: { body: Item(s, { key: "i", props }) }
                })
              )
            )
          }
        })
        const rendered = yield* HtmlServer.renderToHtml(Rows, {})
        stuck = true
        made = []
        const app = yield* Effect.acquireRelease(
          Effect.sync(() => {
            const element = document.body.appendChild(
              document.createElement("div")
            )
            element.innerHTML = rendered.html
            return element
          }),
          (element) => Effect.sync(() => element.remove())
        )
        const root = yield* HtmlHydrate.hydrateEffect(
          Rows,
          {},
          app,
          rendered.state
        )
        for (let i = 0; i < 6; i++) {
          root.send(null)
          yield* tick
        }
        yield* collectGarbage
        assert.deepStrictEqual(made.slice(1, -1).map((ref) => ref.deref()), [
          undefined,
          undefined,
          undefined,
          undefined,
          undefined
        ])
      }).pipe(Effect.scoped)
  )
})

let lateGate: Effect.Effect<void> = Effect.void
let lateServing = true
const Late = Schema.String.pipe(Schema.decode({
  decode: SchemaGetter.transformEffect((text: string) =>
    Effect.as(Effect.suspend(() => lateGate), text)
  ),
  encode: SchemaGetter.passthrough()
}))
const LateDraft = Html.component({
  name: "LateDraft",
  model: Late,
  message: Schema.String
}).make({
  init: () => lateServing ? "server" : "client",
  update: (_, text) => text,
  view: (h, text) => h.input.value(text).on("input", ({ value }) => value)
})
const LateKeeper = Html.component({
  name: "LateKeeper",
  model: Schema.Number,
  message: Schema.Literal("bump")
}).make({
  init: () => 0,
  update: ($) => $.model + 1,
  view: (h, count) =>
    h.div(
      h.button.on("click", "bump").children(String(count)),
      h.keepAlive((s) => LateDraft(s, { key: "d" }))
    )
})

describe("keep-alive children whose state decodes asynchronously", () => {
  it.effect("take the server's Model and nodes after their author renders again as they decode", () =>
    Effect.gen(function*() {
      lateServing = true
      const { html, state } = yield* HtmlServer.renderToHtml(LateKeeper, {})
      lateServing = false
      const latch = yield* Deferred.make<void>()
      lateGate = Deferred.await(latch)
      const app = document.body.appendChild(document.createElement("div"))
      yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
      app.innerHTML = html
      const served = app.querySelector("input")
      yield* HtmlHydrate.hydrateEffect(LateKeeper, {}, app, state)
      yield* tick
      app.querySelector("button")!.click()
      yield* tick
      yield* Deferred.succeed(latch, undefined)
      yield* tick
      assert.strictEqual(app.querySelector("button")!.textContent, "1")
      assert.deepStrictEqual(
        Array.from(app.querySelectorAll("input"), (field) => field.value),
        ["server"]
      )
      assert.strictEqual(app.querySelector("input"), served)
    }).pipe(Effect.scoped))
})
