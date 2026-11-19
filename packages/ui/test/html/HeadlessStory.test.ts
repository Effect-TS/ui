import { Component, UiSchema, View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Dialog, type Item, Menu } from "./fixtures/headless.ts"

const items: ReadonlyArray<Item> = [
  { id: "a", label: "Archive" },
  { id: "b", label: "Block", disabled: true },
  { id: "c", label: "Copy" }
]

const ToolbarMessage = UiSchema.TaggedEnum({ Picked: { id: Schema.String }, Clicked: { id: Schema.String } })

const Toolbar = Component.define({
  name: "Toolbar",
  lifetime: "view",
  model: Schema.Array(Schema.String),
  message: ToolbarMessage,
  elements: Html
}).make({
  init: () => [],
  update: (log, message) => [...log, message._tag + " " + message.id],
  view: (log, h) =>
    h.div(
      Menu(h, {
        key: "actions",
        props: { items },
        onEmit: (event) => ToolbarMessage.Picked({ id: event.id }),
        view: (m) =>
          h.div(
            m.trigger(h.button).children("Actions"),
            m.popup(h.div).children(
              m.input(h.input.attr("aria-label", "Filter actions")),
              m.visible.length === 0 && h.p("No actions found."),
              h.ul.children(m.visible.map((item) =>
                m.item(h.li.key(item.id), item)
                  .onClick(ToolbarMessage.Clicked({ id: item.id }))
                  .children(item.label)
              ))
            )
          )
      }),
      h.output(log.join(", "))
    )
})

const filter = Locator.attr("aria-label", "Filter actions")
const labels = (story: { readonly all: (locator: Locator.Locator) => ReadonlyArray<Locator.Node> }) =>
  story.all(Locator.tag("li")).map(Locator.textOf)

const trigger = Locator.text("Actions")

/** A consumer's closure for the author's stories: the least markup the Menu's parts need. */
const standIn = {
  elements: Html,
  view: (
    m: Component.Headless.Parts<typeof Menu>,
    h: View.Helper<never, { readonly items: ReadonlyArray<Item> }> & View.Tags<Html.Elements, never>
  ) =>
    h.div(
      m.trigger(h.button).children("Actions"),
      m.popup(h.div).children(
        m.input(h.input.attr("aria-label", "Filter actions")),
        h.ul.children(m.visible.map((item) => m.item(h.li.key(item.id), item).children(item.label)))
      )
    )
}

const Ids = Component.define({
  name: "Ids",
  lifetime: "view",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) =>
    h.div(
      h.span.id(h.id("item-a", "b")).children("one"),
      h.span.id(h.id("item", "a-b")).children("two"),
      h.span.id(h.id("item")).children("three")
    )
})

describe("headless components in a story", () => {
  it.effect(
    "arrow keys skip a disabled row and wrap, and typeahead on the trigger reads the labels and starts over",
    () =>
      Effect.gen(function*() {
        const s = yield* Scene.make(Menu, { items }, standIn)
        const active = () => Story.parts(Menu, s.current).active
        // Block is disabled, so typing its first letter moves nowhere.
        s.fire(trigger, "keydown", { key: "b" })
        assert.isNull(active())
        s.fire(trigger, "keydown", { key: "c" }).fire(trigger, "keydown", { key: "o" })
        assert.strictEqual(active(), "c")
        // No label starts with "coa", so typing starts over from "a".
        s.fire(trigger, "keydown", { key: "a" })
        assert.strictEqual(active(), "a")
        // Up from the first row wraps to the last, down wraps back, and from there skips Block.
        s.fire(filter, "keydown", { key: "ArrowUp" })
        assert.strictEqual(active(), "c")
        s.fire(filter, "keydown", { key: "ArrowDown" })
        assert.strictEqual(active(), "a")
        s.fire(filter, "keydown", { key: "ArrowDown" })
        assert.strictEqual(active(), "c")
        s.fire(filter, "keydown", { key: "ArrowUp" })
        assert.strictEqual(active(), "a")
        assert.strictEqual(
          s.get(filter).attrs?.["aria-activedescendant"],
          s.get(Locator.text("Archive")).attrs?.id
        )
        s.fire(filter, "keydown", { key: "Enter" })
          .emitted({ _tag: "Picked", id: "a" })
      })
  )

  it.effect("an item that new props removed is no longer active, and Enter picks nothing", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Menu, { items }, standIn)
      s.fire(filter, "keydown", { key: "ArrowUp" })
      assert.strictEqual(Story.parts(Menu, s.current).active, "c")
      s.props({ items: [items[0]!] })
      assert.isNull(Story.parts(Menu, s.current).active)
      assert.isUndefined(s.get(filter).attrs?.["aria-activedescendant"])
      s.fire(filter, "keydown", { key: "Enter" })
      assert.deepStrictEqual(s.current.emitted, [])
    }))

  it("parts need no runtime, and an id outside a mount is under the component's own name", () => {
    // No story and no host: the Model from init, the props, and nothing else.
    const m = Story.parts(Menu, { model: Menu.init({ items }).model, props: { items } })
    assert.deepStrictEqual(m.visible, items)
    const Bare = Component.define({
      name: "Bare",
      lifetime: "view",
      model: Schema.Null,
      message: Schema.Never,
      elements: Html
    }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => h.div(m.trigger(h.button).children("Actions"), h.span.id(h.id("label")).children("label"))
    })
    const view = Bare.view(null, {}) as View.Element<never>
    const [button, span] = view.children as ReadonlyArray<View.Element<never>>
    assert.strictEqual(button!.attrs["aria-controls"], "_1b_Menu-popup")
    assert.strictEqual(span!.attrs.id, "_1b_Bare-label")
  })

  it("a part checks the tag name it's given, as its type does", () => {
    const d = Story.parts(Dialog, { model: { open: false }, props: { label: "Confirm" } })
    const h = View.makeHelper<never, {}, Html.Elements>({}, Html)
    assert.strictEqual(d.title(h.h2).tag, "h2")
    // Both are HTMLHeadingElement, but the part was declared for <h2>.
    assert.throws(() => d.title(h.h3 as any), /a part for <h2> was given <h3>/)
  })

  it.effect("ids of one instance differ whenever the name or the key does", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Ids, {})
      const ids = s.all(Locator.tag("span")).map((span) => span.attrs?.id)
      assert.strictEqual(new Set(ids).size, 3, ids.join(" "))
    }))

  it.effect("an author's story runs the component with a stand-in view, and reads its parts", () =>
    Effect.gen(function*() {
      // The stand-in view is written in place here, where its parameters need no annotation.
      const s = yield* Scene.make(Menu, { items }, {
        elements: Html,
        view: (m, h) =>
          h.div(
            m.trigger(h.button).children("Actions"),
            m.popup(h.div).children(
              m.input(h.input.attr("aria-label", "Filter actions")),
              h.ul.children(m.visible.map((item) => m.item(h.li.key(item.id), item).children(item.label)))
            )
          )
      })
      s.click("Actions")
      assert.strictEqual(s.get(Locator.text("Actions")).attrs?.["aria-expanded"], "true")
      s.fire(filter, "input", { value: "co", checked: false })
      const m = Story.parts(Menu, s.current)
      assert.deepStrictEqual(m.visible.map((item) => item.label), ["Copy"])
      assert.strictEqual(m.active, "c")
      assert.deepStrictEqual(labels(s), ["Copy"])
      s.fire(filter, "keydown", { key: "Enter" })
      assert.isTrue(s.defaultPrevented)
      s.emitted({ _tag: "Picked", id: "c" })
      assert.isFalse(Story.parts(Menu, s.current).open)
    }))

  it.effect("a consumer's story shows the child expanded, and runs only the consumer's layer", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Toolbar, {})
      // Expanded from the Menu's init Model.
      assert.strictEqual(s.get(Locator.text("Actions")).attrs?.["aria-expanded"], "false")
      assert.deepStrictEqual(labels(s), ["Archive", "Block", "Copy"])
      s.givenChild(Menu, "actions", { open: true, query: "co", active: "c", typed: "", focused: [] })
      assert.strictEqual(s.get(Locator.text("Actions")).attrs?.["aria-expanded"], "true")
      assert.deepStrictEqual(labels(s), ["Copy"])
      // The row has the Menu's layer and the Toolbar's: the story runs the Toolbar's.
      s.click("Copy")
        .childEmit(Menu, "actions", { _tag: "Picked", id: "c" })
        .expect(Locator.tag("output")).toHaveText("Clicked c, Picked c")
      // Only the Menu handles a click on its trigger, and a story doesn't run the Menu's update.
      assert.throws(() => s.click("Actions"), /only \/Toolbar\/Menu\[actions\] handles "click"/)
    }))

  it.effect("an author's story renders with the vocabulary it's given", () =>
    Effect.gen(function*() {
      const Neutral = Component.define({ name: "Neutral", lifetime: "view", model: Schema.Null, message: Schema.Never })
        .make({
          init: () => null,
          update: (model) => model,
          parts: (_, p) => ({ root: p.part((b) => b.attr("role", "button")) })
        })
      const s = yield* Scene.make(Neutral, {}, { elements: Html, view: (p, h) => p.root(h.button).children("neutral") })
      assert.strictEqual(s.get(Locator.text("neutral")).tag, "button")
    }))

  it.effect("an author's story runs every part layer of one event, and each layer's own preventDefault", () =>
    Effect.gen(function*() {
      const Dual = Component.define({
        name: "Dual",
        lifetime: "view",
        model: Schema.Number,
        message: Schema.Literals(["one", "ten"]),
        elements: Html
      }).make({
        init: () => 0,
        update: (count, message) => count + (message === "one" ? 1 : 10),
        parts: (count, p) => ({
          count,
          one: p.part("button", (b) => b.onClick("one", { preventDefault: true })),
          ten: p.part("button", (b) => b.onClick("ten"))
        })
      })
      const s = yield* Scene.make(Dual, {}, {
        elements: Html,
        view: (p, h) => p.ten(p.one(h.button)).onClick(() => undefined, { preventDefault: false }).children("both")
      })
      s.click("both").parts((p) => assert.strictEqual(p.count, 11))
      assert.isTrue(s.defaultPrevented)
    }))

  it.effect("a consumer's story cancels the default when a child's layer always does", () =>
    Effect.gen(function*() {
      const Guard = Component.define({
        name: "Guard",
        lifetime: "view",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make(
        {
          init: () => null,
          update: (model) => model,
          parts: (_, p) => ({ link: p.part("a", (b) => b.onClick(() => undefined, { preventDefault: "always" })) })
        }
      )
      const Clicked = UiSchema.TaggedEnum({ Clicked: {} })
      const Page = Component.define({
        name: "Page",
        lifetime: "view",
        model: Schema.Number,
        message: Clicked,
        elements: Html
      }).make({
        init: () => 0,
        update: (count) => count + 1,
        view: (_, h) =>
          Guard(
            h,
            { key: "g", view: (p) => p.link(h.a).onClick(Clicked.Clicked()).children("go") }
          )
      })
      const s = yield* Scene.make(Page, {})
      // Clicked is Page's only message.
      s.click("go").expectHandled()
      assert.isTrue(s.defaultPrevented)
    }))

  it.effect("an author's story runs its own layers around and inside a headless child's closure", () =>
    Effect.gen(function*() {
      const Inner = Component.define({ name: "Inner", lifetime: "view", model: Schema.Null, message: Schema.Never })
        .make({
          init: () => null,
          update: (model) => model,
          parts: () => ({})
        })
      const Outer = Component.define({
        name: "Outer",
        lifetime: "view",
        model: Schema.Number,
        message: Schema.Literals(["one", "ten", "hundred"]),
        elements: Html
      }).make({
        init: () => 0,
        update: (count, message) => count + (message === "one" ? 1 : message === "ten" ? 10 : 100),
        parts: (count, p) => ({
          count,
          one: p.part("div", (b) => b.onClick("one", { preventDefault: true })),
          ten: p.part("div", (b) => b.onClick("ten")),
          hundred: p.part("button", (b) => b.onClick("hundred"))
        })
      })
      const s = yield* Scene.make(Outer, {}, {
        elements: Html,
        view: (p, h) =>
          p.ten(p.one(h.div)).children(
            h.button("hit"),
            Inner(h, { key: "inner", view: () => p.hundred(h.button).children("inside") })
          )
      })
      s.click("hit")
      s.parts((p) => assert.strictEqual(p.count, 11))
      assert.isTrue(s.defaultPrevented)
      s.click("inside")
      s.parts((p) => assert.strictEqual(p.count, 111))
    }))

  it.effect("an author's story drops on a part's drop target", () =>
    Effect.gen(function*() {
      const Zone = Component.define({
        name: "Zone",
        lifetime: "view",
        model: Schema.String,
        message: Schema.String,
        elements: Html
      })
        .make({
          init: () => "",
          update: (_, message) => message,
          parts: (dropped, p) => ({
            dropped,
            zone: p.part("div", (b) => b.onDrop((payload) => payload.data["text/plain"], { accepts: ["text/plain"] }))
          })
        })
      const s = yield* HtmlScene.make(Zone, {}, { elements: Html, view: (p, h) => p.zone(h.div).children("zone") })
      s.drop(Locator.text("zone"), { data: { "text/plain": "milk" } })
        .parts((p) => assert.strictEqual(p.dropped, "milk"))
      assert.isTrue(s.defaultPrevented)
    }))
})
