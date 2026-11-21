// @vitest-environment happy-dom
import { Component, Query, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlServer } from "@effect/ui/html"
import { ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { collectGarbage } from "../utils/gc.ts"

let inits = { avatar: 0, profile: 0, badge: 0 }
const side = (count: number) => count === 0 ? "server" : "client"

const Avatar = Component.define({
  name: "Avatar",
  scoped: false,
  model: Schema.String,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => "avatar from the " + side(inits.avatar++),
  update: (model) => model,
  view: (text, h) => h.i(text)
})

const Badge = Component.define({
  name: "Badge",
  scoped: true,
  model: Schema.String,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => "badge from the " + side(inits.badge++),
  update: (model) => model,
  view: (text, h) => h.b(text)
})

const Profile = Component.define({
  name: "Profile",
  scoped: true,
  model: Schema.String,
  message: Schema.Never,
  elements: Html
})
  .make({
    init: () => "draft from the " + side(inits.profile++),
    update: (model) => model,
    view: (draft, h) => h.form(h.p(draft), Avatar(h, { key: "a" }), h.scoped((s) => Badge(s, { key: "b" })))
  })

class GetTab extends Query.Service<GetTab>()("GetTab", {
  args: {},
  success: Schema.String,
  error: Schema.Never,
  staleTime: "30 seconds"
}, Effect.succeed(() => Effect.succeed("billing"))) {}

const Settings = Component.define({
  name: "Settings",
  scoped: false,
  model: Schema.Boolean,
  message: Schema.Boolean,
  elements: Html,
  queries: { tab: { query: GetTab, args: () => ({}) } }
}).make({
  init: () => false,
  update: (_, shown) => shown,
  view: (shown, h) => {
    const billing = AsyncResult.isSuccess(h.queries.tab) && h.queries.tab.value === "billing"
    return h.main(
      h.h1(billing ? "billing" : "profile"),
      shown || !billing ? h.scoped((s) => Profile(s, { key: "p" })) : null
    )
  }
}).pipe(Component.provide(GetTab.layer))

describe("scoped children on the server", () => {
  it.effect("writes no nodes for a kept child, and the client takes its state once it's written", () =>
    Effect.gen(function*() {
      inits = { avatar: 0, profile: 0, badge: 0 }
      const result = yield* ssr(Settings, {})
      assert.notInclude(result.html, "draft from")
      assert.deepStrictEqual(result.adopted, ["/Settings"])

      result.root.send(true)
      yield* TestHost.settle
      assert.strictEqual(result.container.querySelector("p")!.textContent, "draft from the server")
      assert.strictEqual(result.container.querySelector("i")!.textContent, "avatar from the server")
      assert.strictEqual(result.container.querySelector("b")!.textContent, "badge from the server")
    }).pipe(Effect.provide(TestHost.layer())))
})

let leafInits = 0
let noteInits = 0
const Note = Component.define({
  name: "Note",
  scoped: false,
  model: Schema.String,
  message: Schema.Never,
  elements: Html
})
  .make({
    init: () => noteInits++ === 0 ? "server-note" : "client-note",
    update: (model) => model,
    view: (note, h) => h.i(note)
  })
const Leaf = Component.define({
  name: "Leaf",
  scoped: true,
  model: Schema.String,
  message: Schema.Never,
  elements: Html
})
  .make({
    init: () => leafInits++ === 0 ? "server-draft" : "client-initial",
    update: (model) => model,
    view: (draft, h) => h.div(h.p(draft), Note(h, { key: "n" }))
  })

const Frame = Component.define({
  name: "Frame",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html,
  slots: ["body"]
}).make({ init: () => null, update: (model) => model, view: (_, h) => h.section(h.slots.body) })

const Page = Component.define({
  name: "Page",
  scoped: false,
  props: Schema.Struct({ where: Schema.String }),
  model: Schema.NullOr(Schema.String),
  message: Schema.String,
  elements: Html
}).make({
  init: () => null,
  update: (_, where) => where,
  view: (moved, h) => {
    const where = moved ?? h.props.where
    return h.scoped((s) =>
      h.main(
        where === "a" ? Frame(h, { key: "a", slots: { body: Leaf(s, { key: "l" }) } }) : null,
        where === "b" ? Frame(h, { key: "b", slots: { body: Leaf(s, { key: "l" }) } }) : null
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
  const root = yield* BrowserHost.mountEffect(Page, { where }, app, { state: rendered.state })
  yield* root.adopted
  return { app, root }
})

describe("scoped children on the client after hydration", () => {
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
      yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))
      assert.strictEqual(app.querySelector("p")?.textContent, "server-draft")
    }).pipe(Effect.scoped))
})

const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

class Slow extends Context.Service<Slow, string>()("test/Slow") {}
const SlowFrame = Component.define({
  name: "SlowFrame",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html,
  slots: ["body"]
}).make({ init: () => null, update: (model) => model, view: (_, h) => h.section(h.slots.body) })
  .pipe(Component.provide(Layer.effect(Slow, Effect.as(Effect.sleep("30 millis"), "ready"))))
const SlowPage = Component.define({
  name: "SlowPage",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
})
  .make({
    init: () => null,
    update: (model) => model,
    view: (_, h) => h.scoped((s) => h.main(SlowFrame(h, { key: "f", slots: { body: Leaf(s, { key: "l" }) } })))
  })

describe("scoped children in a receiver that waits for its Layer", () => {
  it.live("start at once when moved out of the receiver while it waits", () =>
    Effect.gen(function*() {
      let inits = 0
      const DraftMsg = UiSchema.TaggedEnum({ Bump: {} })
      const Draft = Component.define({
        name: "Draft",
        scoped: true,
        model: Schema.String,
        message: DraftMsg,
        receives: ["Bump"],
        elements: Html
      }).make({
        init: () => inits++ === 0 ? "server draft" : "client draft",
        update: (draft) => draft + "!",
        view: (draft, h) => h.p(draft)
      })
      const DraftRef = Draft.ref("d")
      const Gate = Component.define({
        name: "Gate",
        scoped: false,
        props: Schema.Struct({ open: Schema.Boolean }),
        model: Schema.Null,
        message: Schema.Never,
        elements: Html,
        slots: ["body"]
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.article(h.props.open ? h.slots.body : null)
      })
      const GatePage = Component.define({
        name: "GatePage",
        scoped: false,
        model: Schema.Literals(["framed", "moved", "open"]),
        message: Schema.Literals(["move", "bump", "open"]),
        elements: Html
      }).make({
        init: () => "framed" as const,
        update: (_, message, $) =>
          message === "bump" ? $.send(DraftRef, DraftMsg.Bump()) : message === "move" ? "moved" : "open",
        view: (state, h) =>
          h.scoped((s) =>
            h.main(
              SlowFrame(h, {
                key: "f",
                slots: { body: state === "framed" ? Draft(s, { ref: DraftRef }) : h.i("slow") }
              }),
              Gate(h, {
                key: "g",
                props: { open: state === "open" },
                slots: { body: state === "framed" ? null : Draft(s, { ref: DraftRef }) }
              })
            )
          )
      })
      const rendered = yield* HtmlServer.renderToHtml(GatePage, {})
      const app = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const element = document.body.appendChild(document.createElement("div"))
          element.innerHTML = rendered.html
          return element
        }),
        (element) => Effect.sync(() => element.remove())
      )
      const root = yield* BrowserHost.mountEffect(GatePage, {}, app, { state: rendered.state })
      root.send("move")
      root.send("bump")
      yield* root.adopted
      root.send("open")
      yield* Effect.sleep("30 millis")
      assert.strictEqual(app.querySelector("p")?.textContent, "server draft!")
    }).pipe(Effect.scoped))

  it.live("keep the server's nodes once the receiver adopts them", () =>
    Effect.gen(function*() {
      leafInits = 0
      noteInits = 0
      const rendered = yield* HtmlServer.renderToHtml(SlowPage, {})
      const app = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const element = document.body.appendChild(document.createElement("div"))
          element.innerHTML = rendered.html
          return element
        }),
        (element) => Effect.sync(() => element.remove())
      )
      const field = app.querySelector("p")
      const root = yield* BrowserHost.mountEffect(SlowPage, {}, app, { state: rendered.state })
      yield* root.adopted
      assert.strictEqual(app.querySelector("p"), field)
    }).pipe(Effect.scoped))

  // The frame's Layer builds once the gate opens. The server renders with it open.
  let gate: Effect.Effect<void> = Effect.void
  const Gated = Component.define({
    name: "Gated",
    scoped: false,
    model: Schema.Null,
    message: Schema.Never,
    elements: Html,
    slots: ["body"]
  }).make({ init: () => null, update: (model) => model, view: (_, h) => h.section(h.slots.body) })
    .pipe(Component.provide(Layer.effect(Slow, Effect.suspend(() => Effect.as(gate, "ready")))))
  const serve = Effect.fnUntraced(function*(page: Effect.Effect<HtmlServer.Rendered<unknown>>) {
    gate = Effect.void
    const rendered = yield* page
    const latch = yield* Deferred.make<void>()
    gate = Deferred.await(latch)
    const app = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const element = document.body.appendChild(document.createElement("div"))
        element.innerHTML = rendered.html
        return element
      }),
      (element) => Effect.sync(() => element.remove())
    )
    return { app, state: rendered.state, open: Deferred.succeed(latch, undefined) }
  })

  const Field = Component.define({
    name: "Field",
    scoped: true,
    model: Schema.Null,
    message: Schema.Never,
    elements: Html
  }).make({ init: () => null, update: (model) => model, view: (_, h) => h.input.value("server") })
  const fieldPage = (wrapped: boolean) =>
    Component.define({ name: "FieldPage", scoped: false, model: Schema.Number, message: Schema.Null, elements: Html })
      .make({
        init: () => 0,
        update: (renders) => renders + 1,
        view: (_, h) =>
          h.scoped((s) => {
            const field = Field(s, { key: "f" })
            return h.main(Gated(h, { key: "f", slots: { body: wrapped ? h.div(field) : field } }))
          })
      })

  it.effect("keep what the user typed into a field the slot wraps in an element", () =>
    Effect.gen(function*() {
      const Page = fieldPage(true)
      const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
      const field = app.querySelector("input")!
      field.value = "typed"
      const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
      yield* open
      yield* root.adopted
      assert.strictEqual(app.querySelector("input"), field)
      assert.strictEqual(field.value, "typed")
    }).pipe(Effect.scoped))

  it.effect("keep what the user typed into a field its author writes again while the receiver waits", () =>
    Effect.gen(function*() {
      const Page = fieldPage(false)
      const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
      const field = app.querySelector("input")!
      field.value = "typed"
      const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
      root.send(null)
      yield* tick
      yield* open
      yield* root.adopted
      assert.strictEqual(app.querySelector("input"), field)
      assert.strictEqual(field.value, "typed")
    }).pipe(Effect.scoped))

  const moving = () => {
    let inits = 0
    const DraftMsg = UiSchema.TaggedEnum({ Bump: {} })
    const Draft = Component.define({
      name: "Draft",
      scoped: true,
      model: Schema.String,
      message: DraftMsg,
      receives: ["Bump"],
      elements: Html
    }).make({
      init: () => inits++ === 0 ? "server draft" : "client draft",
      update: (draft) => draft + "!",
      view: (draft, h) => h.p(draft)
    })
    const DraftRef = Draft.ref("d")
    return Component.define({
      name: "MovingPage",
      scoped: false,
      model: Schema.Literals(["a", "b", "ended", "omitted"]),
      message: Schema.Literals(["a", "b", "ended", "omitted", "bump"]),
      elements: Html
    }).make({
      init: () => "a" as const,
      update: (_, message, $) => message === "bump" ? $.send(DraftRef, DraftMsg.Bump()) : message,
      view: (state, h) =>
        h.scoped(({ model }) => model === "a" || model === "b", (s) =>
          h.main(
            Gated(h, {
              key: "a",
              slots: { body: state === "a" || state === "ended" ? Draft(s, { ref: DraftRef }) : null }
            }),
            Gated(h, { key: "b", slots: { body: state === "b" ? Draft(s, { ref: DraftRef }) : null } })
          ))
    })
  }

  it.effect("start at once when moved to another receiver that waits, which has none of their nodes", () =>
    Effect.gen(function*() {
      const Page = moving()
      const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
      const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
      root.send("b")
      root.send("bump")
      yield* tick
      yield* open
      yield* root.adopted
      assert.strictEqual(app.querySelector("p")?.textContent, "server draft!")
    }).pipe(Effect.scoped))

  it.effect.each(["ended", "omitted"] as const)(
    "start fresh once their predicate ended them while the receiver waited, %s",
    (how) =>
      Effect.gen(function*() {
        const Page = moving()
        const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
        const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
        root.send(how)
        yield* tick
        root.send("a")
        yield* tick
        yield* open
        yield* root.adopted
        assert.strictEqual(app.querySelector("p")?.textContent, "client draft")
      }).pipe(Effect.scoped)
  )

  const Item = Component.define({
    name: "Item",
    scoped: true,
    props: Schema.Struct({ n: Schema.Number }),
    model: Schema.Null,
    message: Schema.Never,
    elements: Html
  }).make({ init: () => null, update: (model) => model, view: (_, h) => h.b(String(h.props.n)) })

  it.effect.skipIf(process.versions.bun !== undefined || process.versions.deno !== undefined)(
    "release the last write of one their predicate ended while the receiver waits",
    () =>
      Effect.gen(function*() {
        let made: Array<WeakRef<object>> = []
        const Rows = Component.define({
          name: "Rows",
          scoped: false,
          model: Schema.Number,
          message: Schema.Null,
          elements: Html
        }).make({
          init: () => 0,
          update: (n) => n + 1,
          view: (n, h) => {
            const props = { n }
            made.push(new WeakRef(props))
            return h.scoped(({ model }) => model < 3, (s) =>
              h.main(Gated(h, { key: "f", slots: { body: n < 3 ? Item(s, { key: "i", props }) : null } })))
          }
        })
        const { app, state } = yield* serve(HtmlServer.renderToHtml(Rows, {}))
        made = []
        const root = yield* BrowserHost.mountEffect(Rows, {}, app, { state })
        for (let i = 0; i < 3; i++) {
          root.send(null)
          yield* tick
        }
        yield* collectGarbage
        assert.deepStrictEqual(
          made.slice(1).map((ref) =>
            ref.deref()
          ),
          [undefined, undefined, undefined]
        )
      }).pipe(Effect.scoped)
  )

  it.effect("are read from the slot as often each, however many it holds", () =>
    Effect.gen(function*() {
      const readsOf = Effect.fnUntraced(function*(rows: number) {
        let reads = 0
        const Rows = Component.define({
          name: "Rows",
          scoped: false,
          model: Schema.Number,
          message: Schema.Null,
          elements: Html
        }).make({
          init: () => 0,
          update: (n) => n + 1,
          view: (n, h) =>
            h.scoped(({ model }) => model >= 0, (s) => {
              const items = Array.from({ length: rows }, (_, key) => Item(s, { key: String(key), props: { n } }))
              const body = new Proxy(items, {
                get: (target, key, receiver) => {
                  if (typeof key === "string" && key !== "length") reads++
                  return Reflect.get(target, key, receiver)
                }
              })
              return h.main(Gated(h, { key: "f", slots: { body } }))
            })
        })
        const { app, state } = yield* serve(HtmlServer.renderToHtml(Rows, {}))
        const root = yield* BrowserHost.mountEffect(Rows, {}, app, { state })
        reads = 0
        root.send(null)
        yield* tick
        return reads / rows
      })
      assert.strictEqual(yield* readsOf(200), yield* readsOf(50))
    }).pipe(Effect.scoped))
})

describe("scoped children of a headless child", () => {
  it.effect.skipIf(process.versions.bun !== undefined || process.versions.deno !== undefined)(
    "a kept one doesn't keep alive the closure's nodes once the headless child is removed",
    () =>
      Effect.gen(function*() {
        const Editor = Component.define({
          name: "Editor",
          scoped: true,
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({ init: () => null, update: (model) => model, view: (_, h) => h.p("editor") })
        const Pane = Component.define({
          name: "Pane",
          scoped: false,
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({ init: () => null, update: (model) => model, parts: () => ({}) })
        const Page = Component.define({
          name: "Page",
          scoped: false,
          model: Schema.Boolean,
          message: Schema.Boolean,
          elements: Html
        }).make({
          init: () => true,
          update: (_, shown) => shown,
          view: (shown, h) =>
            h.scoped((s) =>
              h.main(shown ? Pane(h, { key: "p", view: () => h.div(h.button("pane"), Editor(s, { key: "e" })) }) : null)
            )
        })
        const app = yield* Effect.acquireRelease(
          Effect.sync(() => document.body.appendChild(document.createElement("div"))),
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

  it.effect.skipIf(process.versions.bun !== undefined || process.versions.deno !== undefined)(
    "a waiting receiver doesn't keep alive the writes its author replaced",
    () =>
      Effect.gen(function*() {
        let stuck = false
        let made: Array<WeakRef<object>> = []
        const Stuck = Component.define({
          name: "Stuck",
          scoped: false,
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({ init: () => null, update: (model) => model, view: (_, h) => h.section(h.slots.body) })
          .pipe(
            Component.provide(Layer.effect(Slow, Effect.suspend(() => stuck ? Effect.never : Effect.succeed("ready"))))
          )
        const Item = Component.define({
          name: "Item",
          scoped: true,
          props: Schema.Struct({ n: Schema.Number }),
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({ init: () => null, update: (model) => model, view: (_, h) => h.b(String(h.props.n)) })
        const Rows = Component.define({
          name: "Rows",
          scoped: false,
          model: Schema.Number,
          message: Schema.Null,
          elements: Html
        }).make({
          init: () => 0,
          update: (n) => n + 1,
          view: (n, h) => {
            const props = { n }
            made.push(new WeakRef(props))
            return h.scoped((s) => h.main(Stuck(h, { key: "f", slots: { body: Item(s, { key: "i", props }) } })))
          }
        })
        const rendered = yield* HtmlServer.renderToHtml(Rows, {})
        stuck = true
        made = []
        const app = yield* Effect.acquireRelease(
          Effect.sync(() => {
            const element = document.body.appendChild(document.createElement("div"))
            element.innerHTML = rendered.html
            return element
          }),
          (element) => Effect.sync(() => element.remove())
        )
        const root = yield* BrowserHost.mountEffect(Rows, {}, app, { state: rendered.state })
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
