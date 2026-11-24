// @vitest-environment happy-dom
import { Component, Mount, UiSchema, View } from "@effect/ui"
import { BrowserHost, Html, HtmlCommand, HtmlServer } from "@effect/ui/html"
import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const Message = UiSchema.TaggedEnum({
  Clicked: {},
  Reversed: {},
  Focus: {},
  Found: { found: Schema.Boolean },
  Mounted: { id: Schema.String, tag: Schema.String }
})
type Message = typeof Message.Type
const clicked = Message.Clicked()
const h = View.makeHelper<Message, {}, Html.Elements>({}, Html)

type Button<Msg, R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>

const hidden = (name: string) =>
  new Html.VoidElement<never>("input").attrs({
    type: "hidden",
    name,
    value: "on"
  })

// A function that takes a builder and returns it, with a frame around it
// and a form field beside it. Its own attribute is written by `place`.
const framed = <Msg, R>(
  element: Button<Msg, R>,
  name: string
): Button<Msg, R> =>
  element.forward((node) =>
    new Html.Element<Msg>("div").class(["frame"]).children([
      node.attr("type", "button"),
      hidden(name)
    ])
  )

// A headless part that adds a child of its own, and a second one to stack on it.
const Checkbox = Component.define({
  name: "Checkbox",
  props: Schema.Struct({ name: Schema.String }),
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({
  init: () => ({}),
  update: ($) => $.model,
  parts: (p) => ({
    root: p.part(
      "button",
      (b) => b.attr("role", "checkbox").children([hidden(p.props.name)])
    )
  })
})
const Described = Component.define({
  name: "Described",
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({
  init: () => ({}),
  update: ($) => $.model,
  parts: (p) => ({
    control: p.part(
      "button",
      (b) =>
        b.attr("aria-describedby", "why").children([
          new Html.Element<never>("i").children(["why"])
        ])
    )
  })
})

// A view's HTML, without the comments that mark components for hydration.
let count = 0
const render = Effect.fnUntraced(function*(
  view: (
    h: View.Helper<Message, {}> & View.Tags<Html.Elements, Message>
  ) => View.Content<Message, never>
) {
  const App = Component.define({
    name: `App${count++}`,
    model: Schema.Null,
    message: Message,
    elements: Html
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => view(h)
  })
  const { html } = yield* HtmlServer.renderToHtml(App, {})
  return html.replace(/<!--.*?-->/g, "")
})

const texts = (builder: View.ElementBuilder<Message, any, any, any>) =>
  View.build(builder, []).children.map((child) =>
    child._tag === "Element" ? child.children[0] : child
  )

describe("children", () => {
  it("a second call adds after the first, attributes can follow, and branches of one builder don't share children", () => {
    const base = h.ul.children([h.li(["shared"])]).class(["list"])
    const left = base.children([h.li(["left"]), h.li(["more"])])
    const right = base.children([h.li(["right"])])
    assert.deepStrictEqual(texts(left), [
      View.text("shared"),
      View.text("left"),
      View.text("more")
    ])
    assert.deepStrictEqual(texts(right), [
      View.text("shared"),
      View.text("right")
    ])
    assert.deepStrictEqual(texts(base), [View.text("shared")])
    assert.deepStrictEqual(View.build(left, []).attrs, { class: "list" })
    // Text on either side of a call joins, as adjacent text always does.
    assert.deepStrictEqual(
      View.build(h.p(["Hello"]).children([", ", "world"]), []).children,
      [View.text("Hello, world")]
    )
  })

  it.effect("a part's children come before the consumer's, in the order the parts were applied", () =>
    Effect.gen(function*() {
      const stacked = (order: "checkbox inside" | "described inside") =>
        render((h) =>
          Described(h, {
            view: (described) =>
              Checkbox(h, {
                props: { name: "terms" },
                view: (checkbox) =>
                  (order === "checkbox inside"
                    ? described.control(checkbox.root(h.button.class(["box"])))
                    : checkbox.root(described.control(h.button)))
                    .children(["Terms"])
              })
          })
        )
      assert.match(
        yield* stacked("checkbox inside"),
        /^<button class="box"[^>]*><input type="hidden" name="terms" value="on"><i>why<\/i>Terms<\/button>$/
      )
      assert.match(
        yield* stacked("described inside"),
        /^<button[^>]*><i>why<\/i><input type="hidden" name="terms" value="on">Terms<\/button>$/
      )
    }))
})

describe("forward", () => {
  it.effect("renders around the element, and what the caller chains and its children land on the element", () =>
    Effect.gen(function*() {
      assert.strictEqual(
        yield* render((h) =>
          framed(h.button.class(["pick"]), "amount").attr("title", "Pick")
            .children(["Pick ", h.b(["one"])])
        ),
        `<div class="frame"><button class="pick" title="Pick" type="button">Pick <b>one</b></button>` +
          `<input type="hidden" name="amount" value="on"></div>`
      )
      // Without children of its own, as a child, and on a void element.
      assert.strictEqual(
        yield* render((h) =>
          h.p.children([
            framed(h.button, "a"),
            h.input.forward((node) => h.label.children(["Amount", node])).value(
              "1"
            )
          ])
        ),
        `<p><div class="frame"><button type="button"></button><input type="hidden" name="a" value="on"></div>` +
          `<label>Amount<input value="1"></label></p>`
      )
      // A part takes the forwarded builder, and checks its tag when applied.
      assert.strictEqual(
        yield* render((h) =>
          Checkbox(h, {
            props: { name: "terms" },
            view: (checkbox) =>
              checkbox.root(framed(h.button, "amount")).children(["Terms"])
          })
        ),
        `<div class="frame"><button role="checkbox" type="button"><input type="hidden" name="terms" value="on">Terms</button>` +
          `<input type="hidden" name="amount" value="on"></div>`
      )
      const checkbox = Story.parts(Checkbox, {
        model: {},
        props: { name: "terms" }
      })
      assert.throws(
        () => checkbox.root(h.span.forward((node) => node) as never),
        /a part for <button> was given <span>/
      )
    }))

  it("gets the builder as the caller finished it, so it writes last, and the last one set is outermost", () => {
    // Its attribute replaces one chained after the call, and it sees a handler chained after.
    const guarded = h.button.forward((node) => {
      if (node.handlers.click !== undefined) {
        throw new Error("already handles click")
      }
      return node.attr("type", "button")
    })
    assert.deepStrictEqual(
      View.build(guarded.attrs({ type: "submit", title: "Go" }), []).attrs,
      {
        title: "Go",
        type: "button"
      }
    )
    assert.throws(
      () => View.build(guarded.onClick(clicked), []),
      /already handles click/
    )

    const both = h.b.forward((node) => h.i.children([node])).forward((node) =>
      h.u.children([node])
    )
    const outer = View.build(both.children(["x"]), [])
    const middle = outer.children[0]
    assert.deepStrictEqual([
      outer.tag,
      middle?._tag === "Element" && middle.tag
    ], ["u", "i"])

    assert.throws(
      () => View.build(h.div.forward(() => View.text("no") as never), []),
      /has to return an element/
    )
  })

  it("a key goes on the element that is rendered, and the handler, ref and mount stay on the caller's", () => {
    const Field = Html.ref("Field", "button")
    const ReadTag = Mount.make(
      "ReadTag",
      { args: {} },
      (element: HTMLElement) => Effect.succeed(element.localName)
    )
    const frame = View.build(
      framed(h.button.key("row"), "amount").onClick(clicked).ref(Field).onMount(
        ReadTag().pipe(Mount.map(() => clicked))
      ),
      []
    )
    const button = frame.children[0] as View.Element<Message>
    assert.deepStrictEqual([
      frame.tag,
      frame.elementKey,
      frame.refKey,
      frame.mount?.name,
      frame.handlers.click
    ], [
      "div",
      "row",
      undefined,
      undefined,
      undefined
    ])
    assert.deepStrictEqual([
      button.tag,
      button.elementKey,
      button.refKey,
      button.mount?.name,
      button.handlers.click
    ], [
      "button",
      undefined,
      Field.key,
      "ReadTag",
      clicked
    ])
  })
})

describe("forward on BrowserHost", { concurrent: false }, () => {
  const tick = Effect.promise(() =>
    new Promise<void>((resolve) => setTimeout(resolve, 30))
  )
  const container = Effect.acquireRelease(
    Effect.sync(() => document.body.appendChild(document.createElement("div"))),
    (element) => Effect.sync(() => element.remove())
  )
  const First = Html.ref("First", "button")
  const ReadTag = Mount.make(
    "ReadTag",
    { args: {} },
    (element: HTMLElement) => Effect.succeed(element.localName)
  )
  const Rows = Component.define({
    name: "Rows",
    model: Schema.Struct({
      ids: Schema.Array(Schema.String),
      log: Schema.Array(Schema.String)
    }),
    message: Message,
    elements: Html
  }).make({
    init: () => ({ ids: ["a", "b", "c"], log: [] as ReadonlyArray<string> }),
    update: ($, message) =>
      Message.match(message, {
        Clicked: () => $.model,
        Reversed: () => ({ ...$.model, ids: [...$.model.ids].reverse() }),
        Focus: () =>
          $.run([
            HtmlCommand.focus(First, ({ found }) => Message.Found({ found }))
          ]),
        Found: ({ found }) => ({
          ...$.model,
          log: [...$.model.log, `found ${found}`]
        }),
        Mounted: ({ id, tag }) => ({
          ...$.model,
          log: [...$.model.log, `mounted ${id} on ${tag}`]
        })
      }),
    view: (h, model) =>
      h.section.children(model.ids.map((id) => {
        const row = framed(h.button.attr("aria-label", id), id)
          .key(id)
          .onMount(
            ReadTag().pipe(Mount.map((tag) => Message.Mounted({ id, tag })))
          )
        return (id === "a" ? row.ref(First) : row).children([id])
      }))
  })

  it.effect("keyed rows keep their nodes when they reorder, and a chained ref and mount get the caller's element", () =>
    Effect.gen(function*() {
      const app = yield* container
      const root = yield* BrowserHost.mountEffect(Rows, {}, app)
      yield* tick
      const frames = () => Array.from(app.querySelectorAll("div.frame"))
      const before = frames()
      const buttons = before.map((frame) => frame.querySelector("button"))
      root.send(Message.Reversed())
      root.send(Message.Focus())
      yield* tick
      const after = frames()
      assert.deepStrictEqual(after.map((frame) => frame.textContent), [
        "c",
        "b",
        "a"
      ])
      assert.isTrue(after[0] === before[2] && after[2] === before[0])
      assert.isTrue(after[0]?.querySelector("button") === buttons[2])
      assert.strictEqual(document.activeElement, buttons[0])
      // The mounts got the buttons, once each: a reorder moves them.
      assert.deepStrictEqual([...(root.model()?.log ?? [])].sort(), [
        "found true",
        "mounted a on button",
        "mounted b on button",
        "mounted c on button"
      ])
    }).pipe(Effect.scoped))
})
