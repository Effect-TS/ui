import { Command, Component, Head, type MessageLog, Mount, Renderer, Route, Router, UiSchema } from "@effect/ui"
import { Locator, Scene, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Schema } from "effect"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(TestHost.layer()))
const click = (root: Pick<TestHost.TestRoot<any, any, any>, "get">, text: string) =>
  Locator.fire(root.get(Locator.text(text, { exact: true })), "click")
/** The log's instance entries for `path`. */
const lifecycle = (root: { readonly log: () => ReadonlyArray<MessageLog.Entry> }, path: string) =>
  root.log().flatMap((entry) =>
    "path" in entry && entry.path === path && entry._tag !== "Update" && !entry._tag.startsWith("Command")
      ? [entry._tag]
      : []
  )

// ---------------------------------------------------------------------------
// A settings page with two tabs, each a form kept while hidden
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
    scoped: true,
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

const Billing = Component.define({ name: "Billing", scoped: true, model: Schema.Null, message: Schema.Never }).make({
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
  return Component.define({ name: "Settings", scoped: false, model: SettingsModel, message: SettingsMsg }).make({
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
        model.tab === "profile"
          ? h.scoped((s) =>
            Profile(s, {
              ref: Form,
              // Read when written: an emit while kept goes through the last one written.
              onEmit: (event) => SettingsMsg.Saved({ text: event.text + "@" + model.tab })
            })
          )
          : h.scoped((s) => Billing(s, { key: "billing" }))
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

describe("scoped children", () => {
  it.effect("a hidden tab keeps its draft and its save, gets messages, and emits through the last onEmit", () =>
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

      // The save ends while the form is kept, and its emit reaches the author.
      yield* Deferred.succeed(saving, undefined)
      yield* TestHost.settle
      assert.deepStrictEqual(root.model()?.saved, ["a@profile"])
      root.send(SettingsMsg.Clear())
      yield* TestHost.settle

      root.send(SettingsMsg.Show({ tab: "profile" }))
      yield* TestHost.settle
      assert.strictEqual(root.head().title, "Profile")
      assert.strictEqual(root.text(), "draft:savesaved:a")
      assert.deepStrictEqual(lifecycle(root, "/Settings/Profile[Form]"), ["Mounted", "Kept", "Drawn"])
      assert.deepStrictEqual(lifecycle(root, "/Settings/Billing[billing]"), ["Mounted", "Kept"])
    })))

  it.effect("an event on a node of a kept child reaches the child", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(makeSettings(makeForm(yield* Deferred.make<void>())), {})
      const typed = root.get(Locator.text("draft:", { exact: true }))
      root.send(SettingsMsg.Show({ tab: "billing" }))
      yield* TestHost.settle
      Locator.fire(typed, "click")
      root.send(SettingsMsg.Show({ tab: "profile" }))
      yield* TestHost.settle
      assert.strictEqual(root.text(), "draft:asavesaved:")
    })))
})

// ---------------------------------------------------------------------------
// A keyed list: a row ends with its item, and a row filtered out keeps its count
// ---------------------------------------------------------------------------

const Row = Component.define({
  name: "Row",
  scoped: true,
  props: Schema.Struct({ label: Schema.String }),
  model: Schema.Number,
  message: Schema.Literal("inc")
}).make({
  init: () => 0,
  update: (count) => count + 1,
  view: (count, h) => h.el("li").on("click", "inc").children(`${h.props.label}:${count}`)
})

const ListMsg = UiSchema.TaggedEnum({
  Filter: { text: Schema.String },
  Delete: { id: Schema.String },
  Add: { id: Schema.String, label: Schema.String }
})
const ListModel = Schema.Struct({ items: Schema.Record(Schema.String, Schema.String), filter: Schema.String })

const List = Component.define({ name: "List", scoped: false, model: ListModel, message: ListMsg }).make({
  init: () => ({ items: { a: "apple", b: "banana" }, filter: "" }),
  update: (model, message) =>
    ListMsg.match(message, {
      Filter: ({ text }) => ({ ...model, filter: text }),
      Delete: ({ id }) => {
        const { [id]: _, ...items } = model.items
        return { ...model, items }
      },
      Add: ({ id, label }) => ({ ...model, items: { ...model.items, [id]: label } })
    }),
  view: (model, h) =>
    h.el(
      "ul",
      h.scoped(({ key, model }) => key in model.items, (s) =>
        Object.keys(model.items)
          .filter((id) => model.items[id]!.includes(model.filter))
          .map((id) => Row(s, { key: id, props: { label: model.items[id]! } })))
    )
})

const failureOf = (root: { readonly log: () => ReadonlyArray<MessageLog.Entry> }) =>
  root.log().find((entry) => entry._tag === "Failed") as MessageLog.Failed | undefined

/** A page that shows `Inner` with a fallback, so a failure of it shows as "down". */
const host = (Inner: Component.Component<"Inner", {}, null, never, never>) =>
  Component.define({ name: "Host", scoped: false, model: Schema.Null, message: Schema.Never }).make({
    init: () => null,
    update: (model) => model,
    view: (_, h) => h.el("main", Inner(h, { key: "i", fallback: () => h.el("p", "down") }))
  })

describe("scoped lists", () => {
  it.effect("ends a row once its item is deleted, and keeps one the view filters out", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(List, {})
      yield* TestHost.settle
      click(root, "apple:0")
      yield* TestHost.settle
      click(root, "apple:1")
      yield* TestHost.settle
      root.send(ListMsg.Filter({ text: "ban" }))
      yield* TestHost.settle
      assert.strictEqual(root.text(), "banana:0")
      root.send(ListMsg.Filter({ text: "" }))
      yield* TestHost.settle
      assert.strictEqual(root.text(), "apple:2banana:0")

      // Deleted while the view doesn't write it: its predicate ends it all the same.
      root.send(ListMsg.Filter({ text: "ban" }))
      yield* TestHost.settle
      root.send(ListMsg.Delete({ id: "a" }))
      yield* TestHost.settle
      assert.deepStrictEqual(lifecycle(root, "/List/Row[a]"), ["Mounted", "Kept", "Drawn", "Kept", "Unmounted"])
      root.send(ListMsg.Add({ id: "a", label: "apple" }))
      root.send(ListMsg.Filter({ text: "" }))
      yield* TestHost.settle
      // Added again, after banana: a new row.
      assert.strictEqual(root.text(), "banana:0apple:0")
    })))
})

describe("scope predicates", () => {
  for (
    const [name, alive] of [
      ["reads nothing from its argument", () => true],
      ["reads only the key", ($: { readonly key: string }) => $.key === "b"]
    ] as const
  ) {
    it.effect(`fails the author when it ${name}`, () =>
      provideHost(Effect.gen(function*() {
        const Inner = Component.define({ name: "Inner", scoped: false, model: Schema.Null, message: Schema.Never })
          .make({
            init: () => null,
            update: (model) => model,
            view: (_, h) => h.el("div", h.scoped(alive, (s) => Billing(s, { key: "b" })))
          })
        const root = yield* TestHost.mount(host(Inner), {})
        yield* TestHost.settle
        assert.strictEqual(root.text(), "down")
        const failed = failureOf(root)!
        assert.strictEqual(failed.path, "/Host/Inner[i]")
        assert.include(Cause.pretty(failed.cause), "({ model, key }) =>")
      })))
  }

  it.effect("fails the author when it throws", () =>
    provideHost(Effect.gen(function*() {
      const Inner = Component.define({ name: "Inner", scoped: false, model: Schema.Null, message: Schema.Never })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            h.el(
              "div",
              h.scoped(({ model }) => {
                if (model === null) throw new Error("no model")
                return true
              }, (s) => Billing(s, { key: "b" }))
            )
        })
      const root = yield* TestHost.mount(host(Inner), {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "down")
      assert.include(Cause.pretty(failureOf(root)!.cause), "no model")
    })))
})

describe("scoped paths", () => {
  it.effect("fails the author that writes one child twice in a render", () =>
    provideHost(Effect.gen(function*() {
      const Inner = Component.define({ name: "Inner", scoped: false, model: Schema.Null, message: Schema.Never })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            h.el("div", h.scoped((s) => Billing(s, { key: "b" })), h.scoped((s) => Billing(s, { key: "b" })))
        })
      const root = yield* TestHost.mount(host(Inner), {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "down")
      assert.include(Cause.pretty(failureOf(root)!.cause), "Billing[b]")
    })))

  it.effect("fails the author that writes one child in its tree and in a slot of another", () =>
    provideHost(Effect.gen(function*() {
      const Frame = Component.define({
        name: "Frame",
        scoped: false,
        model: Schema.Null,
        message: Schema.Never,
        slots: ["body"]
      })
        .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("article", h.slots.body) })
      const Inner = Component.define({ name: "Inner", scoped: false, model: Schema.Null, message: Schema.Never })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            h.scoped((s) =>
              h.el(
                "div",
                Billing(s, { key: "b" }),
                Frame(h, { key: "f", slots: { body: Billing(s, { key: "b" }) } })
              )
            )
        })
      const root = yield* TestHost.mount(host(Inner), {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "down")
      assert.include(Cause.pretty(failureOf(root)!.cause), "Billing[b]")
    })))

  it.effect("moves a child between the author's tree and a slot of another, as one instance", () =>
    provideHost(Effect.gen(function*() {
      const Frame = Component.define({
        name: "Frame",
        scoped: false,
        model: Schema.Null,
        message: Schema.Never,
        slots: ["body"]
      })
        .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("article", "frame ", h.slots.body) })
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.Boolean, message: Schema.Boolean })
        .make({
          init: () => false,
          update: (_, framed) => framed,
          view: (framed, h) =>
            h.scoped((s) => {
              const row = Row(s, { key: "r", props: { label: "row" } })
              return h.el("div", framed ? null : row, Frame(h, { key: "f", slots: { body: framed ? row : null } }))
            })
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "row:0")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "row:1frame ")
      root.send(true)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "frame row:1")
      click(root, "row:1")
      root.send(false)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "row:2frame ")
      assert.deepStrictEqual(lifecycle(root, "/Page/Row[r]"), ["Mounted"])
    })))
})

describe("scoped lifetimes", () => {
  it.effect("ends kept children with their author", () =>
    provideHost(Effect.gen(function*() {
      const Inner = Component.define({ name: "Inner", scoped: false, model: Schema.Boolean, message: Schema.Boolean })
        .make({
          init: () => true,
          update: (_, shown) => shown,
          view: (shown, h) => h.el("div", h.scoped((s) => shown ? Billing(s, { key: "b" }) : null))
        })
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.Boolean, message: Schema.Boolean })
        .make({
          init: () => true,
          update: (_, shown) => shown,
          view: (shown, h) => h.el("main", shown ? Inner(h, { key: "i" }) : null)
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send(false)
      yield* TestHost.settle
      assert.deepStrictEqual(lifecycle(root, "/Page/Inner[i]/Billing[b]"), ["Mounted", "Unmounted"])
      root.send(true)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "billing")
    })))

  it.effect("shows a child that failed while kept as its fallback once drawn", () =>
    provideHost(Effect.gen(function*() {
      const Msg = UiSchema.TaggedEnum({ Break: {} })
      const Boom = Command.make("Boom", { args: {} }, () => Effect.die("boom"))
      const Fragile = Component.define({
        name: "Fragile",
        scoped: true,
        model: Schema.Null,
        message: Msg,
        receives: ["Break"]
      })
        .make({ init: () => null, update: (_, __, $) => $.run(Boom()), view: (_, h) => h.el("p", "fine") })
      const Ref = Fragile.ref("F")
      const PageMsg = UiSchema.TaggedEnum({ Show: { shown: Schema.Boolean }, Break: {} })
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.Boolean, message: PageMsg }).make({
        init: () => true,
        update: (_, message, $) => message._tag === "Break" ? $.send(Ref, Msg.Break()) : message.shown,
        view: (shown, h) =>
          h.el("div", h.scoped((s) => shown ? Fragile(s, { ref: Ref, fallback: () => h.el("p", "down") }) : null))
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send(PageMsg.Show({ shown: false }))
      root.send(PageMsg.Break())
      yield* TestHost.settle
      assert.strictEqual(root.text(), "")
      assert.include(Cause.pretty(failureOf(root)!.cause), "boom")
      root.send(PageMsg.Show({ shown: true }))
      yield* TestHost.settle
      assert.strictEqual(root.text(), "down")
    })))

  it.effect("fails the author on a host that can't hold kept nodes", () =>
    Effect.gen(function*() {
      const Tabs = Component.define({
        name: "Tabs",
        scoped: false,
        props: Schema.Struct({ shown: Schema.Boolean }),
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.el("div", h.scoped((s) => h.props.shown ? Billing(s, { key: "b" }) : null))
      })
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.Boolean, message: Schema.Boolean })
        .make({
          init: () => true,
          update: (_, shown) => shown,
          view: (shown, h) => Tabs(h, { key: "t", props: { shown }, fallback: () => h.el("p", "down") })
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "billing")
      root.send(false)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "down")
      const failed = failureOf(root)!
      assert.strictEqual(failed.path, "/Page/Tabs[t]")
      assert.include(Cause.pretty(failed.cause), "this host has no createContainer")
    }).pipe(Effect.provide(Renderer.layer(withoutContainer())), provideHost))

  it.effect("stops a kept child's mounts and starts them again once it's drawn", () =>
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
      const Leaf = Component.define({ name: "Leaf", scoped: true, model: Schema.Null, message: Schema.Never }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.el("i").onMount(track("leaf"))
      })
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.Boolean, message: Schema.Boolean })
        .make({
          init: () => true,
          update: (_, shown) => shown,
          view: (shown, h) => h.el("div", h.scoped((s) => shown ? Leaf(s, { key: "l" }) : null))
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.deepStrictEqual(Array.from(running), ["leaf"])
      root.send(false)
      yield* TestHost.settle
      assert.deepStrictEqual(Array.from(running), [])
      root.send(true)
      yield* TestHost.settle
      assert.deepStrictEqual(Array.from(running), ["leaf"])
    }).pipe(
      Effect.provide(Renderer.layer({ ...TestHost.makeHost(), runsMounts: true })),
      provideHost
    ))

  it.effect("starts a mount under a handle the host recycled from a removed author's container", () =>
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
        scoped: false,
        props: Schema.Boolean,
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) => h.el("div", h.scoped((s) => h.props ? Billing(s, { key: "b" }) : null))
        })
      const State = Schema.Struct({ key: Schema.String, shown: Schema.Boolean, tracked: Schema.Boolean })
      const Page = Component.define({ name: "Page", scoped: false, model: State, message: State }).make({
        init: () => ({ key: "a", shown: true, tracked: false }),
        update: (_, next) => next,
        view: (state, h) =>
          h.el(
            "main",
            Tabs(h, { key: state.key, props: state.shown }),
            state.tracked ? h.el("b").onMount(Track()) : null
          )
      })
      const root = yield* Renderer.mount(Page, {}, container).pipe(Effect.provide(Renderer.layer(host)))
      yield* TestHost.settle
      assert.strictEqual(text(container), "billing")
      root.send({ key: "a", shown: false, tracked: false })
      yield* TestHost.settle
      assert.strictEqual(text(container), "")
      const oldContainer = containers.at(-1)!
      // A new key removes Tabs[a], the author that kept the child in the container: the host may use its handle again.
      root.send({ key: "c", shown: false, tracked: false })
      yield* TestHost.settle
      const shell = recycle(oldContainer, "shell")
      host.insertBefore(shell, container, undefined)
      root.send({ key: "c", shown: false, tracked: true })
      yield* TestHost.settle
      assert.strictEqual(started, 1)
    }).pipe(provideHost))

  it("a Scene counts a mount in a scoped child's slot once a scope writes it", () => {
    const Track = Mount.make("Track", { args: {} }, () => Effect.never)
    const Frame = Component.define({
      name: "Frame",
      scoped: true,
      model: Schema.Null,
      message: Schema.Never,
      slots: ["body"]
    })
      .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("article", h.slots.body) })
    const Page = Component.define({ name: "Page", scoped: false, model: Schema.Boolean, message: Schema.Boolean }).make(
      {
        init: () => false,
        update: (shown) => !shown,
        view: (shown, h) =>
          h.el(
            "div",
            h.el("button").on("click", true).children("toggle"),
            h.scoped((s) => shown ? Frame(s, { key: "f", slots: { body: h.el("b").onMount(Track()) } }) : null)
          )
      }
    )
    const s = Scene.start(Page, {})
    assert.throws(() => s.expectMount(Track()), /no rendered mount matches Track/)
    s.click(Locator.text("toggle")).expectMount(Track())
  })

  it.effect("mounts a scoped component as the root, as any other", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(Row, { label: "root" })
      yield* TestHost.settle
      click(root, "root:0")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "root:1")
    })))
})

const withoutContainer = () => {
  const { createContainer: _, ...host } = TestHost.makeHost()
  return host
}

// ---------------------------------------------------------------------------
// Saved state: a kept child's waits until it's written again
// ---------------------------------------------------------------------------

const Draft = Component.define({ name: "Draft", scoped: true, model: Schema.String, message: Schema.Literal("type") })
  .make({
    init: () => "",
    update: (draft) => draft + "a",
    view: (draft, h) => h.el("button").on("click", "type").children("draft:" + draft)
  })

const TabsRoute = Route.union({ Home: Route.make("/"), Tabs: Route.make("/tabs") })

const TabsPage = Component.define({ name: "TabsPage", scoped: false, model: Schema.String, message: Schema.String })
  .make({
    init: () => "profile",
    update: (_, tab) => tab,
    view: (tab, h) =>
      h.el(
        "section",
        h.el("button").on("click", tab === "profile" ? "billing" : "profile").children("switch"),
        tab === "profile" ? h.scoped((s) => Draft(s, { key: "d" })) : h.scoped((s) => Billing(s, { key: "b" }))
      )
  })

const TabsMsg = UiSchema.TaggedEnum({ Changed: { route: TabsRoute }, Go: { route: TabsRoute }, Done: {} })
const TabsApp = Component.define({
  name: "TabsApp",
  scoped: false,
  props: Schema.Struct({ route: TabsRoute }),
  model: TabsRoute,
  message: TabsMsg
}).make({
  init: ($) => $.props.route,
  update: (route, message, $) =>
    TabsMsg.match(message, {
      Changed: (changed) => changed.route,
      Go: (go) => $.run(Router.push(TabsRoute, go.route).pipe(Command.map(() => TabsMsg.Done()))),
      Done: () => route
    }),
  subscriptions: (route) => [Router.subscription(TabsRoute, route, (changed) => TabsMsg.Changed({ route: changed }))],
  view: (route, h) =>
    h.el(
      "div",
      h.el("button").on("click", TabsMsg.Go({ route: TabsRoute.make({ _tag: "Home" }) })).children("Home"),
      route._tag === "Tabs" ? TabsPage(h, { key: "/tabs" }) : h.el("p", "home")
    )
})

describe("saved state of scoped children", () => {
  it.effect("a router restore keeps the state of a kept child until it's written again", () => {
    const history = Router.memoryHistory("/tabs")
    return Effect.gen(function*() {
      const root = yield* TestHost.mount(TabsApp, Router.props(TabsRoute))
      yield* TestHost.settle
      click(root, "draft:")
      yield* TestHost.settle
      click(root, "switch")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "Homeswitchbilling")
      click(root, "Home")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "Homehome")
      history.go(-1)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "Homeswitchbilling")
      click(root, "switch")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "Homeswitchdraft:a")
    }).pipe(
      Effect.provide(Router.make({ routes: TabsRoute, history })),
      Effect.provide(TestHost.layer())
    )
  })
})

// ---------------------------------------------------------------------------
// The EFF-4038 probes: a scoped child keeps its draft wherever it's drawn
// ---------------------------------------------------------------------------

const Card = Component.define({
  name: "Card",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  slots: ["body"]
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.el("section", h.slots.body)
})

const Collapsible = Component.define({
  name: "Collapsible",
  scoped: false,
  model: Schema.Boolean,
  message: Schema.Literal("toggle"),
  slots: ["body"]
}).make({
  init: () => true,
  update: (open) => !open,
  view: (open, h) =>
    h.el("section", h.el("button").on("click", "toggle").children("toggle"), open ? h.slots.body : null)
})

describe("EFF-4038 probes, scoped", () => {
  it.effect("P1: wrapping a child in a slot component keeps it", () =>
    provideHost(Effect.gen(function*() {
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.Boolean, message: Schema.Boolean })
        .make({
          init: () => false,
          update: (_, wide) => wide,
          view: (wide, h) =>
            h.scoped((s) =>
              h.el(
                "main",
                wide ? Card(h, { key: "card", slots: { body: Draft(s, { key: "f" }) } }) : Draft(s, { key: "f" })
              )
            )
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "draft:")
      yield* TestHost.settle
      root.send(true)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "draft:a")
      root.send(false)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "draft:a")
      assert.deepStrictEqual(lifecycle(root, "/Page/Draft[f]"), ["Mounted"])
    })))

  it.effect("P2: moving a child between two elements of one view keeps it", () =>
    provideHost(Effect.gen(function*() {
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.Boolean, message: Schema.Boolean })
        .make({
          init: () => false,
          update: (_, moved) => moved,
          view: (moved, h) =>
            h.scoped((s) =>
              h.el(
                "main",
                h.el("aside", moved ? null : Draft(s, { key: "f" })),
                h.el("article", moved ? Draft(s, { key: "f" }) : null)
              )
            )
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "draft:")
      yield* TestHost.settle
      root.send(true)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "draft:a")
      click(root, "draft:a")
      root.send(false)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "draft:aa")
      assert.deepStrictEqual(lifecycle(root, "/Page/Draft[f]"), ["Mounted"])
    })))

  it.effect("P8: a receiver that stops placing a slot keeps the child in it", () =>
    provideHost(Effect.gen(function*() {
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.Null, message: Schema.Never }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.scoped((s) => Collapsible(h, { key: "c", slots: { body: Draft(s, { key: "f" }) } }))
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "draft:")
      yield* TestHost.settle
      click(root, "toggle")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "toggle")
      click(root, "toggle")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "toggledraft:a")
      assert.deepStrictEqual(lifecycle(root, "/Page/Draft[f]"), ["Mounted", "Kept", "Drawn"])
    })))
})

describe("scoped children of a headless child", () => {
  it.effect("a headless child's closure writes them with its author's scope, and a kept one leaves collects", () =>
    provideHost(Effect.gen(function*() {
      const GroupMsg = UiSchema.TaggedEnum({ ChangedOpen: { open: Schema.Boolean } })
      const PanelGroup = Component.define({
        name: "PanelGroup",
        scoped: false,
        model: Schema.Struct({ anyOpen: Schema.Boolean }),
        message: GroupMsg,
        shares: {
          value: (model) => ({ anyOpen: model.anyOpen }),
          collects: {
            schema: Schema.Boolean,
            onChange: (collected) => GroupMsg.ChangedOpen({ open: collected.includes(true) })
          }
        }
      }).make({
        init: () => ({ anyOpen: false }),
        update: (_, { open }) => ({ anyOpen: open }),
        parts: (model) => ({ anyOpen: model.anyOpen })
      })
      const Panel = Component.define({
        name: "Panel",
        scoped: true,
        props: Schema.Struct({ title: Schema.String }),
        model: Schema.Boolean,
        message: Schema.Literal("toggle"),
        shared: { group: { owner: PanelGroup, optional: true, report: (open) => open } }
      }).make({
        init: () => false,
        update: (open) => !open,
        view: (open, h) => h.el("button").on("click", "toggle").children(h.props.title + (open ? "+" : "-"))
      })
      const App = Component.define({ name: "App", scoped: false, model: Schema.Boolean, message: Schema.Boolean })
        .make({
          init: () => true,
          update: (_, shown) => shown,
          view: (shown, h) =>
            h.scoped((s) =>
              PanelGroup(h, {
                key: "g",
                view: (parts) =>
                  h.el(
                    "div",
                    h.el("p", parts.anyOpen ? "[any open]" : "[none open]"),
                    Panel(s, { key: "a", props: { title: "A" } }),
                    shown ? Panel(s, { key: "b", props: { title: "B" } }) : null
                  )
              })
            )
        })
      const root = yield* TestHost.mount(App, {})
      yield* TestHost.settle
      click(root, "B-")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "[any open]A-B+")
      root.send(false)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "[none open]A-")
      root.send(true)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "[any open]A-B+")
      assert.deepStrictEqual(lifecycle(root, "/App/Panel[b]"), ["Mounted", "Kept", "Drawn"])
    })))
})
