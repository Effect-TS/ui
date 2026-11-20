import { Child, Command, Component, Feature, Head, type MessageLog, Mount, Renderer, UiSchema } from "@effect/ui"
import { Locator, Scene, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Context, Deferred, Effect, Layer, Option, Schema } from "effect"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(TestHost.layer()))
const click = (root: TestHost.TestRoot<any, any, any>, text: string) =>
  Locator.fire(root.get(Locator.text(text, { exact: true })), "click")
/** The log's instance entries for `path`. */
const lifecycle = (root: { readonly log: () => ReadonlyArray<MessageLog.Entry> }, path: string) =>
  root.log().flatMap((entry) =>
    "path" in entry && entry.path === path && entry._tag !== "Update" && !entry._tag.startsWith("Command")
      ? [entry._tag]
      : []
  )

// ---------------------------------------------------------------------------
// A settings page with two tabs, each a form that is parked while hidden
// ---------------------------------------------------------------------------

const FormMsg = UiSchema.TaggedEnum({
  Typed: {},
  Save: {},
  Saved: { text: Schema.String },
  Clear: {}
})
const FormEvents = UiSchema.TaggedEnum({ Saved: { text: Schema.String } })
const FormModel = Schema.Struct({ draft: Schema.String, saved: Schema.String })

const makeForm = (saving: Deferred.Deferred<void>) => {
  const Save = Command.make(
    "Save",
    { args: { text: Schema.String } },
    ({ text }) => Deferred.await(saving).pipe(Effect.as(FormMsg.Saved({ text })))
  )
  return Component.define({
    name: "Profile",
    lifetime: "model",
    model: FormModel,
    message: FormMsg,
    events: FormEvents,
    receives: ["Clear"]
  }).make({
    head: () => [Head.title("Profile")],
    init: () => ({ draft: "", saved: "" }),
    update: (model, message, $) =>
      FormMsg.match(message, {
        Typed: () => ({ ...model, draft: model.draft + "a" }),
        Save: () => $.run(Save({ text: model.draft })),
        Saved: ({ text }) => $.set({ ...model, saved: text }).emit(FormEvents.Saved({ text })),
        Clear: () => ({ ...model, draft: "" })
      }),
    view: (model, h) =>
      h.el(
        "form",
        h.el("button").on("click", FormMsg.Typed()).children("draft:" + model.draft),
        h.el("button").on("click", FormMsg.Save()).children("save"),
        h.el("p", "saved:" + model.saved)
      )
  })
}

const Billing = Component.define({ name: "Billing", lifetime: "model", model: Schema.Null, message: Schema.Never })
  .make({
    init: () => null,
    update: (model) => model,
    view: (_, h) => h.el("p", "billing")
  })

const SettingsMsg = UiSchema.TaggedEnum({
  Show: { tab: Schema.String },
  Saved: { text: Schema.String },
  Clear: {}
})
const SettingsModel = Schema.Struct({ tab: Schema.String, saved: Schema.Array(Schema.String) })

const makeSettings = (Profile: ReturnType<typeof makeForm>) => {
  const Form = Profile.ref("profile")
  return Component.define({ name: "Settings", lifetime: "view", model: SettingsModel, message: SettingsMsg }).make({
    children: {
      profile: Child.one(Profile, { onEmit: (event) => SettingsMsg.Saved({ text: event.text }) }),
      billing: Billing
    },
    head: () => [Head.title("Settings")],
    init: () => ({ tab: "profile", saved: [] }),
    update: (model, message, $) =>
      SettingsMsg.match(message, {
        Show: ({ tab }) => ({ ...model, tab }),
        Saved: ({ text }) => ({ ...model, saved: [...model.saved, text] }),
        Clear: () => $.send(Form, FormMsg.Clear())
      }),
    view: (model, h) =>
      h.el(
        "main",
        h.el("button").on("click", SettingsMsg.Show({ tab: "profile" })).children("profile-tab"),
        h.el("button").on("click", SettingsMsg.Show({ tab: "billing" })).children("billing-tab"),
        model.tab === "profile" ? h.children.profile() : h.children.billing()
      )
  })
}

/**
 * A test host whose handles are numbers, as a native host's may be. `recycle` hands an old handle out
 * again, for a new element.
 */
const numbered = () => {
  const host = TestHost.makeHost()
  const nodes: Array<TestHost.TestNode> = []
  const ids = new Map<TestHost.TestNode, number>()
  const id = (node: TestHost.TestNode): number => {
    let found = ids.get(node)
    if (found === undefined) ids.set(node, found = nodes.push(node) - 1)
    return found
  }
  const of = (handle: number) => nodes[handle]!
  const maybe = (node: TestHost.TestNode | undefined) => node === undefined ? undefined : id(node)
  const containers: Array<number> = []
  const recycle = (handle: number, tag: string): number => {
    const node = host.createElement(tag)
    nodes[handle] = node
    ids.set(node, handle)
    return handle
  }
  const numeric: Renderer.Host<number> = {
    createElement: (tag) => id(host.createElement(tag)),
    createText: (text) => id(host.createText(text)),
    createContainer: () => {
      const handle = id(host.createContainer!())
      containers.push(handle)
      return handle
    },
    setText: (node, text) => host.setText(of(node), text),
    setAttr: (node, name, value) => host.setAttr(of(node), name, value),
    setProp: (node, name, value) => host.setProp(of(node), name, value),
    insertBefore: (parent, node, ref) =>
      host.insertBefore(of(parent), of(node), ref === undefined ? undefined : of(ref)),
    remove: (node) => host.remove(of(node)),
    parentOf: (node) => maybe(host.parentOf(of(node))),
    nextOf: (node) => maybe(host.nextOf(of(node))),
    setEvents: (node, handlers, dispatch, options) => host.setEvents(of(node), handlers, dispatch, options),
    elements: "any",
    controlled: host.controlled,
    runsMounts: true
  }
  return {
    host: numeric,
    root: id(host.createElement("#root")),
    text: (handle: number) => Locator.textOf(of(handle)),
    containers,
    recycle
  }
}

const withoutContainer = () => {
  const { createContainer: _, ...host } = TestHost.makeHost()
  return host
}

describe("parked model children", () => {
  it.effect("a story keeps a hidden tab's draft, delivers sends to it, and takes its events", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(makeSettings(makeForm(yield* Deferred.make<void>())), {})
      s.sendChild("profile", FormMsg.Typed())
        .send(SettingsMsg.Show({ tab: "billing" }))
        .sendChild("profile", FormMsg.Saved({ text: "a" }))
        .send(SettingsMsg.Show({ tab: "profile" }))
      assert.deepStrictEqual(s.children, { profile: { draft: "a", saved: "a" }, billing: null })
      assert.deepStrictEqual(s.model.saved, ["a"])
      s.send(SettingsMsg.Clear())
      assert.deepStrictEqual(s.children.profile, { draft: "", saved: "a" })
    }))

  it.effect("a scene clicks into a shown model child and keeps its draft while it is hidden", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(makeSettings(makeForm(yield* Deferred.make<void>())), {})
      s.click("draft:")
        .expect(Locator.text("draft:a")).toExist()
        .click("billing-tab")
        .expect(Locator.text("draft:a")).toBeAbsent()
        .click("profile-tab")
        .expect(Locator.text("draft:a")).toExist()
    }))

  it.effect("a hidden tab keeps its draft and its save, gets messages, and emits", () =>
    provideHost(Effect.gen(function*() {
      const saving = yield* Deferred.make<void>()
      const root = yield* TestHost.mount(makeSettings(makeForm(saving)), {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "profile-tabbilling-tabdraft:savesaved:")

      click(root, "draft:")
      yield* TestHost.settle
      click(root, "save")
      yield* TestHost.settle
      root.send(SettingsMsg.Show({ tab: "billing" }))
      yield* TestHost.settle
      assert.strictEqual(root.head().title, "Settings")
      assert.strictEqual(root.text(), "profile-tabbilling-tabbilling")

      // The save ends while the form is out of the document, and its emit reaches the parent.
      yield* Deferred.succeed(saving, undefined)
      yield* TestHost.settle
      assert.deepStrictEqual(root.model()?.saved, ["a"])
      root.send(SettingsMsg.Clear())
      yield* TestHost.settle

      root.send(SettingsMsg.Show({ tab: "profile" }))
      yield* TestHost.settle
      assert.strictEqual(root.head().title, "Profile")
      assert.strictEqual(root.text(), "profile-tabbilling-tabdraft:savesaved:a")
      assert.deepStrictEqual(lifecycle(root, "/Settings/Profile[profile]"), ["Mounted", "Detached", "Attached"])
    })))

  it.effect("keeps a nested model child parked when its parent is placed, and parks a new key", () =>
    provideHost(Effect.gen(function*() {
      const Input = Renderer.ref("Input")
      const Look = Command.make("Look", { args: {} }, () =>
        Effect.gen(function*() {
          const refs = yield* Renderer.Refs
          return Option.isSome(yield* refs.lookup(Input))
        }))
      const Leaf = Component.define({
        name: "Leaf",
        lifetime: "model",
        props: Schema.Struct({ label: Schema.String }),
        model: Schema.NullOr(Schema.Boolean),
        message: Schema.Boolean
      }).make({
        init: ($) => $.set(null).run(Look()),
        update: (_, found) => found,
        view: (found, h) => h.el("i", `${h.props.label}:${found}`).ref(Input)
      })
      const Inner = Schema.Struct({ inner: Schema.Boolean, key: Schema.String })
      const OuterMsg = UiSchema.TaggedEnum({ Set: { inner: Schema.Boolean, key: Schema.String } })
      const Outer = Component.define({
        name: "Outer",
        lifetime: "model",
        model: Inner,
        message: OuterMsg,
        receives: ["Set"]
      }).make({
        children: { leaf: Child.keyed(Leaf, { props: (model) => [[model.key, { label: model.key }]] }) },
        init: () => ({ inner: true, key: "a" }),
        update: (_, { inner, key }) => ({ inner, key }),
        view: (model, h) => h.el("section", "outer ", model.inner ? null : h.children.leaf(model.key))
      })
      const State = Schema.Struct({ outer: Schema.Boolean, inner: Schema.Boolean, key: Schema.String })
      const OuterRef = Outer.ref("outer")
      const Page = Component.define({ name: "Page", lifetime: "view", model: State, message: State }).make({
        children: { outer: Outer },
        init: () => ({ outer: true, inner: true, key: "a" }),
        update: (_, next, $) => $.set(next).send(OuterRef, OuterMsg.Set({ inner: next.inner, key: next.key })),
        view: (state, h) => h.el("div", state.outer ? null : h.children.outer())
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "")
      // A key change while parked: a new instance, parked from its start.
      root.send({ outer: true, inner: true, key: "b" })
      yield* TestHost.settle
      root.send({ outer: false, inner: true, key: "b" })
      yield* TestHost.settle
      assert.strictEqual(root.text(), "outer ")
      root.send({ outer: false, inner: false, key: "b" })
      yield* TestHost.settle
      assert.strictEqual(root.text(), "outer b:false")
      root.send({ outer: false, inner: false, key: "c" })
      yield* TestHost.settle
      assert.strictEqual(root.text(), "outer c:true")
      assert.deepStrictEqual(lifecycle(root, "/Page/Outer[outer]/Leaf[leaf[a]]"), ["Mounted", "Detached", "Unmounted"])
      assert.deepStrictEqual(lifecycle(root, "/Page/Outer[outer]/Leaf[leaf[b]]"), [
        "Mounted",
        "Detached",
        "Attached",
        "Unmounted"
      ])
    })))

  it.effect("keeps a child that failed while parked failed once placed", () =>
    provideHost(Effect.gen(function*() {
      const Msg = UiSchema.TaggedEnum({ Break: {} })
      const Boom = Command.make("Boom", { args: {} }, () => Effect.die("boom"))
      const Fragile = Component.define({
        name: "Fragile",
        lifetime: "model",
        model: Schema.Null,
        message: Msg,
        receives: ["Break"]
      }).make({ init: () => null, update: (_, __, $) => $.run(Boom()), view: (_, h) => h.el("p", "fine") })
      const Ref = Fragile.ref("fragile")
      const PageMsg = UiSchema.TaggedEnum({ Detach: { detached: Schema.Boolean }, Break: {} })
      const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Boolean, message: PageMsg }).make({
        children: { fragile: Fragile },
        init: () => false,
        update: (_, message, $) => message._tag === "Break" ? $.send(Ref, Msg.Break()) : message.detached,
        view: (detached, h) => h.el("div", "page ", detached ? null : h.children.fragile())
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "page fine")
      root.send(PageMsg.Detach({ detached: true }))
      root.send(PageMsg.Break())
      yield* TestHost.settle
      assert.strictEqual(root.text(), "page ")
      assert.include(
        Cause.pretty((root.log().find((entry) => entry._tag === "Failed") as MessageLog.Failed).cause),
        "boom"
      )
      root.send(PageMsg.Detach({ detached: false }))
      yield* TestHost.settle
      assert.strictEqual(root.text(), "page ")
    })))

  it.effect("places a model child with the slot content of the render that places it", () =>
    provideHost(Effect.gen(function*() {
      const Frame = Component.define({
        name: "Frame",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never,
        slots: ["body"]
      }).make({ init: () => null, update: (model) => model, view: (_, h) => h.el("article", h.slots.body) })
      const State = Schema.Struct({ detached: Schema.Boolean, label: Schema.String })
      const Page = Component.define({ name: "Page", lifetime: "view", model: State, message: State }).make({
        children: { frame: Frame },
        init: () => ({ detached: false, label: "one" }),
        update: (_, next) => next,
        view: (state, h) =>
          h.el("div", state.detached ? null : h.children.frame({ slots: { body: h.el("b", "slot " + state.label) } }))
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "slot one")
      root.send({ detached: true, label: "one" })
      yield* TestHost.settle
      assert.strictEqual(root.text(), "")
      root.send({ detached: true, label: "two" })
      yield* TestHost.settle
      root.send({ detached: false, label: "two" })
      yield* TestHost.settle
      assert.strictEqual(root.text(), "slot two")
    })))

  it.effect("fails the parent on a host that can't hold parked nodes", () =>
    Effect.gen(function*() {
      const Tabs = Component.define({ name: "Tabs", lifetime: "view", model: Schema.Null, message: Schema.Never }).make(
        {
          children: { billing: Billing },
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.el("div")
        }
      )
      const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Null, message: Schema.Never }).make(
        {
          init: () => null,
          update: (model) => model,
          view: (_, h) => Tabs(h, { key: "t", fallback: () => h.el("p", "down") })
        }
      )
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "down")
      const failed = root.log().find((entry) => entry._tag === "Failed") as MessageLog.Failed
      assert.strictEqual(failed.path, "/Page/Tabs[t]")
      assert.include(Cause.pretty(failed.cause), "no createContainer to hold")
    }).pipe(Effect.provide(Renderer.layer(withoutContainer())), provideHost))

  it.effect("restarts a placed child's slot mounts but not those of a child still parked", () =>
    Effect.gen(function*() {
      const running = new Set<string>()
      const track = (name: string) =>
        Mount.make(
          name,
          { args: {} },
          () =>
            Effect.acquireRelease(Effect.sync(() => running.add(name)), () => Effect.sync(() => running.delete(name)))
              .pipe(Effect.andThen(Effect.never))
        )()
      const Frame = Component.define({
        name: "Frame",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never,
        slots: ["body"]
      }).make({ init: () => null, update: (model) => model, view: (_, h) => h.el("article", h.slots.body) })
      const Reveal = Command.make("Reveal", { args: {} }, () => Effect.succeed(true))
      const Inner = Component.define({
        name: "Inner",
        lifetime: "model",
        model: Schema.Boolean,
        message: Schema.Boolean
      })
        .make({
          init: ($) => $.set(false).run(Reveal()),
          update: (_, shown) => shown,
          view: (shown, h) => h.el("div", shown ? h.el("i").onMount(track("inner")) : null)
        })
      const State = Schema.Struct({ frame: Schema.Boolean, inner: Schema.Boolean })
      const Page = Component.define({ name: "Page", lifetime: "view", model: State, message: State }).make({
        children: { frame: Frame, inner: Inner },
        init: () => ({ frame: true, inner: false }),
        update: (_, next) => next,
        view: (state, h) =>
          h.el(
            "main",
            state.frame ? null : h.children.frame({
              slots: { body: [h.el("b").onMount(track("slot")), state.inner ? null : h.children.inner()] }
            })
          )
      })
      const root = yield* TestHost.mount(Page, {})
      const step = Effect.fnUntraced(function*(state: typeof State.Type) {
        root.send(state)
        yield* TestHost.settle
        return Array.from(running).sort()
      })
      yield* TestHost.settle
      assert.deepStrictEqual(Array.from(running), [])
      assert.deepStrictEqual(yield* step({ frame: false, inner: false }), ["inner", "slot"])
      assert.deepStrictEqual(yield* step({ frame: false, inner: true }), ["slot"])
      assert.deepStrictEqual(yield* step({ frame: true, inner: true }), [])
      assert.deepStrictEqual(yield* step({ frame: false, inner: true }), ["slot"])
      assert.deepStrictEqual(yield* step({ frame: false, inner: false }), ["inner", "slot"])
    }).pipe(
      Effect.provide(Renderer.layer({ ...TestHost.makeHost(), runsMounts: true })),
      provideHost
    ))

  it.effect("restarts a model child's mounts when it moves from a parked slot into a visible sibling", () =>
    Effect.gen(function*() {
      let started = 0
      let stopped = 0
      const mountedNodes: Array<unknown> = []
      const Track = Mount.make(
        "Track",
        { args: {} },
        (node) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              started++
              mountedNodes.push(node)
            }),
            () => Effect.sync(() => void stopped++)
          ).pipe(Effect.andThen(Effect.never))
      )
      const Row = Component.define({
        name: "Row",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.el("p").onMount(Track()).children("row")
      })
      const Card = Component.define({
        name: "Card",
        lifetime: "view",
        props: Schema.Boolean,
        model: Schema.Null,
        message: Schema.Never,
        slots: ["body"]
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.el("section", h.props ? h.slots.body : null)
      })
      const Mode = Schema.Literals(["open", "parked", "moved"])
      const Page = Component.define({ name: "Page", lifetime: "view", model: Mode, message: Mode }).make({
        children: { row: Row },
        init: () => "open" as const,
        update: (_, next) => next,
        view: (mode, h) =>
          h.el(
            "main",
            mode === "moved" ? null : Card(h, { key: "c", props: mode === "open", slots: { body: h.children.row() } }),
            h.el("aside", mode === "moved" ? h.children.row() : null)
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.deepStrictEqual([started, stopped], [1, 0])

      root.send("parked")
      yield* TestHost.settle
      assert.deepStrictEqual([started, stopped], [1, 1])

      root.send("moved")
      yield* TestHost.settle
      assert.deepStrictEqual([started, stopped], [2, 1])
      assert.strictEqual(mountedNodes[1], mountedNodes[0])
      assert.strictEqual(root.text(), "row")
    }).pipe(
      Effect.provide(Renderer.layer({ ...TestHost.makeHost(), runsMounts: true })),
      provideHost
    ))

  it.effect("keeps Detached and Attached balanced across nested slot parking and holder moves", () =>
    provideHost(Effect.gen(function*() {
      const Row = Component.define({ name: "Row", lifetime: "model", model: Schema.Null, message: Schema.Never })
        .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("p", "row") })
      const slotBox = (name: string) =>
        Component.define({
          name,
          lifetime: "view",
          props: Schema.Boolean,
          model: Schema.Null,
          message: Schema.Never,
          slots: ["body"]
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.el("div", h.props ? h.slots.body : null)
        })
      const Outer = slotBox("Outer")
      const Inner = slotBox("Inner")
      const State = Schema.Struct({
        outer: Schema.Boolean,
        inner: Schema.Boolean,
        place: Schema.Literals(["nested", "held", "sibling"])
      })
      const Page = Component.define({ name: "Page", lifetime: "view", model: State, message: State }).make({
        children: { row: Row },
        init: () => ({ outer: true, inner: true, place: "nested" as const }),
        update: (_, next) => next,
        view: (state, h) =>
          h.el(
            "main",
            state.place === "nested"
              ? Outer(h, {
                key: "o",
                props: state.outer,
                slots: { body: Inner(h, { key: "i", props: state.inner, slots: { body: h.children.row() } }) }
              })
              : null,
            state.place === "sibling" ? h.el("aside", h.children.row()) : null
          )
      })

      // Close inner, close outer, reopen inner while hidden, then reopen outer.
      const nested = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      for (
        const next of [
          { outer: true, inner: false, place: "nested" },
          { outer: false, inner: false, place: "nested" },
          { outer: false, inner: true, place: "nested" },
          { outer: true, inner: true, place: "nested" }
        ] as const
      ) {
        nested.send(next)
        yield* TestHost.settle
      }
      assert.strictEqual(nested.text(), "row")
      assert.deepStrictEqual(lifecycle(nested, "/Page/Row[row]"), ["Mounted", "Detached", "Attached"])

      // Close outer, move the row into its author's holder, then place it in a visible sibling.
      const held = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      for (
        const next of [
          { outer: false, inner: true, place: "nested" },
          { outer: false, inner: true, place: "held" },
          { outer: false, inner: true, place: "sibling" }
        ] as const
      ) {
        held.send(next)
        yield* TestHost.settle
      }
      assert.strictEqual(held.text(), "row")
      assert.deepStrictEqual(lifecycle(held, "/Page/Row[row]"), ["Mounted", "Detached", "Attached"])
    })))

  it.effect(
    "keeps Detached and Attached balanced when moving a receiver or wrapping it in an ordinary component",
    () =>
      provideHost(Effect.gen(function*() {
        const Row = Component.define({ name: "Row", lifetime: "model", model: Schema.Null, message: Schema.Never })
          .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("p", "row") })
        const slotBox = (name: string) =>
          Component.define({
            name,
            lifetime: "view",
            props: Schema.Boolean,
            model: Schema.Null,
            message: Schema.Never,
            slots: ["body"]
          }).make({
            init: () => null,
            update: (model) => model,
            view: (_, h) => h.el("div", h.props ? h.slots.body : null)
          })
        const Outer = slotBox("Outer")
        const Inner = slotBox("Inner")

        // Move the inner receiver (with its listed row) from a parked outer slot to a visible sibling, then close it.
        const MoveState = Schema.Struct({ outer: Schema.Boolean, inner: Schema.Boolean, moved: Schema.Boolean })
        const MovePage = Component.define({ name: "MovePage", lifetime: "view", model: MoveState, message: MoveState })
          .make({
            children: { row: Row },
            init: () => ({ outer: true, inner: true, moved: false }),
            update: (_, next) => next,
            view: (state, h) => {
              const inner = Inner(h, { key: "i", props: state.inner, slots: { body: h.children.row() } })
              return h.el(
                "main",
                Outer(h, { key: "o", props: state.outer, slots: { body: state.moved ? null : inner } }),
                state.moved ? h.el("aside", inner) : null
              )
            }
          })
        const moved = yield* TestHost.mount(MovePage, {})
        yield* TestHost.settle
        for (
          const next of [
            { outer: false, inner: true, moved: false },
            { outer: false, inner: true, moved: true },
            { outer: false, inner: false, moved: true }
          ]
        ) {
          moved.send(next)
          yield* TestHost.settle
        }
        assert.strictEqual(moved.text(), "")
        assert.deepStrictEqual(lifecycle(moved, "/MovePage/Row[row]"), [
          "Mounted",
          "Detached",
          "Attached",
          "Detached"
        ])

        // Inner receiver rendered by an ordinary component inside the outer slot: close outer, close inner, reopen outer, reopen inner.
        const WrapProps = Schema.Struct({ inner: Schema.Boolean })
        const Wrap = Component.define({
          name: "Wrap",
          lifetime: "view",
          props: WrapProps,
          model: Schema.Null,
          message: Schema.Never
        }).make({
          children: { row: Row },
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            h.el("section", Inner(h, { key: "i", props: h.props.inner, slots: { body: h.children.row() } }))
        })
        const WrapState = Schema.Struct({ outer: Schema.Boolean, inner: Schema.Boolean })
        const WrapPage = Component.define({ name: "WrapPage", lifetime: "view", model: WrapState, message: WrapState })
          .make({
            init: () => ({ outer: true, inner: true }),
            update: (_, next) => next,
            view: (state, h) =>
              Outer(h, {
                key: "o",
                props: state.outer,
                slots: { body: Wrap(h, { key: "w", props: { inner: state.inner } }) }
              })
          })
        const wrapped = yield* TestHost.mount(WrapPage, {})
        yield* TestHost.settle
        for (
          const next of [
            { outer: false, inner: true },
            { outer: false, inner: false },
            { outer: true, inner: false },
            { outer: true, inner: true }
          ]
        ) {
          wrapped.send(next)
          yield* TestHost.settle
        }
        assert.strictEqual(wrapped.text(), "row")
        // Wrap is a view component in Outer's slot: closing the slot resets it, and the row it lists with it.
        assert.deepStrictEqual(lifecycle(wrapped, "/WrapPage/Outer[o]/[body]/Wrap[w]/Row[row]"), [
          "Mounted",
          "Unmounted",
          "Mounted",
          "Detached",
          "Attached"
        ])
      }))
  )

  it.effect("starts a mount under a handle the host recycled from a removed parent's container", () =>
    Effect.gen(function*() {
      const { containers, host, recycle, root: container, text } = numbered()
      let started = 0
      const Track = Mount.make(
        "Track",
        { args: {} },
        () => Effect.sync(() => void started++).pipe(Effect.andThen(Effect.never))
      )
      const Tabs = Component.define({
        name: "Tabs",
        lifetime: "view",
        props: Schema.Boolean,
        model: Schema.Null,
        message: Schema.Never
      }).make({
        children: { billing: Billing },
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.el("div", h.props ? null : h.children.billing())
      })
      const State = Schema.Struct({ key: Schema.String, detached: Schema.Boolean, tracked: Schema.Boolean })
      const Page = Component.define({ name: "Page", lifetime: "view", model: State, message: State }).make({
        init: () => ({ key: "a", detached: true, tracked: false }),
        update: (_, next) => next,
        view: (state, h) =>
          h.el(
            "main",
            Tabs(h, { key: state.key, props: state.detached }),
            state.tracked ? h.el("b").onMount(Track()) : null
          )
      })
      const root = yield* Renderer.mount(Page, {}, container).pipe(Effect.provide(Renderer.layer(host)))
      yield* TestHost.settle
      assert.strictEqual(text(container), "")
      root.send({ key: "a", detached: false, tracked: false })
      yield* TestHost.settle
      assert.strictEqual(text(container), "billing")
      root.send({ key: "a", detached: true, tracked: false })
      yield* TestHost.settle
      const oldContainer = containers.at(-1)!
      // A new key removes Tabs[a], whose view declared the container: the host may use its handle again.
      root.send({ key: "c", detached: true, tracked: false })
      yield* TestHost.settle
      const shell = recycle(oldContainer, "shell")
      host.insertBefore(shell, container, undefined)
      root.send({ key: "c", detached: true, tracked: true })
      yield* TestHost.settle
      assert.strictEqual(started, 1)
    }).pipe(provideHost))

  it("a Scene counts a mount in a model child's slot as new once the child is placed", () => {
    const Track = Mount.make("Track", { args: {} }, () => Effect.never)
    const Frame = Component.define({
      name: "Frame",
      lifetime: "model",
      model: Schema.Null,
      message: Schema.Never,
      slots: ["body"]
    }).make({ init: () => null, update: (model) => model, view: (_, h) => h.el("article", h.slots.body) })
    const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Boolean, message: Schema.Boolean })
      .make({
        children: { frame: Frame },
        init: () => true,
        update: (detached) => !detached,
        view: (detached, h) =>
          h.el(
            "div",
            h.el("button").on("click", true).children("toggle"),
            detached ? null : h.children.frame({ slots: { body: h.el("b").onMount(Track()) } })
          )
      })
    const s = Scene.start(Page, {})
    assert.throws(() => s.expectMount(Track()), /no rendered mount matches Track/)
    s.click(Locator.text("toggle")).expectMount(Track())
  })

  it.effect("remounts unplaced held model children when a parent's keyed Layer changes", () =>
    provideHost(Effect.gen(function*() {
      class RoomSvc extends Context.Service<RoomSvc, string>()("test/HeldKeyedRoomSvc") {}
      class WorkerRes extends Context.Service<WorkerRes, string>()("test/HeldKeyedWorkerRes") {}
      const Key = Schema.Literals(["a", "b", "slow", "fast"])
      const makeRoom = (
        slowGate: Deferred.Deferred<void>,
        opened: Array<string>,
        closed: Array<string>
      ) => {
        const Worker = Component.define({
          name: "Worker",
          lifetime: "model",
          model: Schema.Null,
          message: Schema.Never
        }).make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.el("p", "worker")
        }).pipe(
          Component.provide(
            Layer.effect(
              WorkerRes,
              Effect.gen(function*() {
                const room = yield* RoomSvc
                return yield* Effect.acquireRelease(
                  Effect.sync(() => {
                    opened.push(room)
                    return room
                  }),
                  () => Effect.sync(() => void closed.push(room))
                )
              })
            )
          )
        )
        return Component.provide(
          Component.define({
            name: "Room",
            lifetime: "view",
            props: Schema.Struct({ key: Key }),
            model: Key,
            message: Key
          }).make({
            children: { worker: Worker },
            init: ($) => $.props.key,
            update: (_, next) => next,
            view: (_, h) => h.el("div", "hidden")
          }),
          {
            key: (_, key) => key,
            layer: (key) =>
              key === "slow"
                ? Layer.effect(RoomSvc, Effect.as(Deferred.await(slowGate), "slow"))
                : Layer.succeed(RoomSvc, key)
          }
        )
      }

      // Old key ready -> new key ready: old held child's resource closes and new one opens immediately.
      const opened1: Array<string> = []
      const closed1: Array<string> = []
      const gate1 = yield* Deferred.make<void>()
      const root1 = yield* TestHost.mount(makeRoom(gate1, opened1, closed1), { key: "a" as const })
      yield* TestHost.settle
      assert.deepStrictEqual(opened1, ["a"])
      assert.deepStrictEqual(closed1, [])
      root1.send("b")
      yield* TestHost.settle
      assert.deepStrictEqual(opened1, ["a", "b"])
      assert.deepStrictEqual(closed1, ["a"])

      // Old key pending -> new key ready: new held child's resource opens immediately on key change.
      const opened2: Array<string> = []
      const closed2: Array<string> = []
      const gate2 = yield* Deferred.make<void>()
      const root2 = yield* TestHost.mount(makeRoom(gate2, opened2, closed2), { key: "slow" as const })
      yield* TestHost.settle
      assert.deepStrictEqual(opened2, [])
      root2.send("fast")
      yield* TestHost.settle
      assert.deepStrictEqual(opened2, ["fast"])
      assert.deepStrictEqual(closed2, [])
    })))

  it.effect(
    "allows a headless child's own updates to re-render a single listed child while rejecting simultaneous duplicates",
    () =>
      provideHost(Effect.gen(function*() {
        const Leaf = Component.define({ name: "Leaf", lifetime: "model", model: Schema.Null, message: Schema.Never })
          .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("p", "leaf") })
        const Panel = Component.define({
          name: "Panel",
          lifetime: "view",
          model: Schema.Boolean,
          message: Schema.Boolean
        }).make({
          init: () => false,
          update: (on) => !on,
          parts: (on, p) => ({
            label: on ? "on" : "off",
            toggle: p.part((b) => b.on("click", true))
          })
        })
        const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Null, message: Schema.Never })
          .make({
            children: { leaf: Leaf },
            init: () => null,
            update: (model) => model,
            view: (_, h) =>
              Panel(h, {
                key: "p",
                view: (parts) => h.el("div", parts.toggle(h.el("button", parts.label)), h.children.leaf())
              })
          })
        const root = yield* TestHost.mount(Page, {})
        yield* TestHost.settle
        assert.strictEqual(root.text(), "offleaf")
        Locator.fire(root.get(Locator.text("off", { exact: true })), "click")
        yield* TestHost.settle
        assert.strictEqual(root.text(), "onleaf")

        // Simultaneous duplicate placement across author view and headless closure still fails the author.
        const Duplicate = Component.define({
          name: "Duplicate",
          lifetime: "view",
          model: Schema.Null,
          message: Schema.Never
        }).make({
          children: { leaf: Leaf },
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            h.el(
              "div",
              h.children.leaf(),
              Panel(h, { key: "p", view: () => h.children.leaf() })
            )
        })
        const Host = Component.define({ name: "Host", lifetime: "view", model: Schema.Null, message: Schema.Never })
          .make({
            init: () => null,
            update: (model) => model,
            view: (_, h) => Duplicate(h, { key: "d", fallback: () => h.el("p", "failed") })
          })
        const dup = yield* TestHost.mount(Host, {})
        yield* TestHost.settle
        assert.strictEqual(dup.text(), "failed")
        const failed = dup.log().find((entry) => entry._tag === "Failed") as MessageLog.Failed | undefined
        assert.isDefined(failed)
        assert.include(Cause.pretty(failed!.cause), "renders two children with the ref leaf")
      }))
  )
})

// ---------------------------------------------------------------------------
// Children drawn in one tree and moved to another
// ---------------------------------------------------------------------------
const Pane = Component.define({
  name: "Pane",
  lifetime: "view",
  model: Schema.Null,
  message: Schema.Never,
  slots: ["body"]
}).make({ init: () => null, update: (m) => m, view: (_, h) => h.el("section", h.slots.body) })

const TipMessage = UiSchema.TaggedEnum({ Enter: { id: Schema.String } })
const Tips = Component.define({
  name: "Tips",
  lifetime: "view",
  props: Schema.Struct({ label: Schema.String }),
  model: Schema.NullOr(Schema.String),
  message: TipMessage,
  receives: ["Enter"],
  shares: (open, props) => ({ open, label: props.label })
}).make({ init: () => null, update: (_, message) => message.id, parts: () => ({}) })
const Tip = Component.define({
  name: "Tip",
  lifetime: "model",
  model: Schema.Null,
  message: TipMessage,
  shared: { tips: { owner: Tips, optional: true } }
}).make({
  init: () => null,
  update: (model, message, $) => $.set(model).send(Tips, message),
  view: (_, h) =>
    h.el("button").on("click", TipMessage.Enter({ id: "a" })).children(
      `${h.shared.tips?.open === "a" ? "open" : "closed"}${h.shared.tips?.label}`
    )
})
describe("model children drawn across trees", () => {
  it.effect("draws a row that was the only content of one outlet in another", () =>
    Effect.gen(function*() {
      const Row = Component.define({ name: "Row", lifetime: "model", model: Schema.Null, message: Schema.Never })
        .make({ init: () => null, update: (m) => m, view: (_, h) => h.el("i", "row") })
      const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Boolean, message: Schema.Boolean })
        .make({
          children: { row: Row },
          init: () => false,
          update: (_, left) => left,
          view: (left, h) =>
            h.el(
              "main",
              Pane(h, { key: "l", slots: { body: left ? h.children.row() : "l" } }),
              Pane(h, { key: "r", slots: { body: left ? null : h.children.row() } })
            )
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send(true)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "row")
      assert.deepStrictEqual(root.log().filter((e) => e._tag === "Failed"), [])
    }).pipe(provideHost))

  it.effect("draws a row in a parked Frame's slot with what its lister lists now", () =>
    Effect.gen(function*() {
      let inits = 0
      const Row = Component.define({
        name: "Row",
        lifetime: "model",
        props: Schema.Struct({ label: Schema.String }),
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => {
          inits++
          return null
        },
        update: (m) => m,
        view: (_, h) => h.el("i", h.props.label)
      })
      const Frame = Component.define({
        name: "Frame",
        lifetime: "model",
        props: Schema.Struct({ open: Schema.Boolean }),
        model: Schema.Null,
        message: Schema.Never,
        slots: ["body"]
      }).make({
        init: () => null,
        update: (m) => m,
        view: (_, h) => h.el("article", h.props.open ? h.slots.body : null)
      })
      const State = Schema.Struct({ shown: Schema.Boolean, open: Schema.Boolean, row: Schema.NullOr(Schema.String) })
      const Page = Component.define({ name: "Page", lifetime: "view", model: State, message: State }).make({
        children: {
          frame: Child.one(Frame, { props: (s) => ({ open: s.open }) }),
          row: Child.optional(Row, { props: (s) => s.row === null ? null : { label: s.row } })
        },
        init: () => ({ shown: true, open: true, row: "a" }),
        update: (_, next) => next,
        view: (s, h) => h.el("main", s.shown ? h.children.frame({ slots: { body: h.children.row?.() ?? null } }) : null)
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(inits, 1)
      // Parked with the row in its slot, then the row's props change.
      root.send({ shown: false, open: true, row: "a" })
      yield* TestHost.settle
      root.send({ shown: false, open: true, row: "b" })
      yield* TestHost.settle
      root.send({ shown: false, open: false, row: "b" })
      yield* TestHost.settle
      root.send({ shown: false, open: true, row: "b" })
      yield* TestHost.settle
      root.send({ shown: true, open: true, row: "b" })
      yield* TestHost.settle
      assert.strictEqual(root.text(), "b")
      assert.strictEqual(inits, 1)
      // Unlisted while the Frame is parked: closing and opening its slot doesn't make it again.
      root.send({ shown: false, open: true, row: "b" })
      yield* TestHost.settle
      root.send({ shown: false, open: true, row: null })
      yield* TestHost.settle
      root.send({ shown: false, open: false, row: null })
      yield* TestHost.settle
      root.send({ shown: false, open: true, row: null })
      yield* TestHost.settle
      assert.strictEqual(inits, 1)
      assert.deepStrictEqual(root.log().filter((e) => e._tag === "Failed"), [])
    }).pipe(provideHost))

  it.effect("moves a row out of a listed, parked Frame's slot into a visible sibling", () =>
    Effect.gen(function*() {
      const mounts: Array<string> = []
      const Track = Mount.make("Track", { args: {} }, () =>
        Effect.acquireRelease(
          Effect.sync(() => mounts.push("start")),
          () => Effect.sync(() => mounts.push("stop"))
        )
          .pipe(Effect.andThen(Effect.never)))
      const Row = Component.define({ name: "Row", lifetime: "model", model: Schema.Null, message: Schema.Never })
        .make({ init: () => null, update: (m) => m, view: (_, h) => h.el("i").onMount(Track()).children("row") })
      const Frame = Component.define({
        name: "Frame",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never,
        slots: ["body"]
      }).make({ init: () => null, update: (m) => m, view: (_, h) => h.el("article", h.slots.body) })
      const State = Schema.Literals(["framed", "parked", "aside", "unlisted"])
      const Page = Component.define({ name: "Page", lifetime: "view", model: State, message: State }).make({
        children: { frame: Child.optional(Frame, { props: (s) => s === "unlisted" ? null : {} }), row: Row },
        init: () => "framed" as const,
        update: (_, next) => next,
        view: (s, h) =>
          h.el(
            "main",
            s === "framed" ? h.children.frame?.({ slots: { body: h.children.row() } }) ?? null : null,
            s === "aside" || s === "unlisted" ? h.el("aside", h.children.row()) : null
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send("parked")
      yield* TestHost.settle
      assert.deepStrictEqual(mounts, ["start", "stop"])
      root.send("aside")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "row")
      assert.deepStrictEqual(root.log().filter((e) => e._tag === "Failed"), [])
      assert.deepStrictEqual(mounts, ["start", "stop", "start"])
      root.send("unlisted")
      yield* TestHost.settle
      assert.deepStrictEqual(mounts, ["start", "stop", "start"])
      assert.strictEqual(root.text(), "row")
    }).pipe(
      Effect.provide(Renderer.layer({ ...TestHost.makeHost(), runsMounts: true })),
      provideHost
    ))

  it.effect("moves a row out of a parked Frame's slot as the Frame is unlisted, and restarts its mounts", () =>
    Effect.gen(function*() {
      const mounts: Array<string> = []
      const Track = Mount.make(
        "Track",
        { args: {} },
        () =>
          Effect.acquireRelease(Effect.sync(() => mounts.push("start")), () => Effect.sync(() => mounts.push("stop")))
            .pipe(Effect.andThen(Effect.never))
      )
      const Row = Component.define({ name: "Row", lifetime: "model", model: Schema.Null, message: Schema.Never })
        .make({ init: () => null, update: (m) => m, view: (_, h) => h.el("i").onMount(Track()).children("row") })
      const Frame = Component.define({
        name: "Frame",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never,
        slots: ["body"]
      }).make({ init: () => null, update: (m) => m, view: (_, h) => h.el("article", h.slots.body) })
      const State = Schema.Literals(["framed", "parked", "aside", "unlisted"])
      const Page = Component.define({ name: "Page", lifetime: "view", model: State, message: State }).make({
        children: { frame: Child.optional(Frame, { props: (s) => s === "unlisted" ? null : {} }), row: Row },
        init: () => "framed" as const,
        update: (_, next) => next,
        view: (s, h) =>
          h.el(
            "main",
            s === "framed" ? h.children.frame?.({ slots: { body: h.children.row() } }) ?? null : null,
            s === "aside" || s === "unlisted" ? h.el("aside", h.children.row()) : null
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send("parked")
      yield* TestHost.settle
      assert.deepStrictEqual(mounts, ["start", "stop"])
      root.send("unlisted")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "row")
      assert.deepStrictEqual(root.log().filter((e) => e._tag === "Failed"), [])
      assert.deepStrictEqual(mounts, ["start", "stop", "start"])
    }).pipe(
      Effect.provide(Renderer.layer({ ...TestHost.makeHost(), runsMounts: true })),
      provideHost
    ))

  it.effect("resolves the author's refs in a drawn model child's slot", () =>
    Effect.gen(function*() {
      const Field = Renderer.ref("Field")
      const LeafMsg = UiSchema.TaggedEnum({ Inc: {} })
      const Leaf = Component.define({
        name: "Leaf",
        lifetime: "view",
        model: Schema.Number,
        message: LeafMsg,
        receives: ["Inc"]
      })
        .make({ init: () => 0, update: (n) => n + 1, view: (n, h) => h.el("b", "leaf " + n) })
      const LeafRef = Leaf.ref("leaf")
      const Frame = Component.define({
        name: "Frame",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never,
        slots: ["body"]
      }).make({ init: () => null, update: (m) => m, view: (_, h) => h.el("article", h.slots.body) })
      const Look = Command.make("Look", { args: {} }, () =>
        Effect.gen(function*() {
          const refs = yield* Renderer.Refs
          return Option.isSome(yield* refs.lookup(Field))
        }))
      const PageMsg = UiSchema.TaggedEnum({ Found: { found: Schema.Boolean }, Inc: {} })
      const Page = Component.define({
        name: "Page",
        lifetime: "view",
        model: Schema.optional(Schema.Boolean),
        message: PageMsg
      }).make({
        children: { frame: Frame },
        init: ($) => $.set(undefined).run(Look().pipe(Command.map((found) => PageMsg.Found({ found })))),
        update: (model, message, $) =>
          PageMsg.match(message, { Found: ({ found }) => found, Inc: () => $.set(model).send(LeafRef, LeafMsg.Inc()) }),
        view: (_, h) =>
          h.el("main", h.children.frame({ slots: { body: [h.el("input").ref(Field), Leaf(h, { ref: LeafRef })] } }))
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.model(), true)
      root.send(PageMsg.Inc())
      yield* TestHost.settle
      assert.strictEqual(root.text(), "leaf 1")
    }).pipe(provideHost))

  it.effect("fails the author of a child whose ref names a listed child", () =>
    Effect.gen(function*() {
      const Leaf = Component.define({ name: "Leaf", lifetime: "view", model: Schema.Null, message: Schema.Never })
        .make({ init: () => null, update: (m) => m, view: (_, h) => h.el("b", "leaf") })
      const Box = Component.define({ name: "Box", lifetime: "model", model: Schema.Null, message: Schema.Never })
        .make({ init: () => null, update: (m) => m, view: (_, h) => h.el("i", "box") })
      const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Null, message: Schema.Never })
        .make({
          children: { box: Box },
          init: () => null,
          update: (m) => m,
          view: (_, h) => h.el("main", Leaf(h, { ref: Leaf.ref("box") }))
        })
      yield* TestHost.mount(Page, {})
      const crashed = yield* Effect.flip(TestHost.settle)
      assert.include(String(crashed), "/Page: ref box names a listed child")
    }).pipe(provideHost))

  it.effect("sends from a drawn reader to the owner it reads", () =>
    Effect.gen(function*() {
      const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Null, message: Schema.Never })
        .make({
          children: { tip: Tip },
          init: () => null,
          update: (m) => m,
          view: (_, h) =>
            Tips(h, {
              key: "outer",
              props: { label: "O" },
              view: () => h.el("main", Tips(h, { key: "inner", props: { label: "I" }, view: () => h.children.tip() }))
            })
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "closedI")
      Locator.fire(root.get(Locator.text("closedI")), "click")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "openI")
    }).pipe(provideHost))

  it.effect("rehomes a reader drawn in a moved model child's slot", () =>
    Effect.gen(function*() {
      const Frame = Component.define({
        name: "Frame",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never,
        slots: ["body"]
      }).make({ init: () => null, update: (m) => m, view: (_, h) => h.el("article", h.slots.body) })
      const Side = Schema.Literals(["a", "b"])
      const Page = Component.define({ name: "Page", lifetime: "view", model: Side, message: Side }).make({
        children: { frame: Frame, tip: Tip },
        init: () => "a" as const,
        update: (_, side) => side,
        view: (side, h) => {
          const frame = h.children.frame({ slots: { body: h.children.tip() } })
          return h.el(
            "main",
            Tips(h, { key: "a", props: { label: "A" }, view: () => side === "a" ? frame : h.el("i") }),
            Tips(h, { key: "b", props: { label: "B" }, view: () => side === "b" ? frame : h.el("i") })
          )
        }
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "closedA")
      root.send("b")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "closedB")
    }).pipe(provideHost))

  it.effect("draws a parked optional reader under its owner, which it reads and reports to", () =>
    Effect.gen(function*() {
      const Group = Component.define({
        name: "Group",
        lifetime: "view",
        model: Schema.Boolean,
        message: Schema.Boolean,
        shares: { value: (on) => on, collects: { schema: Schema.Boolean, onChange: (all) => all.includes(true) } }
      }).make({ init: () => false, update: (_, on) => on, parts: (on) => ({ on }) })
      const Reader = Component.define({
        name: "Reader",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never,
        shared: { group: { owner: Group, optional: true, report: () => true } }
      }).make({
        init: () => null,
        update: (m) => m,
        view: (_, h) => h.el("b", h.shared.group === undefined ? "none" : "in")
      })
      const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Boolean, message: Schema.Boolean })
        .make({
          children: { reader: Reader },
          init: () => false,
          update: (_, show) => show,
          view: (show, h) =>
            Group(h, {
              key: "g",
              view: (parts) => h.el("main", parts.on ? "on " : "off ", show ? h.children.reader() : null)
            })
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "off ")
      root.send(true)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "on in")
    }).pipe(provideHost))
  it.effect("moves its own listed field between sections while parked", () =>
    Effect.gen(function*() {
      const Field = Component.define({ name: "Field", lifetime: "model", model: Schema.Null, message: Schema.Never })
        .make({ init: () => null, update: (m) => m, view: (_, h) => h.el("i", "field") })
      const FrameMsg = UiSchema.TaggedEnum({ Move: {} })
      const Frame = Component.define({
        name: "Frame",
        lifetime: "model",
        model: Schema.Boolean,
        message: FrameMsg,
        receives: ["Move"]
      }).make({
        children: { field: Field },
        init: () => false,
        update: () => true,
        view: (left, h) =>
          h.el("article", h.el("p", left ? h.children.field() : null), h.el("q", left ? null : h.children.field()))
      })
      const PageMsg = UiSchema.TaggedEnum({ Hide: {}, Move: {}, Show: {} })
      const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Boolean, message: PageMsg })
        .make({
          children: { frame: Frame },
          init: () => true,
          update: (shown, message, $) =>
            PageMsg.match(message, {
              Hide: () => false,
              Move: () => $.set(shown).send(Frame.ref("frame"), FrameMsg.Move()),
              Show: () => true
            }),
          view: (shown, h) => h.el("main", shown ? h.children.frame() : null)
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send(PageMsg.Hide())
      yield* TestHost.settle
      root.send(PageMsg.Move())
      yield* TestHost.settle
      root.send(PageMsg.Show())
      yield* TestHost.settle
      assert.strictEqual(root.text(), "field")
      assert.deepStrictEqual(root.log().filter((e) => e._tag === "Failed"), [])
    }).pipe(provideHost))

  const refPage = (start: "key" | "ref" | "closure") => {
    const Leaf = Component.define({ name: "Leaf", lifetime: "view", model: Schema.Null, message: Schema.Never })
      .make({ init: () => null, update: (m) => m, view: (_, h) => h.el("b", "leaf") })
    const Box = Component.define({ name: "Box", lifetime: "model", model: Schema.Null, message: Schema.Never })
      .make({ init: () => null, update: (m) => m, view: (_, h) => h.el("i", "box") })
    const How = Schema.Literals(["key", "ref", "closure"])
    return Component.define({ name: "Page", lifetime: "view", model: How, message: How }).make({
      children: { box: Box },
      init: () => start,
      update: (_, how) => how,
      view: (how, h) =>
        how === "closure"
          ? Tips(h, { key: "t", props: { label: "T" }, view: () => Leaf(h, { ref: Leaf.ref("box") }) })
          : h.el("main", how === "key" ? Leaf(h, { key: "box" }) : Leaf(h, { ref: Leaf.ref("box") }))
    })
  }

  it.effect("fails the author when a patch gives a child a listed child's ref", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(refPage("key"), {})
      yield* TestHost.settle
      root.send("ref")
      const crashed = yield* Effect.flip(TestHost.settle)
      assert.include(String(crashed), "/Page: ref box names a listed child")
    }).pipe(provideHost))

  it.effect("fails the author of a closure that gives a child a listed child's ref", () =>
    Effect.gen(function*() {
      yield* TestHost.mount(refPage("closure"), {})
      const crashed = yield* Effect.flip(TestHost.settle)
      assert.include(String(crashed), "/Page: ref box names a listed child")
    }).pipe(provideHost))

  it.effect("keeps a row where it's drawn when a parked Frame reopens the slot it left", () =>
    Effect.gen(function*() {
      const mounts: Array<string> = []
      const Track = Mount.make("Track", { args: {} }, () =>
        Effect.acquireRelease(
          Effect.sync(() => mounts.push("start")),
          () => Effect.sync(() => mounts.push("stop"))
        )
          .pipe(Effect.andThen(Effect.never)))
      const Row = Component.define({ name: "Row", lifetime: "model", model: Schema.Null, message: Schema.Never })
        .make({ init: () => null, update: (m) => m, view: (_, h) => h.el("i").onMount(Track()).children("row") })
      const FrameMsg = UiSchema.TaggedEnum({ Toggle: {} })
      const Frame = Component.define({
        name: "Frame",
        lifetime: "model",
        model: Schema.Boolean,
        message: FrameMsg,
        receives: ["Toggle"],
        slots: ["body"]
      }).make({
        init: () => true,
        update: (open) => !open,
        view: (open, h) => h.el("article", open ? h.slots.body : null)
      })
      const Tab = Component.define({
        name: "Tab",
        lifetime: "model",
        model: Schema.Null,
        message: Schema.Never,
        slots: ["aside"]
      }).make({ init: () => null, update: (m) => m, view: (_, h) => h.el("aside", h.slots.aside) })
      // Shows its slot while open: closing it parks Tab without a render of Page.
      const Fold = Component.define({
        name: "Fold",
        lifetime: "view",
        model: Schema.Boolean,
        message: FrameMsg,
        receives: ["Toggle"],
        slots: ["body"]
      }).make({ init: () => true, update: (open) => !open, view: (open, h) => h.el("div", open ? h.slots.body : null) })
      const FoldRef = Fold.ref("fold")
      const PageMsg = UiSchema.TaggedEnum({ Move: {}, Fold: {}, Toggle: {} })
      const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Boolean, message: PageMsg }).make({
        children: { frame: Frame, tab: Tab, row: Row },
        init: () => false,
        update: (moved, message, $) =>
          PageMsg.match(message, {
            Move: () => true,
            Fold: () => $.set(moved).send(FoldRef, FrameMsg.Toggle()),
            Toggle: () => $.set(moved).send(Frame.ref("frame"), FrameMsg.Toggle())
          }),
        view: (moved, h) =>
          h.el(
            "main",
            moved ? null : h.children.frame({ slots: { body: h.children.row() } }),
            Fold(h, {
              ref: FoldRef,
              slots: { body: h.children.tab({ slots: { aside: moved ? h.children.row() : null } }) }
            })
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      // Frame is parked with the row in its slot, which Tab's aside draws now.
      root.send(PageMsg.Move())
      yield* TestHost.settle
      root.send(PageMsg.Fold())
      yield* TestHost.settle
      // Frame's old slot closes, opens and closes again: the row stays in Tab's aside throughout.
      root.send(PageMsg.Toggle())
      yield* TestHost.settle
      root.send(PageMsg.Toggle())
      yield* TestHost.settle
      root.send(PageMsg.Toggle())
      yield* TestHost.settle
      root.send(PageMsg.Fold())
      yield* TestHost.settle
      assert.strictEqual(root.text(), "row")
      assert.deepStrictEqual(
        lifecycle(root, "/Page/Row[row]").filter((tag) => tag === "Detached" || tag === "Attached"),
        []
      )
      assert.deepStrictEqual(mounts, ["start", "stop", "start"])
      assert.deepStrictEqual(root.log().filter((e) => e._tag === "Failed"), [])
    }).pipe(
      Effect.provide(Renderer.layer({ ...TestHost.makeHost(), runsMounts: true })),
      provideHost
    ))

  it.effect("fails the author of a feature fallback that gives a child a listed child's ref", () =>
    Effect.gen(function*() {
      class Editor extends Feature.Service<Editor>()("ParkedChildren/Editor", { props: Schema.Struct({}) }) {}
      const EditorView = Component.define({
        name: "EditorView",
        lifetime: "view",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({ init: () => null, update: (m) => m, view: (_, h) => h.text("editor") })
      const Leaf = Component.define({ name: "Leaf", lifetime: "view", model: Schema.Null, message: Schema.Never })
        .make({ init: () => null, update: (m) => m, view: (_, h) => h.el("b", "leaf") })
      const Box = Component.define({ name: "Box", lifetime: "model", model: Schema.Null, message: Schema.Never })
        .make({ init: () => null, update: (m) => m, view: (_, h) => h.el("i", "box") })
      const Page = Component.define({ name: "Page", lifetime: "view", model: Schema.Null, message: Schema.Never })
        .make({
          children: { box: Box },
          init: () => null,
          update: (m) => m,
          view: (_, h) =>
            h.el("main", Editor.render(h, { key: "e", props: {}, fallback: () => Leaf(h, { ref: Leaf.ref("box") }) }))
        })
        .pipe(Component.provide(Editor.toLayer(EditorView).pipe(Layer.provide(Layer.effectDiscard(Effect.never)))))
      yield* TestHost.mount(Page, {})
      const crashed = yield* Effect.flip(TestHost.settle)
      assert.include(String(crashed), "/Page: ref box names a listed child")
    }).pipe(provideHost))

  it.effect("fails a scene whose view gives a child a listed child's ref", () =>
    Effect.gen(function*() {
      const crashed = yield* Effect.exit(
        Effect.flatMap(Scene.make(refPage("ref"), {}), (s) => Effect.sync(() => s.view))
      )
      assert.include(String(crashed), "/Page: ref box names a listed child")
    }).pipe(Effect.scoped))
})
