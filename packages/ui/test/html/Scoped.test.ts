// @vitest-environment happy-dom
import { Command, Component, Query, Route, Router, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlServer } from "@effect/ui/html"
import { ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Schema, SchemaGetter } from "effect"
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

  it.effect("keep a server's Model that decodes later, when the server didn't draw them", () =>
    Effect.gen(function*() {
      let decoding = Promise.resolve()
      let inits = 0
      const Later = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformEffect((text: string) => Effect.promise(() => decoding.then(() => text))),
        encode: SchemaGetter.passthrough()
      }))
      const Slip = Component.define({
        name: "Slip",
        scoped: true,
        model: Later,
        message: Schema.Never,
        elements: Html
      }).make({ init: () => side(inits++), update: (text) => text, view: (text, h) => h.p(text) })
      const Desk = Component.define({
        name: "Desk",
        scoped: false,
        model: Schema.Boolean,
        message: Schema.Literal("show"),
        elements: Html
      }).make({
        init: () => false,
        update: () => true,
        view: (shown, h) =>
          h.scoped((s) => {
            const slip = Slip(s, {})
            return h.main(shown ? slip : "none")
          })
      })
      const rendered = yield* HtmlServer.renderToHtml(Desk, {})
      let decode = () => {}
      decoding = new Promise<void>((resolve) => {
        decode = resolve
      })
      const app = document.createElement("div")
      app.innerHTML = rendered.html
      const root = yield* BrowserHost.mountEffect(Desk, {}, app, { state: rendered.state })
      root.send("show")
      yield* tick
      assert.strictEqual(app.querySelector("p"), null)
      decode()
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("p")?.textContent, "server")
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
    model: Schema.String,
    message: Schema.String,
    elements: Html
  }).make({
    init: () => "server",
    update: (_, text) => text,
    view: (text, h) => h.input.value(text).onInput(({ value }) => value)
  })
  const Box = Component.define({
    name: "Box",
    scoped: false,
    model: Schema.Null,
    message: Schema.Never,
    elements: Html
  })
    .make({ init: () => null, update: (model) => model, parts: () => ({}) })
  const fieldPage = (placed: "bare" | "in an element" | "by a forwarded builder" | "by a headless child's view") =>
    Component.define({ name: "FieldPage", scoped: false, model: Schema.Number, message: Schema.Null, elements: Html })
      .make({
        init: () => 0,
        update: (renders) => renders + 1,
        view: (_, h) =>
          h.scoped((s) => {
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
    ["in an element", "by a forwarded builder", "by a headless child's view"] as const
  )("keep what the user typed into a field the slot draws %s", (placed) =>
    Effect.gen(function*() {
      const Page = fieldPage(placed)
      const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
      const field = app.querySelector("input")!
      field.value = "typed"
      const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
      yield* open
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("input"), field)
      assert.strictEqual(field.value, "typed")
    }).pipe(Effect.scoped))

  it.effect("keep what the user typed into a field its author writes again while the receiver waits", () =>
    Effect.gen(function*() {
      const Page = fieldPage("bare")
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

  const stopping = (placed: "by a forwarded builder" | "by a headless child's view", how: "unplaced" | "omitted") => {
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
      name: "StoppingPage",
      scoped: false,
      model: Schema.Literals(["show", "hide", "remove"]),
      message: Schema.Literals(["show", "hide", "remove", "bump"]),
      elements: Html
    }).make({
      init: () => "show" as const,
      update: (_, message, $) => message === "bump" ? $.send(DraftRef, DraftMsg.Bump()) : message,
      view: (state, h) =>
        h.scoped(({ model }) => model !== undefined, (s) => {
          const shown = state === "show"
          const field = Field(s, { key: "f" })
          const draft = shown || how === "unplaced" ? Draft(s, { ref: DraftRef }) : null
          const body = placed === "by a forwarded builder"
            ? h.label.forward((label) => h.div(label, field, shown ? draft : null))
            : Box(h, { key: "box", view: () => h.div(field, shown ? draft : null) })
          return h.main(state === "remove" ? null : Gated(h, { key: "g", slots: { body } }))
        })
    })
  }

  it.effect.each(
    [
      ["by a forwarded builder", "unplaced"],
      ["by a forwarded builder", "omitted"],
      ["by a headless child's view", "unplaced"],
      ["by a headless child's view", "omitted"]
    ] as const
  )(
    "get a message while the slot, drawn %s, stops drawing them (%s) and keeps the field it still draws",
    ([placed, how]) =>
      Effect.gen(function*() {
        const Page = stopping(placed, how)
        const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
        const field = app.querySelector("input")!
        field.value = "typed"
        const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
        root.send("hide")
        yield* tick
        root.send("bump")
        yield* tick
        yield* open
        yield* root.adopted
        assert.strictEqual(app.querySelector("input"), field)
        assert.strictEqual(field.value, "typed")
        assert.isNull(app.querySelector("p"))
        root.send("show")
        yield* tick
        assert.strictEqual(app.querySelector("p")?.textContent, "server draft!")
      }).pipe(Effect.scoped)
  )

  it.effect("get a message once the receiver is removed while it waits, and are drawn again as they were", () =>
    Effect.gen(function*() {
      const Page = stopping("by a forwarded builder", "unplaced")
      const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
      const field = app.querySelector("input")!
      field.value = "typed"
      const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
      root.send("remove")
      yield* tick
      root.send("bump")
      yield* tick
      yield* open
      yield* root.adopted
      assert.isNull(app.querySelector("input"))
      root.send("show")
      yield* tick
      assert.strictEqual(app.querySelector("input"), field)
      assert.strictEqual(field.value, "typed")
      assert.strictEqual(app.querySelector("p")?.textContent, "server draft!")
    }).pipe(Effect.scoped))

  const Owner = Component.define({
    name: "Owner",
    scoped: false,
    model: Schema.Null,
    message: Schema.Never,
    elements: Html,
    shares: { value: () => ({ hint: "owned" }) }
  }).make({ init: () => null, update: (model) => model, parts: () => ({}) })
  const Required = Component.define({
    name: "Reading",
    scoped: true,
    model: Schema.String,
    message: Schema.String,
    elements: Html,
    shared: { owner: Owner }
  }).make({
    init: () => "server",
    update: (_, text) => text,
    view: (text, h) => h.label(h.shared.owner.hint, h.input.value(text).onInput(({ value }) => value), h.p(text))
  })
  const Optional = Component.define({
    name: "Reading",
    scoped: true,
    model: Schema.String,
    message: Schema.String,
    elements: Html,
    shared: { owner: { owner: Owner, optional: true } }
  }).make({
    init: () => "server",
    update: (_, text) => text,
    view: (text, h) =>
      h.shared.owner === undefined
        ? h.span("no owner")
        : h.label(h.input.value(text).onInput(({ value }) => value), h.p(text))
  })

  it.effect.each(
    [
      ["must", "the slot draws"],
      ["may", "the slot draws"],
      ["must", "draws the receiver"]
    ] as const
  )(
    "keep what the user typed into a field that %s read the shared state of an owner that %s",
    ([reads, owner]) =>
      Effect.gen(function*() {
        const Page = Component.define({
          name: "ReadingPage",
          scoped: false,
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            h.scoped((s) => {
              const field = reads === "must" ? Required(s, { key: "f" }) : Optional(s, { key: "f" })
              return h.main(
                owner === "the slot draws"
                  ? Gated(h, { key: "g", slots: { body: Owner(h, { key: "o", view: () => h.div(field) }) } })
                  : Owner(h, { key: "o", view: () => Gated(h, { key: "g", slots: { body: h.div(field) } }) })
              )
            })
        })
        const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
        const field = app.querySelector("input")!
        field.value = "typed"
        const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
        yield* open
        yield* root.adopted
        yield* tick
        assert.strictEqual(app.querySelector("input"), field)
        assert.strictEqual(app.querySelector("p")?.textContent, "typed")
      }).pipe(Effect.scoped)
  )

  it.effect.each(["by a forwarded builder", "by a headless child's view"] as const)(
    "get a message, and no click on the button the server drew, once the slot, drawn %s, stops drawing them",
    (placed) =>
      Effect.gen(function*() {
        const GoMsg = UiSchema.TaggedEnum({ Bump: {} })
        const Go = Component.define({
          name: "Go",
          scoped: true,
          model: Schema.String,
          message: GoMsg,
          receives: ["Bump"],
          elements: Html
        }).make({
          init: () => "go",
          update: (text) => text + "!",
          view: (text, h) => h.button.onClick(GoMsg.Bump()).children(text)
        })
        const GoRef = Go.ref("go")
        const Page = Component.define({
          name: "GoPage",
          scoped: false,
          model: Schema.Literals(["drawn", "replaced"]),
          message: Schema.Literals(["drawn", "replaced", "bump"]),
          elements: Html
        }).make({
          init: () => "drawn" as const,
          update: (_, message, $) => message === "bump" ? $.send(GoRef, GoMsg.Bump()) : message,
          view: (state, h) =>
            h.scoped((s) => {
              const go = state === "drawn" ? Go(s, { ref: GoRef }) : "gone"
              const body = placed === "by a forwarded builder"
                ? h.label.forward((label) => h.div(label, go))
                : Box(h, { key: "box", view: () => h.div(go) })
              return h.main(h.i(state), Gated(h, { key: "g", slots: { body } }))
            })
        })
        const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
        const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
        root.send("replaced")
        yield* tick
        assert.strictEqual(app.querySelector("i")?.textContent, "replaced")
        app.querySelector("button")!.click()
        yield* tick
        root.send("bump")
        yield* tick
        yield* open
        yield* root.adopted
        assert.isNull(app.querySelector("button"))
        root.send("drawn")
        yield* tick
        assert.strictEqual(app.querySelector("button")?.textContent, "go!")
      }).pipe(Effect.scoped)
  )

  const NoteMsg = UiSchema.TaggedEnum({ Typed: { text: Schema.String }, Add: { text: Schema.String } })
  const Note = Component.define({
    name: "Note",
    scoped: true,
    model: Schema.String,
    message: NoteMsg,
    receives: ["Add"],
    elements: Html
  }).make({
    init: () => "server",
    update: (note, message) => message._tag === "Typed" ? message.text : note + message.text,
    view: (note, h) => h.input.value(note).onInput(({ value }) => NoteMsg.Typed({ text: value }))
  })
  const NoteRef = Note.ref("n")
  const Bare = Component.define({
    name: "Bare",
    scoped: false,
    model: Schema.Null,
    message: Schema.Never,
    elements: Html,
    slots: ["body"]
  }).make({ init: () => null, update: (model) => model, view: (_, h) => h.slots.body })
    .pipe(Component.provide(Layer.effect(Slow, Effect.suspend(() => Effect.as(gate, "ready")))))
  const NotePage = Component.define({
    name: "NotePage",
    scoped: false,
    model: Schema.Literals(["in the slot", "in an article", "in an article, the receiver gone", "nowhere"]),
    message: Schema.Struct({
      at: Schema.Literals(["in the slot", "in an article", "in an article, the receiver gone", "nowhere"]),
      add: Schema.String
    }),
    elements: Html
  }).make({
    init: () => "in the slot" as const,
    update: (_, { add, at }, $) => $.set(at).send(NoteRef, NoteMsg.Add({ text: add })),
    view: (at, h) =>
      h.scoped((s) => {
        const note = Note(s, { ref: NoteRef })
        return h.main(
          at === "in an article, the receiver gone" || at === "nowhere"
            ? null
            : Bare(h, { key: "g", slots: { body: at === "in the slot" ? note : null } }),
          at === "in the slot" || at === "nowhere" ? null : h.article(note)
        )
      })
  })

  it.effect.each(["in an article", "in an article, the receiver gone"] as const)(
    "get their messages in the order sent, the last sent as they're drawn %s",
    (at) =>
      Effect.gen(function*() {
        const { app, state } = yield* serve(HtmlServer.renderToHtml(NotePage, {}))
        const root = yield* BrowserHost.mountEffect(NotePage, {}, app, { state })
        root.send({ at: "in the slot", add: "A" })
        yield* tick
        root.send({ at: "in the slot", add: "B" })
        yield* tick
        root.send({ at, add: "C" })
        yield* tick
        assert.strictEqual(app.querySelector("input")?.value, "serverABC")
      }).pipe(Effect.scoped)
  )

  it.effect("keep what the user typed, and get a message after it, when drawn nowhere at adoption", () =>
    Effect.gen(function*() {
      const { app, state } = yield* serve(HtmlServer.renderToHtml(NotePage, {}))
      const field = app.querySelector("input")!
      field.value = "typed"
      const root = yield* BrowserHost.mountEffect(NotePage, {}, app, { state })
      root.send({ at: "nowhere", add: "" })
      yield* root.adopted
      yield* tick
      root.send({ at: "in an article, the receiver gone", add: "!" })
      yield* tick
      assert.strictEqual(app.querySelector("input"), field)
      assert.strictEqual(field.value, "typed!")
    }).pipe(Effect.scoped))

  it.effect("get a message after the edit the user made before they adopted", () =>
    Effect.gen(function*() {
      const { app, open, state } = yield* serve(HtmlServer.renderToHtml(NotePage, {}))
      const field = app.querySelector("input")!
      field.value = "typed"
      const root = yield* BrowserHost.mountEffect(NotePage, {}, app, { state })
      root.send({ at: "in the slot", add: "!" })
      yield* tick
      yield* open
      yield* root.adopted
      yield* tick
      assert.strictEqual(field.value, "typed!")
    }).pipe(Effect.scoped))

  it.effect.each(["in an article", "in an article, the receiver gone"] as const)(
    "keep what the user typed, and get a message after it, when drawn %s before adoption",
    (at) =>
      Effect.gen(function*() {
        const { app, state } = yield* serve(HtmlServer.renderToHtml(NotePage, {}))
        const field = app.querySelector("input")!
        field.value = "typed"
        const root = yield* BrowserHost.mountEffect(NotePage, {}, app, { state })
        root.send({ at, add: "!" })
        yield* tick
        assert.strictEqual(app.querySelector("input"), field)
        assert.strictEqual(field.value, "typed!")
      }).pipe(Effect.scoped)
  )

  const RowMsg = UiSchema.TaggedEnum({ Add: { text: Schema.String } })
  const Row = Component.define({
    name: "Row",
    scoped: true,
    model: Schema.String,
    message: RowMsg,
    receives: ["Add"],
    events: Schema.String,
    elements: Html
  }).make({
    init: () => "",
    update: (row, { text }, $) => $.set(row + text).emit(text),
    view: (row, h) => h.p(row)
  })
  const XRef = Row.ref("x")
  const YRef = Row.ref("y")
  const Relist = Component.define({
    name: "Relist",
    scoped: false,
    model: Schema.Null,
    message: Schema.Never,
    events: Schema.Null,
    elements: Html
  }).make({ init: ($) => $.set(null).emit(null), update: (model) => model, view: (_, h) => h.i() })
  const RowsMsg = UiSchema.TaggedEnum({
    Send: { to: Schema.Literals(["x", "y"]), text: Schema.String },
    End: { text: Schema.String },
    List: {},
    Got: { text: Schema.String }
  })
  const Rows = Component.define({
    name: "Rows",
    scoped: false,
    model: Schema.Struct({ listed: Schema.Boolean, ended: Schema.Boolean, got: Schema.String }),
    message: RowsMsg,
    elements: Html
  }).make({
    init: () => ({ listed: true, ended: false, got: "" }),
    update: (model, message, $) =>
      RowsMsg.match(message, {
        Send: ({ text, to }) => $.set(model).send(to === "x" ? XRef : YRef, RowMsg.Add({ text })),
        End: ({ text }) => $.set({ ...model, listed: false, ended: true }).send(XRef, RowMsg.Add({ text })),
        List: () => ({ ...model, listed: true }),
        Got: ({ text }) => ({ ...model, got: model.got + text })
      }),
    view: (model, h) => {
      const onEmit = (text: string) => RowsMsg.Got({ text })
      return h.main(
        Gated(h, {
          key: "g",
          slots: {
            body: h.scoped(
              ($) => $.model.listed,
              (s) => model.listed ? [Row(s, { ref: XRef, onEmit }), Row(s, { ref: YRef, onEmit })] : []
            )
          }
        }),
        model.ended ? Relist(h, { key: "r", onEmit: () => RowsMsg.List() }) : null,
        h.em(model.got)
      )
    }
  })

  it.effect("get no message sent as a flush ended them, when that flush lists them again", () =>
    Effect.gen(function*() {
      const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Rows, {}))
      const root = yield* BrowserHost.mountEffect(Rows, {}, app, { state })
      root.send(RowsMsg.End({ text: "C" }))
      yield* tick
      yield* open
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("em")?.textContent, "")
    }).pipe(Effect.scoped))

  it.effect("get one author's messages in the order sent, when two of them are placed together", () =>
    Effect.gen(function*() {
      const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Rows, {}))
      const root = yield* BrowserHost.mountEffect(Rows, {}, app, { state })
      for (const [to, text] of [["y", "A"], ["x", "B"], ["y", "C"], ["x", "D"]] as const) {
        root.send(RowsMsg.Send({ to, text }))
        yield* tick
      }
      yield* open
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("em")?.textContent, "ABCD")
    }).pipe(Effect.scoped))

  it.effect("keep what the user typed, when the one drawn before them leaves the slot", () =>
    Effect.gen(function*() {
      const Mixed = Component.define({
        name: "Mixed",
        scoped: false,
        model: Schema.Boolean,
        message: Schema.Boolean,
        elements: Html
      }).make({
        init: () => false,
        update: (_, moved) => moved,
        view: (moved, h) =>
          h.scoped((s) => {
            const row = Row(s, { key: "r" })
            return h.main(
              Bare(h, { key: "g", slots: { body: [moved ? null : row, Note(s, {})] } }),
              moved ? h.article(row) : null
            )
          })
      })
      const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Mixed, {}))
      const field = app.querySelector("input")!
      field.value = "typed"
      const root = yield* BrowserHost.mountEffect(Mixed, {}, app, { state })
      root.send(true)
      yield* tick
      yield* open
      yield* root.adopted
      assert.strictEqual(app.querySelector("input"), field)
      assert.strictEqual(field.value, "typed")
    }).pipe(Effect.scoped))

  it.effect("leave the one field drawn after them, which takes an edit once, when moved out of the slot", () =>
    Effect.gen(function*() {
      const Lead = Component.define({
        name: "Lead",
        scoped: false,
        props: Schema.Struct({ moved: Schema.Boolean }),
        model: Schema.String,
        message: Schema.String,
        elements: Html
      }).make({
        init: () => "",
        update: (text, typed) => text + typed,
        view: (text, h) =>
          h.scoped((s) => {
            const row = Row(s, { key: "r" })
            return h.main(
              Bare(h, { key: "g", slots: { body: h.props.moved ? null : row } }),
              h.article(h.props.moved ? row : null, h.input.value(text).onInput(({ value }) => value)),
              h.em(text)
            )
          })
      })
      const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Lead, { moved: false }))
      const field = app.querySelector("input")!
      const root = yield* BrowserHost.mountEffect(Lead, { moved: true }, app, { state })
      yield* open
      yield* root.adopted
      field.value = "typed"
      field.dispatchEvent(new Event("input", { bubbles: true }))
      yield* tick
      assert.deepStrictEqual(Array.from(app.querySelectorAll("input")), [field])
      assert.strictEqual(app.querySelector("em")!.textContent, "typed")
    }).pipe(Effect.scoped))

  it.effect("leave the one field drawn after them, which takes an edit once, when a scoped child in their place draws them", () =>
    Effect.gen(function*() {
      const Box = Component.define({
        name: "Box",
        scoped: true,
        model: Schema.Null,
        message: Schema.Never,
        elements: Html,
        slots: ["body"]
      }).make({ init: () => null, update: (model) => model, view: (_, h) => h.aside(h.slots.body) })
      const Nest = Component.define({
        name: "Nest",
        scoped: false,
        props: Schema.Struct({ moved: Schema.Boolean }),
        model: Schema.String,
        message: Schema.String,
        elements: Html
      }).make({
        init: () => "",
        update: (text, typed) => text + typed,
        view: (text, h) =>
          h.scoped((s) => {
            const row = Row(s, { key: "r" })
            const box = Box(s, { key: "b", slots: { body: h.props.moved ? row : null } })
            return h.main(
              Gated(h, {
                key: "g",
                slots: {
                  body: [
                    h.props.moved ? box : row,
                    h.input.value(text).onInput(({ value }) => value),
                    h.props.moved ? null : box
                  ]
                }
              }),
              h.em(text)
            )
          })
      })
      const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Nest, { moved: false }))
      const field = app.querySelector("input")!
      const root = yield* BrowserHost.mountEffect(Nest, { moved: true }, app, { state })
      yield* open
      yield* root.adopted
      field.value = "typed"
      field.dispatchEvent(new Event("input", { bubbles: true }))
      yield* tick
      assert.deepStrictEqual(Array.from(app.querySelectorAll("input")), [field])
      assert.strictEqual(app.querySelector("em")!.textContent, "typed")
    }).pipe(Effect.scoped))

  it.effect.each([[0, "after", "client"], [1, "after", "server"], [0, "before", "client"]] as const)(
    "after a Back while a receiver waits, when first drawn %i entries forward of it and written %s it adopts, start as the %s's",
    ([forward, written, drawn]) =>
      Effect.gen(function*() {
        let from = "server"
        const Draft = Component.define({
          name: "Draft",
          scoped: true,
          model: Schema.String,
          message: Schema.Never,
          elements: Html
        }).make({ init: () => from, update: (text) => text, view: (text, h) => h.em(text) })
        const Routes = Route.union({
          Form: Route.make("/form", { search: { q: Schema.optional(Schema.String) } })
        })
        const Message = UiSchema.TaggedEnum({ Changed: { route: Routes }, Go: {}, Went: {}, Write: {}, Draw: {} })
        const App = Component.define({
          name: "App",
          scoped: false,
          props: Schema.Struct({ route: Routes }),
          model: Schema.Struct({ route: Routes, writes: Schema.Boolean, draws: Schema.Boolean }),
          message: Message,
          elements: Html
        }).make({
          init: ($) => ({ route: $.props.route, writes: from === "server", draws: from === "server" }),
          update: (model, message, $) =>
            Message.match(message, {
              Changed: ({ route }) => ({ ...model, route }),
              Go: () =>
                $.run(Router.push(Routes, Routes.Form({ search: { q: "q" } })).pipe(Command.map(() => Message.Went()))),
              Went: () => model,
              Write: () => ({ ...model, writes: true }),
              Draw: () => ({ ...model, writes: true, draws: true })
            }),
          subscriptions: (model) => [Router.subscription(Routes, model.route, (route) => Message.Changed({ route }))],
          view: (model, h) =>
            h.scoped((s) => {
              const draft = model.writes ? Draft(s, {}) : null
              return h.main(Gated(h, { key: "g", slots: { body: null } }), model.draws ? draft : null)
            })
        })
        const history = Router.memoryHistory("/form")
        const routed = Effect.provide(Router.make({ routes: Routes, history }))
        from = "client"
        yield* Effect.gen(function*() {
          const first = yield* BrowserHost.mountEffect(App, Router.props(Routes), document.createElement("div"))
          first.send(Message.Go())
          yield* tick
        }).pipe(Effect.scoped, routed)
        from = "server"
        const { app, open, state } = yield* serve(
          HtmlServer.renderToHtml(App, Router.props(Routes)).pipe(
            Effect.provide(Router.make({ routes: Routes, history: Router.memoryHistory("/form?q=q") }))
          )
        )
        from = "client"
        yield* Effect.gen(function*() {
          const root = yield* BrowserHost.mountEffect(App, Router.props(Routes), app, {
            state: { ...state, "/App": { ...(state["/App"] as object), writes: false, draws: false } }
          })
          history.go(-1)
          yield* tick
          if (written === "before") {
            root.send(Message.Write())
            yield* tick
          }
          yield* open
          yield* root.adopted
          history.go(forward)
          yield* tick
          root.send(Message.Draw())
          yield* tick
          assert.strictEqual(app.querySelector("em")!.textContent, drawn)
        }).pipe(routed)
      }).pipe(Effect.scoped)
  )

  it.effect.each(
    [["the receiver", "before"], ["the receiver", "after"], ["their own Layer", "before"], [
      "their own Layer",
      "after"
    ]] as const
  )(
    "keep the server's Model after a reload, over the one a Back restores, when they wait for %s and a push leaves %s they adopt",
    ([waits, pushed]) =>
      Effect.gen(function*() {
        let from = "restored"
        const Draft = Component.define({
          name: "Draft",
          scoped: true,
          model: Schema.String,
          message: Schema.Never,
          elements: Html
        }).make({ init: () => from, update: (text) => text, view: (text, h) => h.em(text) })
        const Slowed = Draft.pipe(
          Component.provide(Layer.effect(Slow, Effect.suspend(() => Effect.as(gate, "ready"))))
        )
        const Routes = Route.union({
          Form: Route.make("/form", { search: { q: Schema.optional(Schema.String) } }),
          Park: Route.make("/park")
        })
        const Message = UiSchema.TaggedEnum({ Changed: { route: Routes }, Go: { route: Routes }, Went: {} })
        const App = Component.define({
          name: "App",
          scoped: false,
          props: Schema.Struct({ route: Routes }),
          model: Routes,
          message: Message,
          elements: Html
        }).make({
          init: ($) => $.props.route,
          update: (model, message, $) =>
            Message.match(message, {
              Changed: ({ route }) => route,
              Go: ({ route }) => $.run(Router.push(Routes, route).pipe(Command.map(() => Message.Went()))),
              Went: () => model
            }),
          subscriptions: (model) => [Router.subscription(Routes, model, (route) => Message.Changed({ route }))],
          view: (model, h) =>
            model._tag === "Park"
              ? h.main()
              : h.scoped((s) =>
                h.main(
                  waits === "the receiver" ? Gated(h, { key: "g", slots: { body: Draft(s, {}) } }) : Slowed(s, {})
                )
              )
        })
        const history = Router.memoryHistory("/form")
        const routed = Effect.provide(Router.make({ routes: Routes, history }))
        gate = Effect.void
        yield* Effect.gen(function*() {
          const first = yield* BrowserHost.mountEffect(App, Router.props(Routes), document.createElement("div"))
          first.send(Message.Go({ route: Routes.Form({ search: { q: "q" } }) }))
          yield* tick
        }).pipe(Effect.scoped, routed)
        from = "server"
        const { app, open, state } = yield* serve(
          HtmlServer.renderToHtml(App, Router.props(Routes)).pipe(
            Effect.provide(Router.make({ routes: Routes, history: Router.memoryHistory("/form?q=q") }))
          )
        )
        from = "client"
        yield* Effect.gen(function*() {
          const root = yield* BrowserHost.mountEffect(App, Router.props(Routes), app, { state })
          history.go(-1)
          yield* tick
          if (pushed === "after") {
            yield* open
            yield* root.adopted
          }
          root.send(Message.Go({ route: Routes.Park() }))
          yield* tick
          yield* open
          yield* root.adopted
        }).pipe(Effect.scoped, routed)
        yield* Effect.gen(function*() {
          const reloaded = document.createElement("div")
          yield* BrowserHost.mountEffect(App, Router.props(Routes), reloaded)
          history.go(-1)
          yield* tick
          assert.strictEqual(reloaded.querySelector("em")!.textContent, "server")
        }).pipe(routed)
      }).pipe(Effect.scoped)
  )

  it.effect.each(["a push", "a Back"] as const)(
    "keep what the user typed into a field drawn by one the slot still draws, after %s while the receiver waits",
    (navigation) =>
      Effect.gen(function*() {
        const Leaf = Component.define({
          name: "Leaf",
          scoped: false,
          model: Schema.String,
          message: Schema.String,
          elements: Html
        }).make({
          init: () => "server",
          update: (_, text) => text,
          view: (text, h) => h.input.value(text).onInput(({ value }) => value)
        })
        const Branch = Component.define({
          name: "Branch",
          scoped: true,
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({ init: () => null, update: (model) => model, view: (_, h) => h.article(Leaf(h, { key: "l" })) })
        const Routes = Route.union({
          Form: Route.make("/form", { search: { q: Schema.optional(Schema.String) } }),
          Away: Route.make("/away")
        })
        const App = Component.define({
          name: "App",
          scoped: false,
          props: Schema.Struct({ route: Routes }),
          model: Routes,
          message: Routes,
          elements: Html
        }).make({
          init: ($) => $.props.route,
          update: (_, route) => route,
          subscriptions: (model) => [Router.subscription(Routes, model, (route) => route)],
          view: (_, h) => h.scoped((s) => h.main(Gated(h, { key: "g", slots: { body: Branch(s, {}) } })))
        })
        const history = Router.memoryHistory("/form")
        const routed = Effect.provide(Router.make({ routes: Routes, history }))
        gate = Effect.void
        yield* Effect.gen(function*() {
          yield* BrowserHost.mountEffect(App, Router.props(Routes), document.createElement("div"))
          yield* (yield* Router.Router).navigate("/form?q=q")
          yield* tick
        }).pipe(Effect.scoped, routed)
        const { app, open, state } = yield* serve(HtmlServer.renderToHtml(App, Router.props(Routes)).pipe(routed))
        yield* Effect.gen(function*() {
          const field = app.querySelector("input")!
          field.value = "typed"
          const root = yield* BrowserHost.mountEffect(App, Router.props(Routes), app, { state })
          if (navigation === "a Back") history.go(-1)
          else yield* (yield* Router.Router).navigate("/away")
          yield* tick
          yield* open
          yield* root.adopted
          yield* tick
          assert.strictEqual(app.querySelector("input"), field)
          assert.strictEqual(field.value, "typed")
        }).pipe(routed)
      }).pipe(Effect.scoped)
  )

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

  it.effect("get a message once moved to another receiver that waits, which has none of their nodes", () =>
    Effect.gen(function*() {
      const Page = moving()
      const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
      const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
      root.send("b")
      root.send("bump")
      yield* tick
      yield* open
      yield* root.adopted
      yield* tick
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

  it.effect.skipIf(process.versions.bun !== undefined || process.versions.deno !== undefined)(
    "release the server's node of one that left the slot and then ended, while the receiver waits",
    () =>
      Effect.gen(function*() {
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
            h.scoped(({ model }) => model < 2, (s) => {
              const item = n < 2 ? Item(s, { key: "i", props: { n: 0 } }) : null
              return h.main(
                Bare(h, { key: "f", slots: { body: [n === 0 ? item : null, h.p("stays")] } }),
                h.article(n === 1 ? item : null)
              )
            })
        })
        const { app, state } = yield* serve(HtmlServer.renderToHtml(Rows, {}))
        const node = new WeakRef(app.querySelector("b")!)
        const root = yield* BrowserHost.mountEffect(Rows, {}, app, { state })
        root.send(null)
        yield* tick
        assert.strictEqual(app.querySelector("article b"), node.deref())
        root.send(null)
        yield* tick
        yield* collectGarbage
        assert.strictEqual(node.deref(), undefined)
      }).pipe(Effect.scoped)
  )

  const leaving = (
    how:
      | "that waits for its own Layer, drawn where the receiver was"
      | "drawn where a scoped receiver, still written, was"
      | "drawn after a scoped child that left with it, which draws the receiver that held it"
  ) => {
    const provided = Component.provide(Layer.effect(Slow, Effect.suspend(() => Effect.as(gate, "ready"))))
    const Waits = Component.define({
      name: "Waits",
      scoped: true,
      model: Schema.String,
      message: Schema.String,
      elements: Html
    }).make({
      init: () => "server",
      update: (_, text) => text,
      view: (text, h) => h.input.value(text).onInput(({ value }) => value)
    }).pipe(provided)
    const Kept = Component.define({
      name: "Kept",
      scoped: true,
      model: Schema.Null,
      message: Schema.Never,
      elements: Html,
      slots: ["body"]
    }).make({ init: () => null, update: (model) => model, view: (_, h) => h.slots.body }).pipe(provided)
    const Holder = Component.define({
      name: "Holder",
      scoped: true,
      model: Schema.Null,
      message: Schema.Never,
      elements: Html,
      slots: ["body"]
    }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => Bare(h, { key: "b", slots: { body: h.slots.body } })
    })
    return Component.define({
      name: "LeavingPage",
      scoped: false,
      model: Schema.Boolean,
      message: Schema.Null,
      elements: Html
    }).make({
      init: () => false,
      update: () => true,
      view: (left, h) =>
        h.scoped((s) => {
          if (how === "that waits for its own Layer, drawn where the receiver was") {
            const field = Waits(s, { key: "f" })
            return h.main(left ? field : Bare(h, { key: "g", slots: { body: field } }))
          }
          const field = Field(s, { key: "f" })
          if (how === "drawn where a scoped receiver, still written, was") {
            const kept = Kept(s, { key: "g", slots: { body: left ? null : field } })
            return h.main(left ? field : kept)
          }
          const holder = Holder(s, { key: "h", slots: { body: left ? null : field } })
          return left ? h.main(holder, field) : h.main(Bare(h, { key: "g", slots: { body: holder } }))
        })
    })
  }
  it.effect.each(
    [
      "that waits for its own Layer, drawn where the receiver was",
      "drawn where a scoped receiver, still written, was",
      "drawn after a scoped child that left with it, which draws the receiver that held it"
    ] as const
  )("keep what the user typed into a field %s", (how) =>
    Effect.gen(function*() {
      const Page = leaving(how)
      const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
      const field = app.querySelector("input")!
      field.value = "typed"
      const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
      root.send(null)
      yield* tick
      assert.strictEqual(app.querySelector("input"), field)
      yield* open
      yield* root.adopted
      yield* tick
      assert.strictEqual(app.querySelector("input"), field)
      assert.strictEqual(field.value, "typed")
    }).pipe(Effect.scoped))

  it.effect("keep the server's nodes of a receiver they draw, when taken out of the document and drawn again while it waits", () =>
    Effect.gen(function*() {
      const Card = Component.define({
        name: "Card",
        scoped: true,
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => Bare(h, { key: "g", slots: { body: [h.p("a"), h.p("b")] } })
      })
      const Cards = Component.define({
        name: "Cards",
        scoped: false,
        model: Schema.Boolean,
        message: Schema.Boolean,
        elements: Html
      }).make({
        init: () => true,
        update: (_, shown) => shown,
        view: (shown, h) =>
          h.scoped((s) => {
            const card = Card(s, { key: "c" })
            return h.main(shown ? card : null)
          })
      })
      const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Cards, {}))
      const served = Array.from(app.querySelectorAll("p"))
      const root = yield* BrowserHost.mountEffect(Cards, {}, app, { state })
      root.send(false)
      yield* tick
      assert.strictEqual(app.querySelector("p"), null)
      root.send(true)
      yield* tick
      yield* open
      yield* root.adopted
      assert.deepStrictEqual(Array.from(app.querySelectorAll("p")), served)
    }).pipe(Effect.scoped))

  it.effect.skipIf(process.versions.bun !== undefined || process.versions.deno !== undefined)(
    "release a receiver that adopted them and was removed, while another still waits",
    () =>
      Effect.gen(function*() {
        let stuck = false
        const Stuck = Component.define({
          name: "Stuck",
          scoped: false,
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({ init: () => null, update: (model) => model, view: (_, h) => h.aside("stuck") })
          .pipe(
            Component.provide(Layer.effect(Slow, Effect.suspend(() => stuck ? Effect.never : Effect.succeed("ready"))))
          )
        let passed: Array<WeakRef<object>> = []
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
            h.scoped((s) => {
              const slots = { body: Item(s, { key: "i", props: { n: 0 } }) }
              passed.push(new WeakRef(slots))
              return h.main(shown ? Gated(h, { key: "a", slots }) : null, Stuck(h, { key: "b" }))
            })
        })
        const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
        stuck = true
        passed = []
        const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
        yield* open
        yield* tick
        assert.strictEqual(app.querySelector("section")?.textContent, "0")
        root.send(false)
        yield* tick
        yield* collectGarbage
        assert.isUndefined(passed[0].deref())
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
