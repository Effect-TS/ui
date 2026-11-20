import { Child, Component, UiSchema, View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

// The layout changes of EFF-4038's probes P1, P2 and P8, with the form a "model" child: each keeps its draft.

const FormMsg = UiSchema.TaggedEnum({ Typed: {} })
const Form = Component.define({
  name: "Form",
  lifetime: "model",
  model: Schema.String,
  message: FormMsg,
  elements: Html
}).make({
  init: () => "",
  update: (model) => model + "a",
  view: (model, h) => h.button.onClick(FormMsg.Typed()).children("draft:" + model)
})
const Card = Component.define({
  name: "Card",
  lifetime: "view",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html,
  slots: ["body"]
}).make({ init: () => null, update: (model) => model, view: (_, h) => h.section(h.slots.body) })
const ToggleMsg = UiSchema.TaggedEnum({ ClickedToggle: {} })
const Collapsible = Component.define({
  name: "Collapsible",
  lifetime: "view",
  model: Schema.Boolean,
  message: ToggleMsg,
  elements: Html,
  slots: ["body"]
}).make({
  init: () => true,
  update: (open) => !open,
  view: (open, h) => h.section(h.button.onClick(ToggleMsg.ClickedToggle()).children("toggle"), open && h.slots.body)
})

const PageMsg = UiSchema.TaggedEnum({ Toggled: {} })
const page = (view: (toggled: boolean, form: () => View.Content<any, any>, h: any) => View.Content<any, any>) =>
  Component.define({ name: "Page", lifetime: "view", model: Schema.Boolean, message: PageMsg, elements: Html }).make({
    children: { form: Form },
    init: () => false,
    update: (toggled) => !toggled,
    view: (toggled, h) => view(toggled, () => h.children.form(), h)
  })

type Root = TestHost.TestRoot<any, any, any>
const settle = (f: () => void) => Effect.andThen(Effect.sync(f), TestHost.settle)
const click = (root: Root, text: string) => settle(() => Locator.fire(root.get(Locator.text(text)), "click"))
const toggle = (root: Root) => settle(() => root.send(PageMsg.Toggled()))

describe("model children", () => {
  it.effect.each([
    {
      name: "P1: wrapped in a slot component",
      view: page((wide, form, h) => h.main(wide ? Card(h, { key: "card", slots: { body: form() } }) : form())),
      relayout: toggle
    },
    {
      name: "P2: moved between two elements",
      view: page((moved, form, h) => h.main(h.aside(!moved && form()), h.article(moved && form()))),
      relayout: toggle
    },
    {
      name: "P9: left out of a component root, then placed again",
      view: page((hidden, form, h) => Card(h, { key: "card", slots: { body: hidden ? null : form() } })),
      relayout: (root: Root) => Effect.andThen(toggle(root), toggle(root))
    },
    {
      name: "P8: in a slot its receiver stops placing, then places again",
      view: page((_, form, h) => Collapsible(h, { key: "c", slots: { body: form() } })),
      relayout: (root: Root) => Effect.andThen(click(root, "toggle"), click(root, "toggle"))
    }
  ])("keeps its draft $name", ({ relayout, view }) =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(view, {})
      yield* TestHost.settle
      yield* click(root, "draft:")
      yield* relayout(root)
      assert.include(root.text(), "draft:a")
      assert.notInclude(root.log().map((entry) => entry._tag), "Unmounted")
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("moves a card listed on the board between columns, keeping its draft", () =>
    Effect.gen(function*() {
      const Board = Component.define({
        name: "Board",
        lifetime: "view",
        model: Schema.Literals(["todo", "done"]),
        message: PageMsg,
        elements: Html
      }).make({
        children: { cards: Child.keyed(Form, { props: () => [["c1", {}]] }) },
        init: () => "todo" as const,
        update: (column) => column === "todo" ? "done" : "todo",
        view: (column, h) =>
          h.main(
            Card(h, { key: "todo", slots: { body: column === "todo" ? h.children.cards("c1") : null } }),
            Card(h, { key: "done", slots: { body: column === "done" ? h.children.cards("c1") : null } })
          )
      })
      const root = yield* TestHost.mount(Board, {})
      yield* TestHost.settle
      yield* click(root, "draft:")
      yield* toggle(root)
      assert.strictEqual(root.text(), "draft:a")
      assert.notInclude(root.log().map((entry) => entry._tag), "Unmounted")
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("lists a model page by its route's path, so it lives as long as the route", () =>
    Effect.gen(function*() {
      const Nav = UiSchema.TaggedEnum({ Went: { path: Schema.String }, ClickedPanel: {} })
      const App = Component.define({
        name: "App",
        lifetime: "view",
        model: Schema.Struct({ path: Schema.String, panel: Schema.Boolean }),
        message: Nav,
        elements: Html
      }).make({
        children: { page: Child.keyed(Form, { props: (model) => [[model.path, {}]] }) },
        init: () => ({ path: "/a", panel: false }),
        update: (model, message) =>
          message._tag === "Went" ? { ...model, path: message.path } : { ...model, panel: !model.panel },
        view: (model, h) => h.main(model.panel ? h.p("panel") : h.children.page(model.path))
      })
      const root = yield* TestHost.mount(App, {})
      yield* TestHost.settle
      yield* click(root, "draft:")
      yield* settle(() => root.send(Nav.ClickedPanel()))
      yield* settle(() => root.send(Nav.ClickedPanel()))
      assert.strictEqual(root.text(), "draft:a")
      yield* settle(() => root.send(Nav.Went({ path: "/b" })))
      yield* settle(() => root.send(Nav.Went({ path: "/a" })))
      assert.strictEqual(root.text(), "draft:")
      assert.deepStrictEqual(
        root.log().flatMap((entry) => entry._tag === "Unmounted" ? [entry.path] : []),
        ["/App/Form[page[/a]]", "/App/Form[page[/b]]"]
      )
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("mounts a model component as the root", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Form, {})
      yield* TestHost.settle
      yield* click(root, "draft:")
      assert.strictEqual(root.text(), "draft:a")
    }).pipe(Effect.provide(TestHost.layer())))

  it("rejects what the types reject through an erased component", () => {
    const erased: Component.Any = Form
    assert.throws(() => (erased as any)(undefined, {}), /Form has lifetime "model", so it isn't called in a view/)
    assert.throws(() => Child.one(Card as Component.Any), /Child\.one Card, and its lifetime is "view"/)
  })
})

// A child the view doesn't place, wherever the view leaves it out: it gets sends while hidden.

const CounterMsg = UiSchema.TaggedEnum({ Ping: {} })
const CounterEvents = UiSchema.TaggedEnum({ Pinged: {} })
const Counter = Component.define({
  name: "Counter",
  lifetime: "model",
  model: Schema.Number,
  message: CounterMsg,
  events: CounterEvents,
  receives: ["Ping"],
  elements: Html
}).make({
  init: () => 0,
  update: (pings, _, $) => $.set(pings + 1).emit(CounterEvents.Pinged()),
  view: (pings, h) => h.p("pings:" + pings)
})
const CounterRef = Counter.ref("counter")
const Drawer = Component.define({
  name: "Drawer",
  lifetime: "view",
  model: Schema.Boolean,
  message: ToggleMsg,
  elements: Html,
  slots: ["body"]
}).make({
  init: () => false,
  update: (open) => !open,
  view: (open, h) => h.section(h.button.onClick(ToggleMsg.ClickedToggle()).children("open"), open && h.slots.body)
})
const HostMsg = UiSchema.TaggedEnum({ Ping: {}, Show: {} })
const host = (view: (shown: boolean, counter: () => View.Child<any, any>, h: any) => View.Content<any, any>) =>
  Component.define({ name: "Host", lifetime: "view", model: Schema.Boolean, message: HostMsg, elements: Html }).make({
    children: { counter: Counter },
    init: () => false,
    update: (shown, message, $) => message._tag === "Ping" ? $.send(CounterRef, CounterMsg.Ping()) : !shown,
    view: (shown, h) => view(shown, () => h.children.counter(), h)
  })
const show = (root: Root) => settle(() => root.send(HostMsg.Show()))

describe("model children the view leaves out", () => {
  it.effect.each([
    {
      name: "computed but left out of an element root",
      view: host((shown, counter, h) => {
        const node = counter()
        return h.main(shown ? node : null)
      }),
      show
    },
    {
      name: "left out of a component root",
      view: host((shown, counter, h) => Card(h, { key: "card", slots: { body: shown ? counter() : null } })),
      show
    },
    {
      name: "the root once shown, text while hidden",
      view: host((shown, counter) => shown ? counter() : View.text("hidden")),
      show
    },
    {
      name: "in a slot that never opened",
      view: host((_, counter, h) => Drawer(h, { key: "drawer", slots: { body: counter() } })),
      show: (root: Root) => click(root, "open")
    }
  ])("gets a send while hidden: $name", ({ show, view }) =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(view, {})
      yield* TestHost.settle
      yield* settle(() => root.send(HostMsg.Ping()))
      yield* show(root)
      assert.include(root.text(), "pings:1")
      assert.notInclude(root.log().map((entry) => entry._tag), "Unmounted")
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("a story and a scene keep a child left out of a component root", () =>
    Effect.gen(function*() {
      const Host = host((shown, counter, h) =>
        Card(h, {
          key: "card",
          slots: {
            body: [
              h.button.onClick(HostMsg.Ping()).children("ping"),
              h.button.onClick(HostMsg.Show()).children("show"),
              shown ? counter() : null
            ]
          }
        })
      )
      const s = yield* Story.make(Host, {})
      s.send(HostMsg.Ping()).send(HostMsg.Show())
      assert.deepStrictEqual(s.children, { counter: 1 })
      const scene = yield* Scene.make(Host, {})
      scene.click("ping").expect(Locator.text("pings:1")).toBeAbsent()
        .click("show").expect(Locator.text("pings:1")).toExist()
    }))
})

// A story runs a model child's pure transitions as the renderer does.

const absent = Component.define({
  name: "Host",
  lifetime: "view",
  model: Schema.Boolean,
  message: HostMsg,
  elements: Html
}).make({
  children: { counter: Child.optional(Counter, { props: (shown) => shown ? {} : null }) },
  init: () => false,
  update: (shown, message, $) => message._tag === "Ping" ? $.send(CounterRef, CounterMsg.Ping()) : !shown,
  view: (shown, h) => h.div(shown ? h.children.counter?.() : null)
})

const Greeter = Component.define({
  name: "Greeter",
  lifetime: "model",
  model: Schema.Null,
  message: Schema.Never,
  events: CounterEvents
}).make({
  init: ($) => $.set(null).emit(CounterEvents.Pinged()),
  update: (model) => model,
  view: () => View.text("hi")
})
const Greeted = Component.define({
  name: "Greeted",
  lifetime: "view",
  model: Schema.Number,
  message: Schema.Literal("Greeted")
})
  .make({
    children: { greeter: Child.one(Greeter, { onEmit: () => "Greeted" as const }) },
    init: () => 0,
    update: (greeted) => greeted + 1,
    view: () => View.text("page")
  })

const TabMsg = UiSchema.TaggedEnum({ Ping: {}, Show: { tab: Schema.String }, Heard: { tab: Schema.String } })
const Tabs = Component.define({
  name: "Tabs",
  lifetime: "view",
  model: Schema.Struct({ tab: Schema.String, heard: Schema.Array(Schema.String) }),
  message: TabMsg,
  elements: Html
}).make({
  children: { counter: Child.one(Counter, { onEmit: (_, model) => TabMsg.Heard({ tab: model.tab }) }) },
  init: () => ({ tab: "counter", heard: [] }),
  update: (model, message, $) =>
    TabMsg.match(message, {
      Ping: () => $.send(CounterRef, CounterMsg.Ping()),
      Show: ({ tab }) => ({ ...model, tab }),
      Heard: ({ tab }) => ({ ...model, heard: [...model.heard, tab] })
    }),
  view: (model, h) => h.div(model.tab === "counter" ? h.children.counter() : "other")
})

describe("a story matches the renderer", () => {
  it.effect("drops a send to an optional child that isn't listed", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(absent, {})
      yield* TestHost.settle
      yield* settle(() => root.send(HostMsg.Ping()))
      yield* show(root)
      assert.strictEqual(root.text(), "pings:0")
      const s = yield* Story.make(absent, {})
      s.send(HostMsg.Ping()).send(HostMsg.Show())
      assert.deepStrictEqual(s.children, { counter: 0 })
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("takes what a hidden child emits from init", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Greeted, {})
      yield* TestHost.settle
      assert.strictEqual(root.model(), 1)
      const s = yield* Story.make(Greeted, {})
      assert.strictEqual(s.model, 1)
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("gives onEmit the parent's current Model while the child is hidden", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Tabs, {})
      yield* TestHost.settle
      yield* settle(() => root.send(TabMsg.Ping()))
      yield* settle(() => root.send(TabMsg.Show({ tab: "other" })))
      yield* settle(() => root.send(TabMsg.Ping()))
      assert.deepStrictEqual(root.model()?.heard, ["counter", "other"])
      const s = yield* Story.make(Tabs, {})
      s.send(TabMsg.Ping()).send(TabMsg.Show({ tab: "other" })).send(TabMsg.Ping())
      assert.deepStrictEqual(s.model.heard, ["counter", "other"])
    }).pipe(Effect.provide(TestHost.layer())))
})
