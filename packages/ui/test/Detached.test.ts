import { Child, Command, Component, Head, type MessageLog, Mount, Renderer, UiSchema } from "@effect/ui"
import { Locator, Scene, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Option, Schema } from "effect"

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
// A settings page with two tabs, each a form that is detached while hidden
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

describe("detached children", () => {
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

  it.effect("keeps a nested model child detached when its parent is placed, and detaches a new key", () =>
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
      // A key change while detached: a new instance, detached from its start.
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

  it.effect("keeps a child that failed while detached failed once placed", () =>
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

  it.effect("fails the parent on a host that can't hold detached nodes", () =>
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
      assert.include(Cause.pretty(failed.cause), "this host has no createContainer")
    }).pipe(Effect.provide(Renderer.layer(withoutContainer())), provideHost))

  it.effect("restarts a placed child's slot mounts but not those of a child still detached", () =>
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
})
