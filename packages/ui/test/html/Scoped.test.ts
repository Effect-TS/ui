// @vitest-environment happy-dom
import { Component, Query, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlServer } from "@effect/ui/html"
import { ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Schema, SchemaGetter, SchemaIssue } from "effect"
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

const Broken = Component.define({
  name: "Broken",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (): never => {
    throw new Error("broken")
  }
})

const Pin = Component.define({ name: "Pin", scoped: true, model: Schema.Null, message: Schema.Never, elements: Html })
  .make({ init: () => null, update: (model) => model, view: (_, h) => h.u("pin") })

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
    view: (draft, h) =>
      h.form(
        h.p(draft),
        Avatar(h, { key: "a" }),
        h.scoped((s) => Badge(s, { key: "b" })),
        Broken(h, { key: "x", fallback: () => h.s("down") })
      )
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
      h.scoped((s) => Pin(s, {})),
      shown || !billing ? h.scoped((s) => Profile(s, { key: "p" })) : null
    )
  }
}).pipe(Component.provide(GetTab.layer))

const Sketch = Component.define({
  name: "Sketch",
  scoped: true,
  model: Schema.declare((u): u is () => string => typeof u === "function"),
  message: Schema.Never,
  elements: Html
}).make({ init: () => () => "sketch", update: (model) => model, view: (text, h) => h.em(text()) })

const Board = Component.define({
  name: "Board",
  scoped: false,
  model: Schema.Boolean,
  message: Schema.Boolean,
  elements: Html,
  queries: { tab: { query: GetTab, args: () => ({}) } }
}).make({
  init: () => false,
  update: (_, shown) => shown,
  view: (shown, h) =>
    h.main(
      h.scoped((s) => Sketch(s, { key: "drawn" })),
      shown || !AsyncResult.isSuccess(h.queries.tab) ? h.scoped((s) => Sketch(s, { key: "kept" })) : null
    )
}).pipe(Component.provide(GetTab.layer))

describe("scoped children on the server", () => {
  it.effect("writes no nodes for a kept child, and the client takes its state once it's written", () =>
    Effect.gen(function*() {
      inits = { avatar: 0, profile: 0, badge: 0 }
      const result = yield* ssr(Settings, {})
      assert.notInclude(result.html, "draft from")
      assert.deepStrictEqual(result.adopted, ["/Settings", "/Settings/Pin[]"])

      result.root.send(true)
      yield* TestHost.settle
      assert.strictEqual(result.container.querySelector("p")!.textContent, "draft from the server")
      assert.strictEqual(result.container.querySelector("i")!.textContent, "avatar from the server")
      assert.strictEqual(result.container.querySelector("b")!.textContent, "badge from the server")
      assert.strictEqual(result.container.querySelector("s")!.textContent, "down")
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("lists a child whose Model doesn't encode as deferred where it's drawn, and sends a kept one no state", () =>
    Effect.gen(function*() {
      const result = yield* ssr(Board, {})
      assert.deepStrictEqual(result.state["~deferred"], ["/Board/Sketch[drawn]"])
      assert.deepStrictEqual(result.state["~kept"], { "/Board": { "/Board/Sketch[kept]": {} } })

      result.root.send(true)
      yield* TestHost.settle
      assert.strictEqual(result.container.textContent, "sketchsketch")
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

describe("scoped children in a receiver that waits for its Layer", { concurrent: false }, () => {
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

  it.effect.each(
    ["bare", "in an element", "by a headless child's view"] as const
  )(
    "keep what the user typed into a field its author writes again, %s, while the receiver waits",
    (placed) =>
      Effect.gen(function*() {
        const Page = fieldPage(placed)
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
  const Bare = Component.define({
    name: "Bare",
    scoped: false,
    model: Schema.Null,
    message: Schema.Never,
    elements: Html,
    slots: ["body"]
  }).make({ init: () => null, update: (model) => model, view: (_, h) => h.slots.body })
    .pipe(Component.provide(Layer.effect(Slow, Effect.suspend(() => Effect.as(gate, "ready")))))
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

  let drafts = 0
  let start: "slot" | "aside" = "slot"
  const Where = Schema.Literals(["slot", "aside", "none", "ended"])
  const draft = (name: string) =>
    Component.define({ name, scoped: true, model: Schema.String, message: Schema.Never, elements: Html }).make({
      init: () => side(drafts++),
      update: (text) => text,
      view: (text, h) => h.input.value(text)
    })
  const Draft = draft("Draft")
  const SlowDraft = draft("SlowDraft")
    .pipe(Component.provide(Layer.effect(Slow, Effect.suspend(() => Effect.as(gate, "ready")))))
  const moving = (headless: boolean) =>
    Component.define({ name: "Moving", scoped: false, model: Where, message: Where, elements: Html })
      .make({
        init: () => "slot" as const,
        update: (_, where) => where,
        view: (where, h) =>
          h.scoped(({ model }) => model !== "ended", (s) => {
            const written = Draft(s, { key: "d" })
            const body = where === "slot" || where === "ended" ? written : null
            return h.main(
              Gated(h, {
                key: "g",
                slots: { body: headless ? Box(h, { key: "box", view: () => h.div(body) }) : body }
              }),
              h.aside(where === "aside" ? written : null)
            )
          })
      })
  const Moving = moving(false)
  const Restarting = Component.define({
    name: "Restarting",
    scoped: false,
    model: Where,
    message: Where,
    elements: Html
  }).make({
    init: () => start,
    update: (_, where) => where,
    view: (where, h) =>
      h.scoped((s) => {
        const written = SlowDraft(s, { key: "d" })
        return h.main(h.p(where === "slot" ? written : null), h.aside(where === "aside" ? written : null))
      })
  })

  it.effect.each(
    [[false, "slot"], [true, "headless child's view"]] as const
  )(
    "take the server's Model and new nodes when moved out of the receiver while it waits (%s: its %s drew them)",
    ([headless]) =>
      Effect.gen(function*() {
        drafts = 0
        const Moving = moving(headless)
        const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Moving, {}))
        const served = app.querySelector("input")!
        const root = yield* BrowserHost.mountEffect(Moving, {}, app, { state })
        root.send("aside")
        yield* tick
        const moved = app.querySelector<HTMLInputElement>("aside input")!
        assert.notStrictEqual(moved, served)
        assert.strictEqual(moved.value, "server")
        yield* open
        yield* root.adopted
        assert.deepStrictEqual(Array.from(app.querySelectorAll("input")), [moved])
      }).pipe(Effect.scoped)
  )

  it.effect("keep the nodes they got outside the receiver when moved back in before it resumes", () =>
    Effect.gen(function*() {
      drafts = 0
      const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Moving, {}))
      const root = yield* BrowserHost.mountEffect(Moving, {}, app, { state })
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
        const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Moving, {}))
        const root = yield* BrowserHost.mountEffect(Moving, {}, app, { state })
        root.send(left)
        yield* tick
        yield* open
        yield* root.adopted
        assert.strictEqual(app.querySelector("input"), null)
        root.send("aside")
        yield* tick
        assert.strictEqual(app.querySelector<HTMLInputElement>("aside input")!.value, expected)
      }).pipe(Effect.scoped)
  )

  it.effect.each([["slot", "aside"], ["aside", "slot"], ["slot", "slot"]] as const)(
    "that wait for their own Layer in the %s keep the server's Model when next placed in the %s",
    ([from, to]) =>
      Effect.gen(function*() {
        drafts = 0
        start = from
        const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Restarting, {}))
        const served = app.querySelector("input")!
        const root = yield* BrowserHost.mountEffect(Restarting, {}, app, { state })
        root.send(to)
        yield* tick
        yield* open
        yield* root.adopted
        const placed = app.querySelector<HTMLInputElement>(to === "slot" ? "p input" : "aside input")!
        assert.deepStrictEqual(Array.from(app.querySelectorAll("input")), [placed])
        assert.strictEqual(placed === served, from === to)
        assert.strictEqual(placed.value, "server")
      }).pipe(Effect.scoped)
  )

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

  const Item = Component.define({
    name: "Item",
    scoped: true,
    props: Schema.Struct({ n: Schema.Number }),
    model: Schema.Null,
    message: Schema.Never,
    elements: Html
  }).make({ init: () => null, update: (model) => model, view: (_, h) => h.b(String(h.props.n)) })

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

  it.effect.each(
    ["the receiver's slot", "the slot of a scoped child there"] as const
  )(
    "let adoption finish when their receiver is removed as they wait for their own Layer in %s",
    (where) =>
      Effect.gen(function*() {
        const Waits = Component.define({
          name: "Waits",
          scoped: true,
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({ init: () => null, update: (model) => model, view: (_, h) => h.b("waits") })
          .pipe(Component.provide(Layer.effect(Slow, Effect.suspend(() => Effect.as(gate, "ready")))))
        const Shell = Component.define({
          name: "Shell",
          scoped: true,
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["inner"]
        }).make({ init: () => null, update: (model) => model, view: (_, h) => h.div(h.slots.inner) })
        const Page = Component.define({
          name: "Page",
          scoped: false,
          model: Schema.Boolean,
          message: Schema.Boolean,
          elements: Html
        }).make({
          init: () => true,
          update: (_, shown) => shown,
          view: (shown, h) => {
            const body = h.scoped((s) => {
              const waits = Waits(s, { key: "w" })
              return where === "the receiver's slot" ? waits : Shell(s, { key: "s", slots: { inner: waits } })
            })
            return h.main(shown ? Frame(h, { key: "f", slots: { body } }) : null)
          }
        })
        const { app, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
        const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
        let adopted = false
        yield* Effect.forkChild(Effect.andThen(root.adopted, Effect.sync(() => adopted = true)))
        root.send(false)
        yield* tick
        assert.isTrue(adopted)
      }).pipe(Effect.scoped)
  )

  it.effect.each(
    [[false, "slot"], [true, "headless child's view"]] as const
  )(
    "keep the server's nodes under the predicate their author last wrote them with, when the receiver resumes (%s: its %s draws them)",
    ([headless]) =>
      Effect.gen(function*() {
        const Page = Component.define({
          name: "Page",
          scoped: false,
          model: Schema.Boolean,
          message: Schema.Boolean,
          elements: Html
        }).make({
          init: () => false,
          update: (_, changed) => changed,
          view: (changed, h) => {
            const written = () =>
              h.scoped(changed ? ({ model }) => model : ({ model }) => !model, (s) => Leaf(s, { key: "l" }))
            const body = headless ? Box(h, { key: "box", view: () => h.div(written()) }) : written()
            return h.main(Gated(h, { key: "f", slots: { body } }))
          }
        })
        leafInits = 0
        noteInits = 0
        const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
        const drawn = app.querySelector("p")
        const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
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
      ["a child of theirs whose state decodes late", "server", "at once", "late"],
      ["a child of theirs whose state fails to decode late", "client", "at once", "never"],
      ["them when their own state fails to decode late", "client", "never", "at once"]
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
                  : Effect.fail(new SchemaIssue.InvalidValue({ message: "an older Model" }))
              )
            ),
            encode: SchemaGetter.passthrough()
          }))
        let tips = 0
        let dots = 0
        const Tip = Component.define({
          name: "Tip",
          scoped: false,
          model: Schema.String,
          message: Schema.Never,
          elements: Html
        }).make({ init: () => side(tips++), update: (model) => model, view: (tip, h) => h.i(tip) })
        const Dot = Component.define({
          name: "Dot",
          scoped: true,
          model: Schema.String,
          message: Schema.Never,
          elements: Html
        }).make({ init: () => side(dots++), update: (model) => model, view: (dot, h) => h.u(dot) })
        const Mid = Component.define({
          name: "Mid",
          scoped: false,
          model: stored(mid),
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => "mid",
          update: (model) => model,
          view: (_, h) => h.div(Tip(h, { key: "t" }), h.scoped((s) => Dot(s, { key: "d" })))
        })
        const Card = Component.define({
          name: "Card",
          scoped: true,
          model: stored(card),
          message: Schema.Never,
          elements: Html
        }).make({ init: () => "card", update: (model) => model, view: (_, h) => h.article(Mid(h, { key: "m" })) })
        const Page = Component.define({
          name: "Page",
          scoped: false,
          model: Schema.Number,
          message: Schema.Number,
          elements: Html
        }).make({
          init: () => 0,
          update: (_, step) => step,
          view: (step, h) =>
            h.main(
              step === 0
                ? Gated(h, { key: "f", slots: { body: h.scoped((s) => Card(s, { key: "c" })) } })
                : step === 2
                ? h.scoped((s) => Card(s, { key: "c" }))
                : null
            )
        })
        const { app, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
        const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
        root.send(1)
        yield* tick
        root.send(2)
        yield* tick
        yield* Deferred.succeed(decoding, undefined)
        yield* tick
        assert.deepStrictEqual(["i", "u"].map((tag) => app.querySelector(tag)?.textContent), [from, from])
      }).pipe(Effect.scoped)
  )

  it.effect("stop decoding their state when they're no longer written as it decodes", () =>
    Effect.gen(function*() {
      let decoding = 0
      const Slowly = Component.define({
        name: "Slowly",
        scoped: true,
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
        message: Schema.Never,
        elements: Html
      }).make({ init: () => "slowly", update: (model) => model, view: (text, h) => h.b(text) })
      const Page = Component.define({
        name: "Page",
        scoped: false,
        model: Schema.Boolean,
        message: Schema.Boolean,
        elements: Html
      }).make({
        init: () => true,
        update: (_, shown) => shown,
        view: (shown, h) => h.main(shown ? h.scoped((s) => Slowly(s, { key: "s" })) : null)
      })
      const { app, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
      const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
      yield* tick
      assert.strictEqual(decoding, 1)
      root.send(false)
      yield* tick
      assert.strictEqual(decoding, 0)
    }).pipe(Effect.scoped))

  it.effect.skipIf(process.versions.bun !== undefined || process.versions.deno !== undefined)(
    "leave with an author removed before it drew them, while another component waits: one made at its key starts them afresh",
    () =>
      Effect.gen(function*() {
        let passed: Array<WeakRef<object>> = []
        const Author = Component.define({
          name: "Author",
          scoped: false,
          props: Schema.Struct({ drawn: Schema.Boolean }),
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => {
            passed.push(new WeakRef(h.props))
            return h.article(h.props.drawn ? h.scoped((s) => Leaf(s, { key: "l" })) : null)
          }
        })
        const Page = Component.define({
          name: "Page",
          scoped: false,
          props: Schema.Struct({ drawn: Schema.Boolean }),
          model: Schema.Number,
          message: Schema.Number,
          elements: Html
        }).make({
          init: () => 0,
          update: (_, step) => step,
          view: (step, h) =>
            h.main(
              step === 1 ? null : Author(h, { key: "a", props: { drawn: step === 2 || h.props.drawn } }),
              Gated(h, { key: "g", slots: { body: h.i() } })
            )
        })
        leafInits = 0
        noteInits = 0
        const { app, state } = yield* serve(HtmlServer.renderToHtml(Page, { drawn: true }))
        passed = []
        const root = yield* BrowserHost.mountEffect(Page, { drawn: false }, app, { state })
        root.send(1)
        yield* tick
        yield* collectGarbage
        assert.isUndefined(passed[0].deref())
        root.send(2)
        yield* tick
        assert.strictEqual(app.querySelector("p")?.textContent, "client-initial")
      }).pipe(Effect.scoped)
  )

  const labels: Array<string> = []
  const decoded: Array<string> = []
  const Labelled = Component.define({
    name: "Labelled",
    scoped: true,
    props: Schema.Struct({ label: Schema.String }),
    model: Schema.String.pipe(Schema.decode({
      decode: SchemaGetter.transform((label: string) => {
        decoded.push(label)
        return label
      }),
      encode: SchemaGetter.passthrough()
    })),
    message: Schema.Never,
    elements: Html
  }).make({
    init: ($) => {
      labels.push($.props.label)
      return $.props.label
    },
    update: (model) => model,
    view: (label, h) => h.b(label)
  })

  it.effect.each(
    [
      ["props", false, ["new l"], ["new l"], []],
      ["props", true, ["new l"], ["old l"], ["old l"]],
      ["key", true, ["new m"], ["new m"], []],
      ["order", false, ["new m", "new l"], ["new m", "new l"], []]
    ] as const
  )(
    "start with the %s their author last wrote them with, when the receiver resumes (drawn by the server: %s)",
    ([last, drawn, started, shown, read]) =>
      Effect.gen(function*() {
        const Page = Component.define({
          name: "Page",
          scoped: false,
          model: Schema.Boolean,
          message: Schema.Boolean,
          elements: Html
        }).make({
          init: () => false,
          update: (_, changed) => changed,
          view: (changed, h) => {
            const keys = last === "order" ? changed ? ["m", "l"] : ["l", "m"] : [changed && last === "key" ? "m" : "l"]
            const body = h.scoped(
              ({ model }) => model || drawn,
              (s) => keys.map((key) => Labelled(s, { key, props: { label: (changed ? "new " : "old ") + key } }))
            )
            return h.main(Gated(h, { key: "f", slots: { body } }))
          }
        })
        const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
        labels.length = decoded.length = 0
        const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
        root.send(true)
        yield* tick
        yield* open
        yield* root.adopted
        yield* tick
        assert.deepStrictEqual(
          [labels, Array.from(app.querySelectorAll("b"), (label) => label.textContent), decoded],
          [started, shown, read]
        )
      }).pipe(Effect.scoped)
  )

  it.effect.each(
    ["a headless child's view", "a slot nobody places", "a slot its receiver no longer places"] as const
  )(
    "don't start when their author last wrote them out of %s, as the receiver resumes",
    (out) =>
      Effect.gen(function*() {
        const Two = Component.define({
          name: "Two",
          scoped: false,
          props: Schema.Struct({ open: Schema.Boolean }),
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body", "unplaced"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.section(h.props.open ? h.slots.body : null)
        })
          .pipe(Component.provide(Layer.effect(Slow, Effect.suspend(() => Effect.as(gate, "ready")))))
        const Page = Component.define({
          name: "Page",
          scoped: false,
          model: Schema.Boolean,
          message: Schema.Boolean,
          elements: Html
        }).make({
          init: () => false,
          update: (_, moved) => moved,
          view: (moved, h) => {
            const written = h.scoped((s) => Labelled(s, { key: "l", props: { label: "drawn" } }))
            const closes = out === "a slot its receiver no longer places"
            const body = out === "a headless child's view"
              ? Box(h, { key: "box", view: () => h.div(moved ? null : written) })
              : moved && !closes
              ? null
              : written
            const unplaced = moved && out === "a slot nobody places" ? written : null
            return h.main(Two(h, { key: "f", props: { open: !moved || !closes }, slots: { body, unplaced } }))
          }
        })
        const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
        labels.length = decoded.length = 0
        const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
        root.send(true)
        yield* tick
        yield* open
        yield* root.adopted
        yield* tick
        assert.deepStrictEqual([labels, decoded, app.querySelector("b")], [[], [], null])
      }).pipe(Effect.scoped)
  )

  it.effect.each(
    [[true, "keep the server's nodes"], [false, "don't start"]] as const
  )(
    "are asked their predicate when the receiver resumes after a render that wasn't their author's (%s: they %s)",
    ([allowed]) =>
      Effect.gen(function*() {
        const Middle = Component.define({
          name: "Middle",
          scoped: false,
          model: Schema.Number,
          message: Schema.Null,
          elements: Html,
          slots: ["passed"]
        }).make({
          init: () => 0,
          update: (renders) => renders + 1,
          view: (_, h) =>
            h.div(h.button.onClick(null).children("again"), Gated(h, { key: "f", slots: { body: h.slots.passed } }))
        })
        const Page = Component.define({
          name: "Page",
          scoped: false,
          props: Schema.Struct({ allowed: Schema.Boolean }),
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            h.main(
              Middle(h, {
                key: "m",
                slots: { passed: h.scoped(({ props }) => props.allowed, (s) => Leaf(s, { key: "l" })) }
              })
            )
        })
        leafInits = 0
        noteInits = 0
        const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Page, { allowed: true }))
        const drawn = app.querySelector("p")
        const root = yield* BrowserHost.mountEffect(Page, { allowed }, app, { state })
        app.querySelector("button")!.click()
        yield* tick
        yield* open
        yield* root.adopted
        yield* tick
        assert.strictEqual(app.querySelector("p"), allowed ? drawn : null)
      }).pipe(Effect.scoped)
  )

  it.effect.each(
    [["Author", "client-initial"], ["Outer", "server-draft"]] as const
  )(
    "start from what's left of their state when one made at its key replaces %s, removed as it waited for its Layer",
    ([removed, draft]) =>
      Effect.gen(function*() {
        const slow = Component.provide(Layer.effect(Slow, Effect.suspend(() => Effect.as(gate, "ready"))))
        const Author = Component.define({
          name: "Author",
          scoped: false,
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.article(h.scoped((s) => Leaf(s, { key: "l" })))
        }).pipe(slow)
        const Outer = Component.define({
          name: "Outer",
          scoped: true,
          model: Schema.Null,
          message: Schema.Never,
          elements: Html
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.article(h.scoped((s) => Leaf(s, { key: "l" })))
        }).pipe(slow)
        const Page = Component.define({
          name: "Page",
          scoped: false,
          model: Schema.Number,
          message: Schema.Number,
          elements: Html
        }).make({
          init: () => 0,
          update: (_, step) => step,
          view: (step, h) =>
            h.main(
              removed === "Outer"
                ? Frame(h, { key: "at" + step, slots: { body: h.scoped((s) => Outer(s, { key: "o" })) } })
                : step === 1
                ? null
                : Author(h, { key: "a" }),
              Gated(h, { key: "g", slots: { body: h.i() } })
            )
        })
        leafInits = 0
        noteInits = 0
        const { app, state } = yield* serve(HtmlServer.renderToHtml(Page, {}))
        const root = yield* BrowserHost.mountEffect(Page, {}, app, { state })
        root.send(1)
        yield* tick
        root.send(2)
        yield* tick
        assert.strictEqual(app.querySelector("p")?.textContent, draft)
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
