// @vitest-environment happy-dom
/**
 * PROTOTYPE (EFF-3930): what happens when a child call leaves out `key` and the
 * key defaults to the empty string, so the child's segment is `Name[]`.
 *
 * Each test pins what the runtime does today with that default. The tests
 * under "Scene" pin behaviour that has to change before the default ships.
 */
import { Component, Feature, type MessageLog, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { ssr } from "@effect/ui/html/testing"
import { Locator, Scene, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Schema } from "effect"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(TestHost.layer()))

type Root = {
  readonly get: (locator: Locator.Locator) => TestHost.TestNode
  readonly log: () => ReadonlyArray<MessageLog.Entry>
}
const click = (root: Root, text: string) => Locator.fire(root.get(Locator.text(text, { exact: true })), "click")
const paths = (root: Root, tag: "Mounted" | "Unmounted") =>
  root.log().flatMap((entry) => entry._tag === tag ? [entry.path] : [])
const failures = (root: Root) =>
  root.log().flatMap((entry) =>
    entry._tag === "Failed" ? [`${entry.path} ${entry.in}: ${Cause.pretty(entry.cause).split("\n")[0]}`] : []
  )

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CounterMessage = Schema.TaggedUnion({ Increment: {} })

/** A child with interaction state: a button that counts its clicks. */
const counter = <const Name extends string>(name: Name) =>
  Component.define({
    name,
    props: Schema.Struct({ label: Schema.String }),
    model: Schema.Number,
    message: CounterMessage,
    events: Schema.Number,
    elements: Html
  }).make({
    init: () => 0,
    update: (count, _, $) => $.set(count + 1).emit(count + 1),
    view: (count, h) =>
      h.button.onClick(CounterMessage.make({ _tag: "Increment" })).children(`${h.props.label} ${count}`)
  })
const Counter = counter("Counter")
const Stepper = counter("Stepper")

const DisclosureMessage = Schema.TaggedUnion({ Toggle: {} })

/** A headless child with interaction state and ids from `p.id`. */
const disclosure = <const Name extends string>(name: Name) =>
  Component.define({ name, model: Schema.Boolean, message: DisclosureMessage, elements: Html }).make({
    init: () => false,
    update: (open) => !open,
    parts: (open, p) => ({
      open,
      trigger: p.part(
        "button",
        (b) => b.attr("aria-controls", p.id("panel")).onClick(DisclosureMessage.make({ _tag: "Toggle" }))
      ),
      panel: p.part("div", (b) => b.id(p.id("panel")))
    })
  })
const Disclosure = disclosure("Disclosure")
const Details = disclosure("Details")

const Frame = Component.define({
  name: "Frame",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html,
  slots: ["body"]
}).make({ init: () => null, update: (model) => model, view: (_, h) => h.section(h.slots.body) })

const FragileMessage = Schema.TaggedUnion({ Break: {} })
/** A child that fails when its button is clicked. */
const Fragile = Component.define({ name: "Fragile", model: Schema.Null, message: FragileMessage, elements: Html })
  .make({
    init: () => null,
    update: () => {
      throw new Error("broke")
    },
    view: (_, h) => h.button.onClick(FragileMessage.make({ _tag: "Break" })).children("break")
  })

class Badge extends Feature.Service<Badge>()("Badge", { props: Schema.Struct({}) }) {}
const BadgeImpl = Component.define({ name: "BadgeImpl", model: Schema.Null, message: Schema.Never, elements: Html })
  .make({ init: () => null, update: (model) => model, view: (_, h) => h.span("badge") })

const PageMessage = Schema.TaggedUnion({
  Flip: {},
  Set: { labels: Schema.Array(Schema.String) },
  Note: { text: Schema.String }
})
const PageModel = Schema.Struct({ on: Schema.Boolean, labels: Schema.Array(Schema.String), note: Schema.String })
const PageDef = Component.define({
  name: "Page",
  props: Schema.Struct({ labels: Schema.optional(Schema.Array(Schema.String)) }),
  model: PageModel,
  message: PageMessage,
  elements: Html
})
const init = ($: { readonly props: { readonly labels?: ReadonlyArray<string> | undefined } }) => ({
  on: false,
  labels: $.props.labels ?? [],
  note: ""
})
const update = (model: typeof PageModel.Type, message: typeof PageMessage.Type) =>
  PageMessage.match(message, {
    Flip: () => ({ ...model, on: !model.on }),
    Set: ({ labels }) => ({ ...model, labels }),
    Note: ({ text }) => ({ ...model, note: text })
  })
const flip = PageMessage.make({ _tag: "Flip" })
const crashed = { fallback: (_: unknown, h: View.Helper<never, {}>) => h.text("crashed") }

// ---------------------------------------------------------------------------
// One unkeyed child per component
// ---------------------------------------------------------------------------

describe("a child without a key", () => {
  it.effect("is the child at Name[], and keeps its Model while the parent renders", () =>
    provideHost(Effect.gen(function*() {
      const Page = PageDef.make({
        init,
        update,
        view: (model, h) =>
          h.div(
            h.p(String(model.on)),
            Counter(h, { props: { label: "count" } }),
            Stepper(h, { props: { label: "step" } })
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.deepStrictEqual(paths(root, "Mounted"), ["/Page", "/Page/Counter[]", "/Page/Stepper[]"])
      click(root, "count 0")
      yield* TestHost.settle
      root.send(flip)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "truecount 1step 0")
      assert.deepStrictEqual(
        root.log().flatMap((entry) => entry._tag === "Update" ? [entry.path] : []),
        ["/Page/Counter[]", "/Page"]
      )
      assert.deepStrictEqual(paths(root, "Unmounted"), [])
    })))

  it.effect("sits next to keyed children of the same component", () =>
    provideHost(Effect.gen(function*() {
      const Page = PageDef.make({
        init,
        update,
        view: (_, h) => h.div(Counter(h, { props: { label: "main" } }), Counter(h, { key: "a", props: { label: "a" } }))
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.deepStrictEqual(paths(root, "Mounted"), ["/Page", "/Page/Counter[]", "/Page/Counter[a]"])
    })))

  it.effect("fails the parent when a second unkeyed child of the component is rendered, and says to add a key", () =>
    provideHost(Effect.gen(function*() {
      const Page = PageDef.make({
        init,
        update,
        view: (_, h) => h.div(Counter(h, { props: { label: "a" } }), h.p(Counter(h, { props: { label: "b" } })))
      })
      const root = yield* TestHost.mount(Page, {}, crashed)
      yield* Effect.flip(TestHost.settle)
      assert.strictEqual(root.text(), "crashed")
      assert.deepStrictEqual(failures(root), [
        "/Page view: Error: /Page renders two children at Counter[]. A child without a key is the only Counter " +
        "its parent renders: give each Counter its own `key`"
      ])
    })))

  it.effect("is the same child as one with the key \"\"", () =>
    provideHost(Effect.gen(function*() {
      const Page = PageDef.make({
        init,
        update,
        view: (_, h) => h.div(Counter(h, { props: { label: "a" } }), Counter(h, { key: "", props: { label: "b" } }))
      })
      const root = yield* TestHost.mount(Page, {}, crashed)
      yield* Effect.flip(TestHost.settle)
      assert.include(failures(root)[0], "/Page renders two children at Counter[]")
    })))

  it.effect("clashes with an unkeyed child of another component that has the same name", () =>
    provideHost(Effect.gen(function*() {
      // Two libraries that both call a component "Counter", or a component and its provided copy.
      const Other = counter("Counter")
      const Page = PageDef.make({
        init,
        update,
        view: (_, h) => h.div(Counter(h, { props: { label: "a" } }), Other(h, { props: { label: "b" } }))
      })
      const root = yield* TestHost.mount(Page, {}, crashed)
      yield* Effect.flip(TestHost.settle)
      assert.include(failures(root)[0], "/Page renders two children at Counter[]")
    })))

  it("still can't take both a key and a ref", () => {
    const Page = PageDef.make({
      init,
      update,
      view: (_, h) => h.div(Counter(h, { key: "a", ref: Counter.ref("Main"), props: { label: "a" } } as any))
    })
    assert.throws(() => Scene.start(Page, {}).current.view(), /A child takes a key or a ref, not both/)
  })
})

// ---------------------------------------------------------------------------
// Lists: the missing key that used to be a type error
// ---------------------------------------------------------------------------

describe("rows of a list without keys", () => {
  const List = PageDef.make({
    init,
    update,
    view: (model, h) => h.ul(model.labels.map((label) => h.li(Counter(h, { props: { label } }))))
  })

  it.effect("fail the parent on its first render with two rows", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(List, { labels: ["a", "b"] }, crashed)
      yield* Effect.flip(TestHost.settle)
      assert.include(failures(root)[0], "/Page renders two children at Counter[]")
    })))

  it.effect("render with no row or one row, and fail the parent once a second row arrives", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(List, { labels: ["a"] }, crashed)
      yield* TestHost.settle
      // Nothing warns here: a test or a demo with one row passes.
      assert.strictEqual(root.text(), "a 0")
      assert.deepStrictEqual(failures(root), [])
      root.send(PageMessage.make({ _tag: "Set", labels: ["a", "b"] }))
      const error = yield* Effect.flip(TestHost.settle)
      assert.strictEqual(error._tag, "RootCrashed")
      assert.strictEqual(root.text(), "crashed")
      assert.include(failures(root)[0], "/Page renders two children at Counter[]")
    })))

  it.effect("keep one row's Model for the next row when the list replaces its only row", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(List, { labels: ["a"] })
      yield* TestHost.settle
      click(root, "a 0")
      yield* TestHost.settle
      root.send(PageMessage.make({ _tag: "Set", labels: ["b"] }))
      yield* TestHost.settle
      // Row b shows row a's count. With `key: label` it would start from 0.
      assert.strictEqual(root.text(), "b 1")
    })))
})

// ---------------------------------------------------------------------------
// Two branches that render the same component
// ---------------------------------------------------------------------------

describe("two branches that each render the component without a key", () => {
  it.effect("are one instance: the Model carries over, and init doesn't run again", () =>
    provideHost(Effect.gen(function*() {
      const Page = PageDef.make({
        init,
        update,
        view: (model, h) =>
          h.div(model.on ? Counter(h, { props: { label: "b" } }) : Counter(h, { props: { label: "a" } }))
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "a 0")
      yield* TestHost.settle
      root.send(flip)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "b 1")
      assert.deepStrictEqual(paths(root, "Mounted"), ["/Page", "/Page/Counter[]"])
      assert.deepStrictEqual(paths(root, "Unmounted"), [])
    })))

  it.effect("are two instances once each branch has its own key", () =>
    provideHost(Effect.gen(function*() {
      const Page = PageDef.make({
        init,
        update,
        view: (model, h) =>
          h.div(
            model.on
              ? Counter(h, { key: "b", props: { label: "b" } })
              : Counter(h, { key: "a", props: { label: "a" } })
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "a 0")
      yield* TestHost.settle
      root.send(flip)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "b 0")
      assert.deepStrictEqual(paths(root, "Unmounted"), ["/Page/Counter[a]"])
    })))

  it.effect("are two instances when the branches put the child under different elements", () =>
    provideHost(Effect.gen(function*() {
      const Page = PageDef.make({
        init,
        update,
        view: (model, h) =>
          model.on
            ? h.section(Counter(h, { props: { label: "b" } }))
            : h.div(Counter(h, { props: { label: "a" } }))
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "a 0")
      yield* TestHost.settle
      root.send(flip)
      yield* TestHost.settle
      // The same path, a new instance: the element around it was replaced.
      assert.strictEqual(root.text(), "b 0")
      assert.deepStrictEqual(paths(root, "Mounted"), ["/Page", "/Page/Counter[]", "/Page/Counter[]"])
    })))
})

// ---------------------------------------------------------------------------
// Headless closures, slots and fallbacks
// ---------------------------------------------------------------------------

describe("a headless child without a key", () => {
  it.effect("gives the children in its closure their own paths, apart from the parent's", () =>
    provideHost(Effect.gen(function*() {
      const Page = PageDef.make({
        init,
        update,
        view: (_, h) =>
          h.div(
            Counter(h, { props: { label: "outside" } }),
            Disclosure(h, {
              view: (d) =>
                h.div(
                  d.trigger(h.button).children("toggle"),
                  d.panel(h.div).children(
                    Counter(h, { props: { label: "inside" } })
                  )
                )
            })
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.deepStrictEqual(paths(root, "Mounted"), [
        "/Page",
        "/Page/Counter[]",
        "/Page/Disclosure[]",
        "/Page/Disclosure[]/Counter[]"
      ])
      click(root, "inside 0")
      click(root, "toggle")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "outside 0toggleinside 1")
    })))

  it.effect("fails with its own path when its closure renders two unkeyed children of a component", () =>
    provideHost(Effect.gen(function*() {
      const Page = PageDef.make({
        init,
        update,
        view: (_, h) =>
          Disclosure(h, {
            view: (d) =>
              d.panel(h.div).children(
                Counter(h, { props: { label: "a" } }),
                Counter(h, { props: { label: "b" } })
              ),
            fallback: () => h.p("closure failed")
          })
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "closure failed")
      assert.include(failures(root)[0], "/Page/Disclosure[] renders two children at Counter[]")
    })))
})

describe("a slot's content", () => {
  it.effect("has its own paths under the outlet, so its unkeyed children are apart from the parent's", () =>
    provideHost(Effect.gen(function*() {
      const Page = PageDef.make({
        init,
        update,
        view: (_, h) =>
          h.div(
            Counter(h, { props: { label: "outside" } }),
            Frame(h, { slots: { body: Counter(h, { props: { label: "inside" } }) } })
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.deepStrictEqual(paths(root, "Mounted"), [
        "/Page",
        "/Page/Counter[]",
        "/Page/Frame[]",
        "/Page/Frame[]/[body]/Counter[]"
      ])
    })))
})

describe("a fallback that renders an unkeyed child", () => {
  it.effect("fails the parent only once the fallback shows, if the view holds that path too", () =>
    provideHost(Effect.gen(function*() {
      const Page = PageDef.make({
        init,
        update,
        view: (_, h) =>
          h.div(
            Counter(h, { props: { label: "main" } }),
            Fragile(h, { fallback: () => Counter(h, { props: { label: "spare" } }) })
          )
      })
      const root = yield* TestHost.mount(Page, {}, crashed)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "main 0break")
      click(root, "break")
      yield* Effect.flip(TestHost.settle)
      assert.strictEqual(root.text(), "crashed")
      assert.include(
        failures(root).join("\n"),
        "/Page renders two children at Counter[], in the fallback of Fragile[]"
      )
    })))
})

// ---------------------------------------------------------------------------
// Features and refs
// ---------------------------------------------------------------------------

describe("a feature's render without a key", () => {
  it.effect("is the child at Feature[]", () =>
    provideHost(Effect.gen(function*() {
      const Page = PageDef.make({
        init,
        update,
        view: (_, h) => h.div(Badge.render(h, { fallback: () => h.span("loading") }))
      })
      const root = yield* TestHost.mount(Component.provide(Page, Badge.toLayer(BadgeImpl)), {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "badge")
      assert.deepStrictEqual(paths(root, "Mounted"), ["/Page", "/Page/Badge[]"])
    })))
})

// ---------------------------------------------------------------------------
// Server rendering and hydration
// ---------------------------------------------------------------------------

describe("server rendering", () => {
  it.effect("writes Name[] in the markers and the state, the client adopts it, and p.id is the same on both", () =>
    Effect.gen(function*() {
      const Page = PageDef.make({
        init,
        update,
        view: (_, h) =>
          h.main(
            Counter(h, { props: { label: "count" } }),
            Disclosure(h, {
              view: (d) => h.div(d.trigger(h.button).children("toggle"), d.panel(h.div).children("panel"))
            }),
            Frame(h, { slots: { body: Counter(h, { props: { label: "in a slot" } }) } })
          )
      })
      // `ssr` fails unless every instance the server rendered adopts its Model and its nodes.
      const result = yield* ssr(Page, {})
      assert.include(result.html, "<!--[/Page/Counter[]-->")
      assert.include(result.html, "<!--]/Page/Counter[]-->")
      assert.include(result.html, "<!--[/Page/Disclosure[]-->")
      assert.include(result.html, "<!--[/Page/Frame[]/[body]-->")
      const instances = [
        "/Page",
        "/Page/Counter[]",
        "/Page/Disclosure[]",
        "/Page/Frame[]",
        "/Page/Frame[]/[body]/Counter[]"
      ]
      assert.sameMembers(Object.keys(result.state).filter((key) => key.startsWith("/")), instances)
      assert.sameMembers([...result.adopted], instances)
      // `[` and `]` are escaped like any other character of a path, so the id is a valid one.
      const id = "_1b_Page_1b_Disclosure_2j__2l_-panel"
      assert.include(result.html, `aria-controls="${id}"`)
      assert.strictEqual(result.container.querySelector("[aria-controls]")!.getAttribute("aria-controls"), id)
      assert.isNotNull(result.container.querySelector(`#${id}`))
    }).pipe(Effect.scoped, provideHost))
})

// ---------------------------------------------------------------------------
// Scene: its steps find a child by key alone
// ---------------------------------------------------------------------------

describe("Scene, which finds a child by its key alone", () => {
  const Page = PageDef.make({
    init,
    update,
    view: (model, h) =>
      h.div(
        h.output(model.note),
        Counter(h, {
          props: { label: "count" },
          onEmit: (count) => PageMessage.make({ _tag: "Note", text: `counter ${count}` }),
          onFailure: () => PageMessage.make({ _tag: "Note", text: "counter failed" })
        }),
        Stepper(h, {
          props: { label: "step" },
          onEmit: (count) => PageMessage.make({ _tag: "Note", text: `stepper ${count}` }),
          onFailure: () => PageMessage.make({ _tag: "Note", text: "stepper failed" })
        })
      )
  })
  const note = Locator.tag("output")

  it.effect("reaches the first unkeyed child with \"\", whatever its component", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Page, {})
      s.childEmit(Counter, "", 1).expect(note).toHaveText("counter 1")
      s.childFailure("", Cause.fail("boom")).expect(note).toHaveText("counter failed")
    }))

  it("NEEDS A FIX: can't reach the second unkeyed child, since the first one has the key \"\" too", () => {
    assert.throws(
      () => Scene.start(Page, {}).childEmit(Stepper, "", 1),
      /^Scene\.childEmit: the child at "" is Counter, not Stepper/
    )
    // `childFailure` takes no component, so nothing names the Stepper.
  })

  it("NEEDS A FIX: givenChild(\"\") sets the Model of every unkeyed headless child", () => {
    const Both = PageDef.make({
      init,
      update,
      view: (_, h) =>
        h.div(
          Disclosure(h, { view: (d) => h.p(d.open ? "disclosure open" : "disclosure closed") }),
          Details(h, { view: (d) => h.p(d.open ? "details open" : "details closed") })
        )
    })
    const s = Scene.start(Both, {})
    assert.strictEqual(Locator.textOf(s.root), "disclosure closeddetails closed")
    s.givenChild("", true)
    assert.strictEqual(Locator.textOf(s.root), "disclosure opendetails open")
  })

  it("has the same fault today for two components that were given one key", () => {
    const Keyed = PageDef.make({
      init,
      update,
      view: (_, h) =>
        h.div(
          Disclosure(h, { key: "a", view: (d) => h.p(d.open ? "disclosure open" : "disclosure closed") }),
          Details(h, { key: "a", view: (d) => h.p(d.open ? "details open" : "details closed") })
        )
    })
    const s = Scene.start(Keyed, {}).givenChild("a", true)
    assert.strictEqual(Locator.textOf(s.root), "disclosure opendetails open")
  })
})
