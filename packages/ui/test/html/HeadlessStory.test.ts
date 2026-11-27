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

const ToolbarMessage = UiSchema.TaggedEnum({
  Picked: { id: Schema.String },
  Clicked: { id: Schema.String }
})

const Toolbar = Html.component({
  name: "Toolbar",
  model: Schema.Array(Schema.String),
  message: ToolbarMessage
}).make({
  init: () => [],
  update: ($, message) => [...$.model, message._tag + " " + message.id],
  view: (h, log) =>
    h.div(
      Menu(h, {
        key: "actions",
        props: { items },
        onEmit: (event) => ToolbarMessage.Picked({ id: event.id }),
        view: (menu) =>
          h.div(
            menu.trigger(h.button).children("Actions"),
            menu.popup(h.div).children(
              menu.input(h.input.attr("aria-label", "Filter actions")),
              menu.visible.length === 0 && h.p("No actions found."),
              h.ul.children(menu.visible.map((item) =>
                menu.item(h.li.key(item.id), item)
                  .on("click", ToolbarMessage.Clicked({ id: item.id }))
                  .children(item.label)
              ))
            )
          )
      }),
      h.output(log.join(", "))
    )
})

const filter = Locator.attr("aria-label", "Filter actions")
const labels = (
  story: {
    readonly all: (locator: Locator.Locator) => ReadonlyArray<Locator.Node>
  }
) => story.all(Locator.tag("li")).map(Locator.textOf)

const trigger = Locator.text("Actions")

/** A consumer's closure for the author's stories: the least markup the Menu's parts need. */
const standIn = {
  elements: Html,
  view: (
    menu: Component.Headless.Parts<typeof Menu>,
    h:
      & View.Helper<never, { readonly items: ReadonlyArray<Item> }>
      & View.Tags<Html.Elements, never>
  ) =>
    h.div(
      menu.trigger(h.button).children("Actions"),
      menu.popup(h.div).children(
        menu.input(h.input.attr("aria-label", "Filter actions")),
        h.ul.children(menu.visible.map((item) =>
          menu.item(h.li.key(item.id), item).children(item.label)
        ))
      )
    )
}

const Ids = Html.component({
  name: "Ids",
  model: Schema.Null,
  message: Schema.Never
})
  .make({
    init: () => null,
    update: ($) => $.model,
    view: (h) =>
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
        const scene = yield* Scene.make(Menu, { items }, standIn)
        const active = () => Story.parts(Menu, scene.current).active
        // Block is disabled, so typing its first letter moves nowhere.
        scene.fire(trigger, "keydown", { key: "b" })
        assert.isNull(active())
        scene.fire(trigger, "keydown", { key: "c" }).fire(trigger, "keydown", {
          key: "o"
        })
        assert.strictEqual(active(), "c")
        // No label starts with "coa", so typing starts over from "a".
        scene.fire(trigger, "keydown", { key: "a" })
        assert.strictEqual(active(), "a")
        // Up from the first row wraps to the last, down wraps back, and from there skips Block.
        scene.fire(filter, "keydown", { key: "ArrowUp" })
        assert.strictEqual(active(), "c")
        scene.fire(filter, "keydown", { key: "ArrowDown" })
        assert.strictEqual(active(), "a")
        scene.fire(filter, "keydown", { key: "ArrowDown" })
        assert.strictEqual(active(), "c")
        scene.fire(filter, "keydown", { key: "ArrowUp" })
        assert.strictEqual(active(), "a")
        assert.strictEqual(
          scene.get(filter).attrs?.["aria-activedescendant"],
          scene.get(Locator.text("Archive")).attrs?.id
        )
        scene.fire(filter, "keydown", { key: "Enter" })
          .emitted({ _tag: "Picked", id: "a" })
      })
  )

  it.effect("an item that new props removed is no longer active, and Enter picks nothing", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Menu, { items }, standIn)
      scene.fire(filter, "keydown", { key: "ArrowUp" })
      assert.strictEqual(Story.parts(Menu, scene.current).active, "c")
      scene.props({ items: [items[0]!] })
      assert.isNull(Story.parts(Menu, scene.current).active)
      assert.isUndefined(scene.get(filter).attrs?.["aria-activedescendant"])
      scene.fire(filter, "keydown", { key: "Enter" })
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it("parts need no runtime, and an id outside a mount is under the component's own name", () => {
    // No story and no host: the Model from init, the props, and nothing else.
    const menu = Story.parts(Menu, {
      model: Menu.init({ items }).model,
      props: { items }
    })
    assert.deepStrictEqual(menu.visible, items)
    const Bare = Html.component({
      name: "Bare",
      model: Schema.Null,
      message: Schema.Never
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        h.div(
          menu.trigger(h.button).children("Actions"),
          h.span.id(h.id("label")).children("label")
        )
    })
    const view = Bare.view(null, {}) as View.Element<never>
    const [button, span] = view.children as ReadonlyArray<View.Element<never>>
    assert.strictEqual(button!.attrs["aria-controls"], "_1b_Menu-popup")
    assert.strictEqual(span!.attrs.id, "_1b_Bare-label")
  })

  it("a part checks the tag name it's given, as its type does", () => {
    const dialog = Story.parts(Dialog, {
      model: { open: false },
      props: { label: "Confirm" }
    })
    const h = View.makeHelper<never, {}, Html.Elements>({}, Html)
    assert.strictEqual(dialog.title(h.h2).tag, "h2")
    // Both are HTMLHeadingElement, but the part was declared for <h2>.
    assert.throws(
      () => dialog.title(h.h3 as any),
      /a part for <h2> was given <h3>/
    )
  })

  it.effect("ids of one instance differ whenever the name or the key does", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Ids, {})
      const ids = scene.all(Locator.tag("span")).map((span) => span.attrs?.id)
      assert.strictEqual(new Set(ids).size, 3, ids.join(" "))
    }))

  it.effect("an author's story runs the component with a stand-in view, and reads its parts", () =>
    Effect.gen(function*() {
      // The stand-in view is written in place here, where its parameters need no annotation.
      const scene = yield* Scene.make(Menu, { items }, {
        elements: Html,
        view: (menu, h) =>
          h.div(
            menu.trigger(h.button).children("Actions"),
            menu.popup(h.div).children(
              menu.input(h.input.attr("aria-label", "Filter actions")),
              h.ul.children(menu.visible.map((item) =>
                menu.item(h.li.key(item.id), item).children(item.label)
              ))
            )
          )
      })
      scene.click("Actions")
      assert.strictEqual(
        scene.get(Locator.text("Actions")).attrs?.["aria-expanded"],
        "true"
      )
      scene.fire(filter, "input", { value: "co", checked: false })
      const menu = Story.parts(Menu, scene.current)
      assert.deepStrictEqual(menu.visible.map((item) => item.label), ["Copy"])
      assert.strictEqual(menu.active, "c")
      assert.deepStrictEqual(labels(scene), ["Copy"])
      scene.fire(filter, "keydown", { key: "Enter" })
      assert.isTrue(scene.defaultPrevented)
      scene.emitted({ _tag: "Picked", id: "c" })
      assert.isFalse(Story.parts(Menu, scene.current).open)
    }))

  it.effect("a consumer's story shows the child expanded, and runs only the consumer's layer", () =>
    Effect.gen(function*() {
      const scene = yield* Scene.make(Toolbar, {})
      // Expanded from the Menu's init Model.
      assert.strictEqual(
        scene.get(Locator.text("Actions")).attrs?.["aria-expanded"],
        "false"
      )
      assert.deepStrictEqual(labels(scene), ["Archive", "Block", "Copy"])
      scene.givenChild(Menu, "actions", {
        open: true,
        query: "co",
        active: "c",
        typed: "",
        focused: []
      })
      assert.strictEqual(
        scene.get(Locator.text("Actions")).attrs?.["aria-expanded"],
        "true"
      )
      assert.deepStrictEqual(labels(scene), ["Copy"])
      // The row has the Menu's layer and the Toolbar's: the story runs the Toolbar's.
      scene.click("Copy")
        .childEmit(Menu, "actions", { _tag: "Picked", id: "c" })
        .expect(Locator.tag("output")).toHaveText("Clicked c, Picked c")
      // Only the Menu handles a click on its trigger, and a story doesn't run the Menu's update.
      assert.throws(
        () => scene.click("Actions"),
        /only \/Toolbar\/Menu\[actions\] handles "click" at text "Actions"\. .*test what Toolbar does with the child's events with childEmit, or the interaction itself in a Play\.$/
      )
    }))

  it.effect("an author's story renders with the vocabulary it's given", () =>
    Effect.gen(function*() {
      const Neutral = Component.define({
        name: "Neutral",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          parts: (p) => ({ root: p.part((b) => b.attr("role", "button")) })
        })
      const scene = yield* Scene.make(Neutral, {}, {
        elements: Html,
        view: (neutral, h) => neutral.root(h.button).children("neutral")
      })
      assert.strictEqual(scene.get(Locator.text("neutral")).tag, "button")
    }))

  it.effect("an author's story runs every part layer of one event, and each layer's own preventDefault", () =>
    Effect.gen(function*() {
      const Dual = Html.component({
        name: "Dual",
        model: Schema.Number,
        message: Schema.Literals(["one", "ten"])
      }).make({
        init: () => 0,
        update: ($, message) => $.model + (message === "one" ? 1 : 10),
        parts: (p, count) => ({
          count,
          one: p.part(
            "button",
            (b) => b.on("click", "one", { preventDefault: true })
          ),
          ten: p.part("button", (b) => b.on("click", "ten"))
        })
      })
      const scene = yield* Scene.make(Dual, {}, {
        elements: Html,
        view: (dual, h) =>
          dual.ten(dual.one(h.button)).on("click", () => undefined, {
            preventDefault: false
          }).children("both")
      })
      scene.click("both").parts((dual) => assert.strictEqual(dual.count, 11))
      assert.isTrue(scene.defaultPrevented)
    }))

  it.effect("a consumer's story cancels the default when a child's layer always does", () =>
    Effect.gen(function*() {
      const Guard = Html.component({
        name: "Guard",
        model: Schema.Null,
        message: Schema.Never
      }).make(
        {
          init: () => null,
          update: ($) => $.model,
          parts: (p) => ({
            link: p.part(
              "a",
              (b) =>
                b.on("click", () => undefined, { preventDefault: "always" })
            )
          })
        }
      )
      const Clicked = UiSchema.TaggedEnum({ Clicked: {} })
      const Page = Html.component({
        name: "Page",
        model: Schema.Number,
        message: Clicked
      }).make({
        init: () => 0,
        update: ($) => $.model + 1,
        view: (h) =>
          Guard(
            h,
            {
              key: "g",
              view: (guard) =>
                guard.link(h.a).on("click", Clicked.Clicked()).children("go")
            }
          )
      })
      const scene = yield* Scene.make(Page, {})
      // Clicked is Page's only message.
      scene.click("go").expectHandled()
      assert.isTrue(scene.defaultPrevented)
    }))

  it.effect("an author's story runs its own layers around and inside a headless child's closure", () =>
    Effect.gen(function*() {
      const Inner = Component.define({
        name: "Inner",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        parts: () => ({})
      })
      const Outer = Html.component({
        name: "Outer",
        model: Schema.Number,
        message: Schema.Literals(["one", "ten", "hundred"])
      }).make({
        init: () => 0,
        update: ($, message) =>
          $.model + (message === "one" ? 1 : message === "ten" ? 10 : 100),
        parts: (p, count) => ({
          count,
          one: p.part(
            "div",
            (b) => b.on("click", "one", { preventDefault: true })
          ),
          ten: p.part("div", (b) => b.on("click", "ten")),
          hundred: p.part("button", (b) => b.on("click", "hundred"))
        })
      })
      const scene = yield* Scene.make(Outer, {}, {
        elements: Html,
        view: (outer, h) =>
          outer.ten(outer.one(h.div)).children(
            h.button("hit"),
            Inner(h, {
              key: "inner",
              view: () => outer.hundred(h.button).children("inside")
            })
          )
      })
      scene.click("hit")
      scene.parts((outer) => assert.strictEqual(outer.count, 11))
      assert.isTrue(scene.defaultPrevented)
      scene.click("inside")
      scene.parts((outer) => assert.strictEqual(outer.count, 111))
    }))

  it.effect("an author's story drops on a part's drop target", () =>
    Effect.gen(function*() {
      const Zone = Html.component({
        name: "Zone",
        model: Schema.String,
        message: Schema.String
      })
        .make({
          init: () => "",
          update: (_, message) => message,
          parts: (p, dropped) => ({
            dropped,
            zone: p.part(
              "div",
              (b) =>
                b.dropTarget({ accepts: ["text/plain"] })
                  .on("drop", (payload) => payload.data["text/plain"])
            )
          })
        })
      const scene = yield* HtmlScene.make(Zone, {}, {
        elements: Html,
        view: (zone, h) => zone.zone(h.div).children("zone")
      })
      scene.drop(Locator.text("zone"), { data: { "text/plain": "milk" } })
        .parts((zone) => assert.strictEqual(zone.dropped, "milk"))
      assert.isTrue(scene.defaultPrevented)
    }))
})
