import { Cause, Deferred, Effect, Option, Schema } from "effect"

import { Command, Component, Head, type MessageLog, Mount, Renderer, UiSchema } from "@effect/ui"
import { Locator, Scene, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"

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

const Billing = Component.define({ name: "Billing", model: Schema.Null, message: Schema.Never }).make({
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
  const Form = Profile.ref("Form")
  return Component.define({ name: "Settings", model: SettingsModel, message: SettingsMsg }).make({
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
        Profile(h, {
          ref: Form,
          detached: model.tab !== "profile",
          // Reads the tab at each render: an emit while detached sees the latest.
          onEmit: (event) => SettingsMsg.Saved({ text: event.text + "@" + model.tab })
        }),
        Billing(h, { key: "billing", detached: model.tab !== "billing" })
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

/** A test host that stores each element's events, as a host without `events` does. */
const withoutEvents = () => {
  const { events: _, ...host } = TestHost.makeHost()
  return host
}

describe("detached children", () => {
  it.effect("a hidden tab keeps its draft and its save, gets messages, and emits through the latest onEmit", () =>
    provideHost(Effect.gen(function*() {
      const saving = yield* Deferred.make<void>()
      const root = yield* TestHost.mount(makeSettings(makeForm(saving)), {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "draft:savesaved:")

      click(root, "draft:")
      yield* TestHost.settle
      click(root, "save")
      yield* TestHost.settle
      root.send(SettingsMsg.Show({ tab: "billing" }))
      yield* TestHost.settle
      assert.strictEqual(root.head().title, "Settings")
      assert.strictEqual(root.text(), "billing")

      // The save ends while the form is out of the document, and its emit reaches the parent.
      yield* Deferred.succeed(saving, undefined)
      yield* TestHost.settle
      assert.deepStrictEqual(root.model()?.saved, ["a@billing"])
      root.send(SettingsMsg.Clear())
      yield* TestHost.settle

      root.send(SettingsMsg.Show({ tab: "profile" }))
      yield* TestHost.settle
      assert.strictEqual(root.head().title, "Profile")
      assert.strictEqual(root.text(), "draft:savesaved:a")
      assert.deepStrictEqual(lifecycle(root, "/Settings/Profile[Form]"), ["Mounted", "Detached", "Attached"])
    })))

  it.effect("an event on a node of a detached child reaches the child", () =>
    provideHost(Effect.gen(function*() {
      const typeWhileDetached = Effect.gen(function*() {
        const root = yield* TestHost.mount(makeSettings(makeForm(yield* Deferred.make<void>())), {})
        const typed = root.get(Locator.text("draft:", { exact: true }))
        root.send(SettingsMsg.Show({ tab: "billing" }))
        yield* TestHost.settle
        Locator.fire(typed, "click")
        root.send(SettingsMsg.Show({ tab: "profile" }))
        yield* TestHost.settle
        return root.text()
      })
      assert.strictEqual(yield* typeWhileDetached, "draft:asavesaved:")
      assert.strictEqual(
        yield* typeWhileDetached.pipe(Effect.provide(Renderer.layer(withoutEvents()))),
        "draft:asavesaved:"
      )
    })))

  it.effect("keeps a nested detached child detached when its parent is attached, and detaches a new key", () =>
    provideHost(Effect.gen(function*() {
      const Input = Renderer.ref("Input")
      const Look = Command.make("Look", { args: {} }, () =>
        Effect.gen(function*() {
          const refs = yield* Renderer.Refs
          return Option.isSome(yield* refs.lookup(Input))
        }))
      const Leaf = Component.define({
        name: "Leaf",
        props: Schema.Struct({ label: Schema.String }),
        model: Schema.NullOr(Schema.Boolean),
        message: Schema.Boolean
      }).make({
        init: ($) => $.set(null).run(Look()),
        update: (_, found) => found,
        view: (found, h) => h.el("i", `${h.props.label}:${found}`).ref(Input)
      })
      const State = Schema.Struct({ outer: Schema.Boolean, inner: Schema.Boolean, key: Schema.String })
      const Outer = Component.define({
        name: "Outer",
        props: Schema.Struct({ inner: Schema.Boolean, key: Schema.String }),
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) =>
          h.el(
            "section",
            "outer ",
            Leaf(h, { key: h.props.key, props: { label: h.props.key }, detached: h.props.inner })
          )
      })
      const Page = Component.define({ name: "Page", model: State, message: State }).make({
        init: () => ({ outer: true, inner: true, key: "a" }),
        update: (_, next) => next,
        view: (state, h) =>
          h.el("div", Outer(h, { key: "o", props: { inner: state.inner, key: state.key }, detached: state.outer }))
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
      assert.deepStrictEqual(lifecycle(root, "/Page/Outer[o]/Leaf[a]"), ["Mounted", "Detached", "Unmounted"])
      assert.deepStrictEqual(lifecycle(root, "/Page/Outer[o]/Leaf[b]"), [
        "Mounted",
        "Detached",
        "Attached",
        "Unmounted"
      ])
    })))

  it.effect("shows a child that failed while detached as its fallback once attached", () =>
    provideHost(Effect.gen(function*() {
      const Msg = UiSchema.TaggedEnum({ Break: {} })
      const Boom = Command.make("Boom", { args: {} }, () => Effect.die("boom"))
      const Fragile = Component.define({ name: "Fragile", model: Schema.Null, message: Msg, receives: ["Break"] })
        .make({ init: () => null, update: (_, __, $) => $.run(Boom()), view: (_, h) => h.el("p", "fine") })
      const Ref = Fragile.ref("F")
      const PageMsg = UiSchema.TaggedEnum({ Detach: { detached: Schema.Boolean }, Break: {} })
      const Page = Component.define({ name: "Page", model: Schema.Boolean, message: PageMsg }).make({
        init: () => false,
        update: (_, message, $) => message._tag === "Break" ? $.send(Ref, Msg.Break()) : message.detached,
        view: (detached, h) => h.el("div", Fragile(h, { ref: Ref, detached, fallback: () => h.el("p", "down") }))
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send(PageMsg.Detach({ detached: true }))
      root.send(PageMsg.Break())
      yield* TestHost.settle
      assert.strictEqual(root.text(), "")
      assert.include(
        Cause.pretty((root.log().find((entry) => entry._tag === "Failed") as MessageLog.Failed).cause),
        "boom"
      )
      root.send(PageMsg.Detach({ detached: false }))
      yield* TestHost.settle
      assert.strictEqual(root.text(), "down")
    })))

  it.effect("keeps slot content and a headless child's view current while detached", () =>
    provideHost(Effect.gen(function*() {
      const Frame = Component.define({ name: "Frame", model: Schema.Null, message: Schema.Never, slots: ["body"] })
        .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("article", h.slots.body) })
      const Listbox = Component.define({ name: "Listbox", model: Schema.Null, message: Schema.Never }).make({
        init: () => null,
        update: (model) => model,
        parts: (_, p) => ({ id: p.id("list") })
      })
      const State = Schema.Struct({ detached: Schema.Boolean, label: Schema.String })
      const Page = Component.define({ name: "Page", model: State, message: State }).make({
        init: () => ({ detached: false, label: "one" }),
        update: (_, next) => next,
        view: (state, h) =>
          h.el(
            "div",
            Frame(h, { key: "f", detached: state.detached, slots: { body: h.el("b", "slot " + state.label) } }),
            Listbox(h, { key: "l", detached: state.detached, view: () => h.el("ul", " list " + state.label) })
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "slot one list one")
      root.send({ detached: true, label: "one" })
      yield* TestHost.settle
      assert.strictEqual(root.text(), "")
      root.send({ detached: true, label: "two" })
      yield* TestHost.settle
      root.send({ detached: false, label: "two" })
      yield* TestHost.settle
      assert.strictEqual(root.text(), "slot two list two")
    })))

  it.effect("fails the parent on a host that can't hold detached nodes", () =>
    Effect.gen(function*() {
      const Tabs = Component.define({ name: "Tabs", model: Schema.Null, message: Schema.Never }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.el("div", Billing(h, { key: "b", detached: true }))
      })
      const Page = Component.define({ name: "Page", model: Schema.Null, message: Schema.Never }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => Tabs(h, { key: "t", fallback: () => h.el("p", "down") })
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "down")
      const failed = root.log().find((entry) => entry._tag === "Failed") as MessageLog.Failed
      assert.strictEqual(failed.path, "/Page/Tabs[t]")
      assert.include(Cause.pretty(failed.cause), "this host has no createContainer")
    }).pipe(Effect.provide(Renderer.layer(withoutContainer())), provideHost))
  it.effect("restarts a reattached parent's slot mounts but not those of a child still detached", () =>
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
      const Frame = Component.define({ name: "Frame", model: Schema.Null, message: Schema.Never, slots: ["body"] })
        .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("article", h.slots.body) })
      const Reveal = Command.make("Reveal", { args: {} }, () => Effect.succeed(true))
      const Inner = Component.define({ name: "Inner", model: Schema.Boolean, message: Schema.Boolean }).make({
        init: ($) => $.set(false).run(Reveal()),
        update: (_, shown) => shown,
        view: (shown, h) => h.el("div", shown ? h.el("i").onMount(track("inner")) : null)
      })
      const State = Schema.Struct({ frame: Schema.Boolean, inner: Schema.Boolean })
      const Page = Component.define({ name: "Page", model: State, message: State }).make({
        init: () => ({ frame: true, inner: false }),
        update: (_, next) => next,
        view: (state, h) =>
          Frame(h, {
            key: "f",
            detached: state.frame,
            slots: { body: [h.el("b").onMount(track("slot")), Inner(h, { key: "i", detached: state.inner })] }
          })
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
      const Tabs = Component.define({ name: "Tabs", props: Schema.Boolean, model: Schema.Null, message: Schema.Never })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.el("div", Billing(h, { key: "b", detached: h.props }))
        })
      const State = Schema.Struct({ key: Schema.String, detached: Schema.Boolean, tracked: Schema.Boolean })
      const Page = Component.define({ name: "Page", model: State, message: State }).make({
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

  it("a Scene counts a mount in a detached child's slot as new once the child is attached", () => {
    const Track = Mount.make("Track", { args: {} }, () => Effect.never)
    const Frame = Component.define({ name: "Frame", model: Schema.Null, message: Schema.Never, slots: ["body"] })
      .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("article", h.slots.body) })
    const Page = Component.define({ name: "Page", model: Schema.Boolean, message: Schema.Boolean }).make({
      init: () => true,
      update: (detached) => !detached,
      view: (detached, h) =>
        h.el(
          "div",
          h.el("button").on("click", true).children("toggle"),
          Frame(h, { key: "f", detached, slots: { body: h.el("b").onMount(Track()) } })
        )
    })
    const s = Scene.start(Page, {})
    assert.throws(() => s.expectMount(Track()), /no rendered mount matches Track/)
    s.click(Locator.text("toggle")).expectMount(Track())
  })
})
