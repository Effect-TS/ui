import { Child, Component, UiSchema, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Locator, TestHost } from "@effect/ui/testing"
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
