import {
  Command,
  Component,
  Head,
  type MessageLog,
  Mount,
  Renderer,
  Route,
  Router,
  UiSchema,
  type View
} from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Locator, Scene, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Redacted, Schema } from "effect"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(TestHost.layer()))
const click = (root: Pick<TestHost.TestRoot<any, any, any>, "get">, text: string) =>
  Locator.fire(root.get(Locator.text(text, { exact: true })), "click")
const lifecycle = (root: { readonly log: () => ReadonlyArray<MessageLog.Entry> }, path: string) =>
  root.log().flatMap((entry) =>
    "path" in entry && entry.path === path && entry._tag !== "Update" && !entry._tag.startsWith("Command")
      ? [entry._tag]
      : []
  )

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
              onEmit: (event) => SettingsMsg.Saved({ text: event.text + "@" + model.tab })
            })
          )
          : h.scoped((s) => Billing(s, { key: "billing" }))
      )
  })
}

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

      root.send(ListMsg.Filter({ text: "ban" }))
      yield* TestHost.settle
      root.send(ListMsg.Delete({ id: "a" }))
      yield* TestHost.settle
      assert.deepStrictEqual(lifecycle(root, "/List/Row[a]"), ["Mounted", "Kept", "Drawn", "Kept", "Unmounted"])
      root.send(ListMsg.Add({ id: "a", label: "apple" }))
      root.send(ListMsg.Filter({ text: "" }))
      yield* TestHost.settle
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

  it.effect("fails the author that writes one child in its tree and in a slot of another, under a false predicate", () =>
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
            h.scoped(({ model }) => model !== null, (s) =>
              h.el(
                "div",
                Billing(s, { key: "b" }),
                Frame(h, { key: "f", slots: { body: Billing(s, { key: "b" }) } })
              ))
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
      root.send({ key: "c", shown: false, tracked: false })
      yield* TestHost.settle
      const shell = recycle(oldContainer, "shell")
      host.insertBefore(shell, container, undefined)
      root.send({ key: "c", shown: false, tracked: true })
      yield* TestHost.settle
      assert.strictEqual(started, 1)
    }).pipe(provideHost))

  it("a Scene counts a mount in a scoped child's slot once its scope's predicate holds", () => {
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
        view: (_, h) =>
          h.el(
            "div",
            h.el("button").on("click", true).children("toggle"),
            h.scoped(({ model }) => model, (s) => Frame(s, { key: "f", slots: { body: h.el("b").onMount(Track()) } }))
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

const CounterMsg = UiSchema.TaggedEnum({ Inc: {} })
const Counter = Component.define({
  name: "Counter",
  scoped: true,
  model: Schema.Number,
  message: CounterMsg,
  receives: ["Inc"]
}).make({
  init: () => 0,
  update: (count) => count + 1,
  view: (count, h) => h.el("button").on("click", CounterMsg.Inc()).children("count:" + count)
})
const CounterRef = Counter.ref("C")

const Box = Component.define({ name: "Box", scoped: true, model: Schema.Null, message: Schema.Never, slots: ["body"] })
  .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("section", h.slots.body) })

const Shut = Component.define({
  name: "Shut",
  scoped: false,
  model: Schema.Boolean,
  message: Schema.Literal("toggle"),
  slots: ["body"]
}).make({
  init: () => false,
  update: (open) => !open,
  view: (open, h) =>
    h.el("section", h.el("button").on("click", "toggle").children("toggle"), open ? h.slots.body : null)
})

describe("scoped children drawn by other children", () => {
  it.effect("keeps a child drawn in a receiver whose own scope ends", () =>
    provideHost(Effect.gen(function*() {
      const Shown = Schema.Struct({ box: Schema.Boolean, direct: Schema.Boolean })
      const Page = Component.define({ name: "Page", scoped: false, model: Shown, message: Shown }).make({
        init: () => ({ box: true, direct: false }),
        update: (_, shown) => shown,
        view: (shown, h) =>
          h.el(
            "main",
            h.scoped(({ model }) => model.box, (s) =>
              shown.box
                ? Box(s, { key: "x", slots: { body: shown.direct ? null : h.scoped((t) => Counter(t, { key: "c" })) } })
                : null),
            shown.direct ? h.scoped((t) => Counter(t, { key: "c" })) : null
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "count:0")
      yield* TestHost.settle
      root.send({ box: false, direct: false })
      yield* TestHost.settle
      assert.strictEqual(root.text(), "")
      root.send({ box: false, direct: true })
      yield* TestHost.settle
      assert.strictEqual(root.text(), "count:1")
    })))

  it.effect("starts a child written into a slot nobody places, and sends reach it", () =>
    provideHost(Effect.gen(function*() {
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.Null, message: Schema.Literal("inc") })
        .make({
          init: () => null,
          update: (_, __, $) => $.send(CounterRef, CounterMsg.Inc()),
          view: (_, h) => h.scoped((s) => Shut(h, { key: "c", slots: { body: Counter(s, { ref: CounterRef }) } }))
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send("inc")
      yield* TestHost.settle
      click(root, "toggle")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "togglecount:1")
    })))

  it.effect("keeps the draft of a child in a closed slot when a new predicate holds for it", () =>
    provideHost(Effect.gen(function*() {
      const Mode = Schema.Literals(["a", "b"])
      const Page = Component.define({ name: "Page", scoped: false, model: Mode, message: Mode }).make({
        init: () => "a" as const,
        update: (_, mode) => mode,
        view: (mode, h) =>
          h.scoped(
            mode === "a" ? ({ model }) => model === "a" : ({ model }) => model === "b",
            (s) => Shut(h, { key: "c", slots: { body: Counter(s, { key: "k" }) } })
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "toggle")
      yield* TestHost.settle
      click(root, "count:0")
      yield* TestHost.settle
      click(root, "toggle")
      yield* TestHost.settle
      root.send("b")
      yield* TestHost.settle
      click(root, "toggle")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "togglecount:1")
    })))

  it.effect("a send reaches a child drawn in a kept receiver, and its mounts follow it out", () =>
    Effect.gen(function*() {
      const running = new Set<string>()
      const Tracked = Component.define({ name: "Tracked", scoped: true, model: Schema.Null, message: Schema.Never })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            h.el("i").onMount(
              Mount.make("track", { args: {} }, () =>
                Effect.acquireRelease(
                  Effect.sync(() => running.add("t")),
                  () => Effect.sync(() => running.delete("t"))
                )
                  .pipe(Effect.andThen(Effect.never)))()
            )
        })
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.String, message: Schema.String })
        .make({
          init: () => "box",
          update: (_, message, $) => message === "inc" ? $.send(CounterRef, CounterMsg.Inc()) : message,
          view: (where, h) =>
            h.scoped((s) =>
              h.el(
                "main",
                where === "box"
                  ? Box(s, { key: "b", slots: { body: [Counter(s, { ref: CounterRef }), Tracked(s, { key: "t" })] } })
                  : null,
                where === "page" ? [Tracked(s, { key: "t" }), Counter(s, { ref: CounterRef })] : null
              )
            )
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send("none")
      yield* TestHost.settle
      root.send("inc")
      yield* TestHost.settle
      assert.deepStrictEqual(Array.from(running), [])
      root.send("page")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "count:1")
      assert.deepStrictEqual(Array.from(running), ["t"])
    }).pipe(
      Effect.provide(Renderer.layer({ ...TestHost.makeHost(), runsMounts: true })),
      provideHost
    ))

  it.effect("shows the fallback of a drawn child that fails in its place", () =>
    provideHost(Effect.gen(function*() {
      const Boom = Command.make("Boom", { args: {} }, () => Effect.die("boom"))
      const FragileMsg = UiSchema.TaggedEnum({ Break: {} })
      const Fragile = Component.define({
        name: "Fragile",
        scoped: true,
        model: Schema.Null,
        message: FragileMsg,
        receives: ["Break"]
      }).make({ init: () => null, update: (_, __, $) => $.run(Boom()), view: (_, h) => h.el("p", "fine") })
      const Ref = Fragile.ref("F")
      const Page = Component.define({
        name: "Page",
        scoped: false,
        model: Schema.Null,
        message: Schema.Literal("break")
      })
        .make({
          init: () => null,
          update: (_, __, $) => $.send(Ref, FragileMsg.Break()),
          view: (_, h) =>
            h.el(
              "div",
              "before",
              h.scoped((s) => Fragile(s, { ref: Ref, fallback: () => h.el("p", "failed") })),
              "after"
            )
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send("break")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "beforefailedafter")
    })))
})

describe("scoped children that read shared state", () => {
  it.effect("read the owner above where they're drawn", () =>
    provideHost(Effect.gen(function*() {
      const Side = Component.define({
        name: "Side",
        scoped: false,
        props: Schema.Struct({ name: Schema.String }),
        model: Schema.String,
        message: Schema.Never,
        shares: { value: (name) => ({ name }) }
      }).make({ init: ($) => $.props.name, update: (model) => model, parts: () => ({}) })
      const Reader = Component.define({
        name: "Reader",
        scoped: false,
        model: Schema.Null,
        message: Schema.Never,
        shared: { side: { owner: Side, optional: true } }
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.el("p", h.shared.side?.name ?? "none")
      })
      const Frame = Component.define({ name: "Frame", scoped: true, model: Schema.Null, message: Schema.Never }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.el("section", Reader(h, { key: "r" }))
      })
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.String, message: Schema.String })
        .make({
          init: () => "left",
          update: (_, where) => where,
          view: (where, h) =>
            h.scoped((s) =>
              h.el(
                "main",
                Side(h, {
                  key: "l",
                  props: { name: "left" },
                  view: () => h.el("div", where === "left" ? Frame(s, { key: "f" }) : null)
                }),
                Side(h, {
                  key: "r",
                  props: { name: "right" },
                  view: () => h.el("div", where === "right" ? Frame(s, { key: "f" }) : null)
                }),
                where === "none" ? Frame(s, { key: "f" }) : null
              )
            )
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "left")
      root.send("right")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "right")
      root.send("none")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "none")
      root.send("left")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "left")
    })))
})

const Nested = Component.define({
  name: "Nested",
  scoped: false,
  model: Schema.String,
  message: Schema.Literal("type")
})
  .make({
    init: () => "",
    update: (draft) => draft + "a",
    view: (draft, h) => h.el("button").on("click", "type").children("nested:" + draft)
  })
const Holder = Component.define({
  name: "Holder",
  scoped: true,
  props: Schema.Struct({ bare: Schema.Boolean }),
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.el("div", h.props.bare ? null : Nested(h, { key: "n" }))
})

const FormPage = Component.define({
  name: "FormPage",
  scoped: false,
  props: Schema.Struct({ hidden: Schema.Boolean, ended: Schema.Boolean, bare: Schema.Boolean }),
  model: Schema.Redacted(Schema.String),
  message: Schema.Never
}).make({
  init: () => Redacted.make(""),
  update: (model) => model,
  view: (_, h) =>
    h.el(
      "section",
      h.scoped(
        ({ props }) => !props.ended,
        (s) => h.props.hidden ? null : [Draft(s, { key: "d" }), Holder(s, { key: "h", props: { bare: h.props.bare } })]
      )
    )
})

const ShellMsg = UiSchema.TaggedEnum({
  Changed: { route: TabsRoute },
  Go: { route: TabsRoute },
  Done: {},
  Hide: { hidden: Schema.Boolean },
  End: { ended: Schema.Boolean },
  Bare: { bare: Schema.Boolean },
  Omit: { omitted: Schema.Boolean }
})
const Aside = Component.define({ name: "Aside", scoped: false, model: Schema.Boolean, message: Schema.Boolean }).make({
  init: () => false,
  update: (_, hidden) => hidden,
  view: (hidden, h) => h.el("aside", h.scoped((s) => hidden ? null : Draft(s, { key: "d" })))
})

const Shell = Component.define({
  name: "Shell",
  scoped: false,
  props: Schema.Struct({ route: TabsRoute }),
  model: Schema.Struct({
    route: TabsRoute,
    hidden: Schema.Boolean,
    ended: Schema.Boolean,
    bare: Schema.Boolean,
    omitted: Schema.Boolean
  }),
  message: ShellMsg
}).make({
  init: ($) => ({ route: $.props.route, hidden: false, ended: false, bare: false, omitted: false }),
  update: (model, message, $) =>
    ShellMsg.match(message, {
      Changed: ({ route }) => ({ ...model, route }),
      Go: ({ route }) => $.run(Router.push(TabsRoute, route).pipe(Command.map(() => ShellMsg.Done()))),
      Done: () => model,
      Hide: ({ hidden }) => ({ ...model, hidden }),
      End: ({ ended }) => ({ ...model, ended }),
      Bare: ({ bare }) => ({ ...model, bare }),
      Omit: ({ omitted }) => ({ ...model, omitted })
    }),
  subscriptions: (model) => [
    Router.subscription(TabsRoute, model.route, (route) => ShellMsg.Changed({ route }))
  ],
  view: (model, h) =>
    h.el(
      "div",
      h.el("button").on("click", ShellMsg.Go({ route: TabsRoute.make({ _tag: "Home" }) })).children("Home"),
      model.route._tag !== "Tabs"
        ? h.el("p", "home")
        : model.omitted
        ? model.hidden ? Aside(h, { key: "a" }) : null
        : FormPage(h, { key: "/tabs", props: { hidden: model.hidden, ended: model.ended, bare: model.bare } })
    )
})

type History = ReturnType<typeof Router.memoryHistory>

describe("scoped children across a router restore", () => {
  const routed = <A, E, R>(effect: (history: History) => Effect.Effect<A, E, R>) => {
    const history = Router.memoryHistory("/tabs")
    return effect(history).pipe(
      Effect.provide(Router.make({ routes: TabsRoute, history })),
      Effect.provide(TestHost.layer())
    )
  }
  const hide = Effect.fnUntraced(function*(root: TestHost.TestRoot<any, any, any>, hidden: boolean) {
    root.send(ShellMsg.Hide({ hidden }))
    yield* TestHost.settle
  })
  const away = Effect.fnUntraced(function*(root: TestHost.TestRoot<any, any, any>, history: History) {
    click(root, "Home")
    yield* TestHost.settle
    history.go(-1)
    yield* TestHost.settle
  })

  it.effect("keeps a draft and its subtree that were drawn when saved and are hidden when restored", () =>
    routed((history) =>
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Shell, Router.props(TabsRoute))
        yield* TestHost.settle
        click(root, "draft:")
        click(root, "nested:")
        yield* TestHost.settle
        click(root, "Home")
        yield* TestHost.settle
        yield* hide(root, true)
        history.go(-1)
        yield* TestHost.settle
        yield* hide(root, false)
        assert.strictEqual(root.text(), "Homedraft:anested:a")
      })
    ))

  it.effect("keeps a kept draft that a restore didn't claim, for the next one after a reload", () => {
    const history = Router.memoryHistory("/tabs")
    const session = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(Effect.provide(Router.make({ routes: TabsRoute, history })), Effect.provide(TestHost.layer()))
    return Effect.andThen(
      session(Effect.gen(function*() {
        const root = yield* TestHost.mount(Shell, Router.props(TabsRoute))
        yield* TestHost.settle
        click(root, "draft:")
        yield* TestHost.settle
        yield* hide(root, true)
        yield* away(root, history)
        click(root, "Home")
        yield* TestHost.settle
      })),
      session(Effect.gen(function*() {
        const root = yield* TestHost.mount(Shell, Router.props(TabsRoute))
        yield* TestHost.settle
        history.go(-1)
        yield* TestHost.settle
        assert.strictEqual(root.text(), "Homedraft:anested:")
      }))
    )
  })

  it.effect("starts fresh a draft whose saved state a false predicate ended", () =>
    routed((history) =>
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Shell, Router.props(TabsRoute))
        yield* TestHost.settle
        click(root, "draft:")
        yield* TestHost.settle
        click(root, "Home")
        yield* TestHost.settle
        root.send(ShellMsg.End({ ended: true }))
        yield* TestHost.settle
        history.go(-1)
        yield* TestHost.settle
        root.send(ShellMsg.End({ ended: false }))
        yield* TestHost.settle
        assert.strictEqual(root.text(), "Homedraft:nested:")
      })
    ))

  it.effect("starts a fresh push blank after a restore that didn't claim the draft, and Back still restores it", () =>
    routed((history) =>
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Shell, Router.props(TabsRoute))
        yield* TestHost.settle
        click(root, "draft:")
        yield* TestHost.settle
        click(root, "Home")
        yield* TestHost.settle
        yield* hide(root, true)
        history.go(-1)
        yield* TestHost.settle
        click(root, "Home")
        yield* TestHost.settle
        yield* hide(root, false)
        root.send(ShellMsg.Go({ route: TabsRoute.make({ _tag: "Tabs" }) }))
        yield* TestHost.settle
        assert.strictEqual(root.text(), "Homedraft:nested:")
        history.go(-1)
        yield* TestHost.settle
        history.go(-1)
        yield* TestHost.settle
        assert.strictEqual(root.text(), "Homedraft:anested:")
      })
    ))

  it.effect("starts blank the subtree of a restored child that ended before drawing it", () =>
    routed((history) =>
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Shell, Router.props(TabsRoute))
        yield* TestHost.settle
        click(root, "nested:")
        yield* TestHost.settle
        click(root, "Home")
        yield* TestHost.settle
        root.send(ShellMsg.Bare({ bare: true }))
        yield* TestHost.settle
        history.go(-1)
        yield* TestHost.settle
        root.send(ShellMsg.Hide({ hidden: true }))
        root.send(ShellMsg.End({ ended: true }))
        yield* TestHost.settle
        root.send(ShellMsg.End({ ended: false }))
        yield* hide(root, false)
        root.send(ShellMsg.Bare({ bare: false }))
        yield* TestHost.settle
        assert.strictEqual(root.text(), "Homedraft:nested:")
      })
    ))

  it.effect("keeps a draft whose page a Back left out, for when the page is shown", () =>
    routed((history) =>
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Shell, Router.props(TabsRoute))
        yield* TestHost.settle
        click(root, "draft:")
        yield* TestHost.settle
        click(root, "Home")
        yield* TestHost.settle
        root.send(ShellMsg.Omit({ omitted: true }))
        history.go(-1)
        yield* TestHost.settle
        root.send(ShellMsg.Omit({ omitted: false }))
        yield* TestHost.settle
        assert.strictEqual(root.text(), "Homedraft:anested:")
      })
    ))

  it.effect("starts a fresh push blank after a Back that left the page out, and Back still restores it", () =>
    routed((history) =>
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Shell, Router.props(TabsRoute))
        yield* TestHost.settle
        click(root, "draft:")
        yield* TestHost.settle
        click(root, "Home")
        yield* TestHost.settle
        root.send(ShellMsg.Omit({ omitted: true }))
        yield* hide(root, true)
        history.go(-1)
        yield* TestHost.settle
        click(root, "Home")
        yield* TestHost.settle
        root.send(ShellMsg.Omit({ omitted: false }))
        yield* hide(root, false)
        root.send(ShellMsg.Go({ route: TabsRoute.make({ _tag: "Tabs" }) }))
        yield* TestHost.settle
        assert.strictEqual(root.text(), "Homedraft:nested:")
        history.go(-1)
        yield* TestHost.settle
        history.go(-1)
        yield* TestHost.settle
        assert.strictEqual(root.text(), "Homedraft:anested:")
      })
    ))

  it.effect("keeps the kept drafts of each root on one router", () =>
    routed((history) =>
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Shell, Router.props(TabsRoute))
        const aside = yield* TestHost.mount(Aside, {})
        yield* TestHost.settle
        click(root, "draft:")
        yield* TestHost.settle
        yield* hide(root, true)
        aside.send(true)
        yield* TestHost.settle
        yield* away(root, history)
        yield* hide(root, false)
        assert.strictEqual(root.text(), "Homedraft:anested:")
      })
    ))

  it.effect("keeps a draft a Back restores when the page it leaves has one at the same path", () =>
    routed((history) =>
      Effect.gen(function*() {
        const Twin = Component.define({
          name: "Twin",
          scoped: false,
          props: Schema.Struct({ route: TabsRoute }),
          model: Schema.Struct({ route: TabsRoute, hidden: Schema.Boolean }),
          message: ShellMsg
        }).make({
          init: ($) => ({ route: $.props.route, hidden: false }),
          update: (model, message, $) =>
            ShellMsg.match(message, {
              Changed: ({ route }) => ({ ...model, route }),
              Go: ({ route }) => $.run(Router.push(TabsRoute, route).pipe(Command.map(() => ShellMsg.Done()))),
              Hide: ({ hidden }) => ({ ...model, hidden }),
              Done: () => model,
              End: () => model,
              Bare: () => model,
              Omit: () => model
            }),
          subscriptions: (model) => [
            Router.subscription(TabsRoute, model.route, (route) => ShellMsg.Changed({ route }))
          ],
          view: (model, h) => {
            const page = (hidden: boolean) => FormPage(h, { key: "/tabs", props: { hidden, ended: false, bare: true } })
            return h.el(
              "div",
              h.el("button").on("click", ShellMsg.Go({ route: TabsRoute.make({ _tag: "Home" }) })).children("Home"),
              model.route._tag === "Tabs" ? page(model.hidden) : h.el("aside", page(false))
            )
          }
        })
        const root = yield* TestHost.mount(Twin, Router.props(TabsRoute))
        yield* TestHost.settle
        click(root, "draft:")
        yield* TestHost.settle
        click(root, "Home")
        yield* TestHost.settle
        assert.strictEqual(root.text(), "Homedraft:")
        yield* hide(root, true)
        history.go(-1)
        yield* TestHost.settle
        yield* hide(root, false)
        assert.strictEqual(root.text(), "Homedraft:a")
      })
    ))
})

const RowMsg = UiSchema.TaggedEnum({ Ping: {} })
const RowEvents = UiSchema.TaggedEnum({ Pinged: { label: Schema.String } })
const Pinger = Component.define({
  name: "Pinger",
  scoped: true,
  props: Schema.Struct({ label: Schema.String }),
  model: Schema.Null,
  message: RowMsg,
  events: RowEvents,
  receives: ["Ping"]
}).make({
  init: () => null,
  update: (model, _, $) => $.set(model).emit(RowEvents.Pinged({ label: $.props.label })),
  view: (_, h) => h.el("b", h.props.label)
})
const PingerRef = Pinger.ref("R")

describe("scoped children written into closed slots", () => {
  it.effect("run no mounts and report nothing while the slot is closed", () =>
    Effect.gen(function*() {
      const running = new Set<string>()
      const GroupMsg = UiSchema.TaggedEnum({ Counted: { count: Schema.Number } })
      const Group = Component.define({
        name: "Group",
        scoped: false,
        model: Schema.Number,
        message: GroupMsg,
        shares: {
          value: (count) => ({ count }),
          collects: { schema: Schema.Boolean, onChange: (reports) => GroupMsg.Counted({ count: reports.length }) }
        }
      }).make({ init: () => 0, update: (_, { count }) => count, parts: (count) => ({ count }) })
      const Member = Component.define({
        name: "Member",
        scoped: true,
        model: Schema.Null,
        message: Schema.Never,
        shared: { group: { owner: Group, optional: true, report: () => true } }
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) =>
          h.el("i").onMount(
            Mount.make("track", { args: {} }, () =>
              Effect.acquireRelease(Effect.sync(() => running.add("m")), () =>
                Effect.sync(() => running.delete("m")))
                .pipe(Effect.andThen(Effect.never)))()
          )
      })
      const App = Component.define({ name: "App", scoped: false, model: Schema.Null, message: Schema.Never }).make({
        init: () =>
          null,
        update: (model) => model,
        view: (_, h) =>
          h.scoped((s) =>
            Group(h, {
              key: "g",
              view: (parts) =>
                h.el(
                  "div",
                  h.el("p", "n" + parts.count),
                  Shut(h, { key: "c", slots: { body: Member(s, { key: "m" }) } })
                )
            })
          )
      })
      const root = yield* TestHost.mount(App, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "n0toggle")
      assert.deepStrictEqual(Array.from(running), [])
      click(root, "toggle")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "n1toggle")
      assert.deepStrictEqual(Array.from(running), ["m"])
    }).pipe(
      Effect.provide(Renderer.layer({ ...TestHost.makeHost(), runsMounts: true })),
      provideHost
    ))

  it.effect("take the props and onEmit of the latest write", () =>
    provideHost(Effect.gen(function*() {
      const PageMsg = UiSchema.TaggedEnum({ Label: { label: Schema.String }, Ping: {}, Got: { text: Schema.String } })
      const Page = Component.define({
        name: "Page",
        scoped: false,
        model: Schema.Struct({ label: Schema.String, got: Schema.String }),
        message: PageMsg
      }).make({
        init: () => ({ label: "A", got: "" }),
        update: (model, message, $) =>
          PageMsg.match(message, {
            Label: ({ label }) => ({ ...model, label }),
            Ping: () => $.send(PingerRef, RowMsg.Ping()),
            Got: ({ text }) => ({ ...model, got: text })
          }),
        view: (model, h) =>
          h.el(
            "div",
            h.el("p", model.got),
            h.scoped((s) =>
              Shut(h, {
                key: "c",
                slots: {
                  body: Pinger(s, {
                    ref: PingerRef,
                    props: { label: model.label },
                    onEmit: (event) => PageMsg.Got({ text: event.label + "@" + model.label })
                  })
                }
              })
            )
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send(PageMsg.Label({ label: "B" }))
      yield* TestHost.settle
      root.send(PageMsg.Ping())
      yield* TestHost.settle
      assert.strictEqual(root.text(), "B@Btoggle")
    })))

  it.effect("keep a draft moved from a kept receiver into a closed slot under a new predicate", () =>
    provideHost(Effect.gen(function*() {
      const Mode = Schema.Literals(["box", "shut"])
      const Page = Component.define({ name: "Page", scoped: false, model: Mode, message: Mode }).make({
        init: () => "box" as const,
        update: (_, mode) => mode,
        view: (mode, h) =>
          h.el(
            "main",
            h.scoped((s) =>
              mode === "box"
                ? Box(s, {
                  key: "b",
                  slots: { body: h.scoped(({ model }) => model === "box", (t) => Counter(t, { key: "c" })) }
                })
                : null
            ),
            mode === "shut"
              ? h.scoped(
                ({ model }) => model === "shut",
                (s) => Shut(h, { key: "s", slots: { body: Counter(s, { key: "c" }) } })
              )
              : null
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "count:0")
      yield* TestHost.settle
      root.send("shut")
      yield* TestHost.settle
      click(root, "toggle")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "togglecount:1")
    })))

  it.effect("a receiver that redraws an old write leaves the child where the author wrote it last", () =>
    provideHost(Effect.gen(function*() {
      const ToggleMsg = UiSchema.TaggedEnum({ Toggle: {} })
      const Toggling = Component.define({
        name: "Toggling",
        scoped: true,
        model: Schema.Boolean,
        message: ToggleMsg,
        receives: ["Toggle"],
        slots: ["body"]
      }).make({
        init: () => true,
        update: (open) => !open,
        view: (open, h) => h.el("section", open ? h.slots.body : null)
      })
      const BoxRef = Toggling.ref("B")
      const Page = Component.define({
        name: "Page",
        scoped: false,
        model: Schema.Boolean,
        message: Schema.Literals(["move", "toggle"])
      }).make({
        init: () => false,
        update: (_, message, $) => message === "move" ? true : $.send(BoxRef, ToggleMsg.Toggle()),
        view: (moved, h) =>
          h.scoped((s) =>
            h.el(
              "main",
              moved ? null : Toggling(s, { ref: BoxRef, slots: { body: Counter(s, { key: "c" }) } }),
              moved ? Counter(s, { key: "c" }) : null
            )
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "count:0")
      yield* TestHost.settle
      root.send("move")
      yield* TestHost.settle
      root.send("toggle")
      yield* TestHost.settle
      root.send("toggle")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "count:1")
    })))

  it.effect("keeps a child whose headless writer is replaced by another that writes it", () =>
    provideHost(Effect.gen(function*() {
      const Row = Component.define({
        name: "Row",
        scoped: true,
        model: Schema.Number,
        message: Schema.Literal("inc"),
        elements: Html
      }).make({
        init: () => 0,
        update: (count) => count + 1,
        view: (count, h) => h.button.onClick("inc").children("count:" + count)
      })
      const Writer = Component.define({
        name: "Writer",
        scoped: false,
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({ init: () => null, update: (model) => model, parts: () => ({}) })
      const Switch = Component.define({
        name: "Switch",
        scoped: false,
        model: Schema.Literals(["a", "b"]),
        message: Schema.Literal("flip"),
        elements: Html
      }).make({
        init: () => "a" as const,
        update: (which) => which === "a" ? "b" : "a",
        parts: (which, p) => ({ which, flip: p.part("button", (b) => b.onClick("flip")) })
      })
      const Page = Component.define({
        name: "Page",
        scoped: false,
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) =>
          h.scoped((s) =>
            Switch(h, {
              key: "s",
              view: (parts) =>
                h.div(
                  parts.flip(h.button.children("flip")),
                  Writer(h, { key: parts.which, view: () => Row(s, { key: "r" }) })
                )
            })
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "count:0")
      yield* TestHost.settle
      click(root, "flip")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "flipcount:1")
    })))

  it.effect("a receiver that redraws an old write doesn't start a child its author ended", () =>
    provideHost(Effect.gen(function*() {
      let starts = 0
      const Probe = Component.define({ name: "Probe", scoped: true, model: Schema.Null, message: Schema.Never })
        .make({
          init: () => {
            starts++
            return null
          },
          update: (model) => model,
          view: (_, h) => h.el("i", "probe")
        })
      const ToggleMsg = UiSchema.TaggedEnum({ Toggle: {} })
      const Toggling = Component.define({
        name: "Toggling",
        scoped: true,
        model: Schema.Boolean,
        message: ToggleMsg,
        receives: ["Toggle"],
        slots: ["body"]
      }).make({
        init: () => true,
        update: (open) => !open,
        view: (open, h) => h.el("section", open ? h.slots.body : null)
      })
      const BoxRef = Toggling.ref("B")
      const Page = Component.define({
        name: "Page",
        scoped: false,
        model: Schema.Literals(["box", "page", "ended"]),
        message: Schema.Literals(["page", "end", "toggle"])
      }).make({
        init: () => "box" as const,
        update: (_, message, $) =>
          message === "toggle" ? $.send(BoxRef, ToggleMsg.Toggle()) : message === "end" ? "ended" : "page",
        view: (mode, h) =>
          h.el(
            "main",
            h.scoped((s) =>
              mode === "box" ? Toggling(s, { ref: BoxRef, slots: { body: Probe(s, { key: "p" }) } }) : null
            ),
            h.scoped(({ model }) => model !== "ended", (s) => mode === "box" ? null : Probe(s, { key: "p" }))
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      for (const message of ["page", "end", "toggle", "toggle"] as const) {
        root.send(message)
        yield* TestHost.settle
      }
      assert.strictEqual(starts, 1)
    })))

  it.effect("a receiver that redraws an old write doesn't start a child that ended while its author left it out", () =>
    provideHost(Effect.gen(function*() {
      let starts = 0
      const Probe = Component.define({ name: "Probe", scoped: true, model: Schema.Null, message: Schema.Never })
        .make({
          init: () => {
            starts++
            return null
          },
          update: (model) => model,
          view: (_, h) => h.el("i", "probe")
        })
      const ToggleMsg = UiSchema.TaggedEnum({ Toggle: {} })
      const Toggling = Component.define({
        name: "Toggling",
        scoped: true,
        model: Schema.Boolean,
        message: ToggleMsg,
        receives: ["Toggle"],
        slots: ["body"]
      }).make({
        init: () => true,
        update: (open) => !open,
        view: (open, h) => h.el("section", open ? h.slots.body : null)
      })
      const BoxRef = Toggling.ref("B")
      const Page = Component.define({
        name: "Page",
        scoped: false,
        model: Schema.Literals(["box", "page", "ended"]),
        message: Schema.Literals(["page", "end", "toggle"])
      }).make({
        init: () => "box" as const,
        update: (_, message, $) =>
          message === "toggle" ? $.send(BoxRef, ToggleMsg.Toggle()) : message === "end" ? "ended" : "page",
        view: (mode, h) =>
          h.el(
            "main",
            h.scoped((s) =>
              mode === "box" ? Toggling(s, { ref: BoxRef, slots: { body: Probe(s, { key: "p" }) } }) : null
            ),
            h.scoped(({ model }) => model !== "ended", (s) => mode === "page" ? Probe(s, { key: "p" }) : null)
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      for (const message of ["page", "end", "toggle", "toggle"] as const) {
        root.send(message)
        yield* TestHost.settle
      }
      assert.strictEqual(starts, 1)
    })))

  it.effect("a receiver that redraws an old write leaves the child where its author returns it without writing it", () =>
    provideHost(Effect.gen(function*() {
      const ToggleMsg = UiSchema.TaggedEnum({ Toggle: {} })
      const Toggling = Component.define({
        name: "Toggling",
        scoped: true,
        model: Schema.Boolean,
        message: ToggleMsg,
        receives: ["Toggle"],
        slots: ["body"]
      }).make({
        init: () => true,
        update: (open) => !open,
        view: (open, h) => h.el("section", open ? h.slots.body : null)
      })
      const BoxRef = Toggling.ref("B")
      let cached: View.Child<any, any> | undefined
      const Page = Component.define({
        name: "Page",
        scoped: false,
        model: Schema.Number,
        message: Schema.Literals(["again", "toggle"])
      }).make({
        init: () => 0,
        update: (renders, message, $) => message === "again" ? renders + 1 : $.send(BoxRef, ToggleMsg.Toggle()),
        view: (renders, h) =>
          h.scoped((s) =>
            h.el(
              "main",
              renders === 0 ? Toggling(s, { ref: BoxRef, slots: { body: Counter(s, { key: "c" }) } }) : null,
              renders === 0 ? null : cached ??= Counter(s, { key: "c" })
            )
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "count:0")
      yield* TestHost.settle
      for (const message of ["again", "again", "toggle", "toggle"] as const) {
        root.send(message)
        yield* TestHost.settle
      }
      assert.strictEqual(root.text(), "count:1")
    })))

  it.effect("keeps a child one headless writer stopped writing and another writes", () =>
    provideHost(Effect.gen(function*() {
      const Writer = Component.define({ name: "Writer", scoped: false, model: Schema.Null, message: Schema.Never })
        .make({ init: () => null, update: (model) => model, parts: () => ({}) })
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.Number, message: Schema.Null })
        .make({
          init: () => 0,
          update: (phase) => phase + 1,
          view: (phase, h) =>
            h.scoped(({ model }) => model !== 0, (s) =>
              h.el(
                "div",
                Writer(h, { key: "a", view: () => h.el("i", phase === 0 ? Billing(s, { key: "b" }) : null) }),
                Writer(h, { key: "b", view: () => h.el("i", phase === 2 ? Billing(s, { key: "b" }) : null) })
              ))
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send(null)
      yield* TestHost.settle
      root.send(null)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "billing")
    })))

  it.effect("fails the author that writes two components of one name and key", () =>
    provideHost(Effect.gen(function*() {
      const define = () =>
        Component.define({ name: "Row", scoped: true, model: Schema.Null, message: Schema.Never })
          .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("p", "row") })
      const [First, Second] = [define(), define()]
      const Inner = Component.define({ name: "Inner", scoped: false, model: Schema.Null, message: Schema.Never })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            h.scoped((s) =>
              h.el(
                "div",
                Shut(h, { key: "x", slots: { body: First(s, { key: "k" }) } }),
                Shut(h, { key: "y", slots: { body: Second(s, { key: "k" }) } })
              )
            )
        })
      const root = yield* TestHost.mount(host(Inner), {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "down")
    })))

  it.effect("draws a child its author returns again without writing it again", () =>
    provideHost(Effect.gen(function*() {
      let cached: View.Child<any, any> | undefined
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.Number, message: Schema.Null })
        .make({
          init: () => 0,
          update: (count) => count + 1,
          view: (_, h) => h.scoped((s) => h.el("div", cached ??= Billing(s, { key: "b" })))
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send(null)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "billing")
    })))

  it.effect("draws a child a failed child's fallback writes", () =>
    provideHost(Effect.gen(function*() {
      const Broken = Component.define({ name: "Broken", scoped: false, model: Schema.Null, message: Schema.Never })
        .make({
          init: () => null,
          update: (model) => model,
          view: () => {
            throw new Error("broken")
          }
        })
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.Null, message: Schema.Never })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            h.scoped((s) =>
              h.el(
                "div",
                h.el("p", "before"),
                Broken(h, { key: "x", fallback: () => Billing(s, { key: "b" }) }),
                h.el("p", "after")
              )
            )
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "beforebillingafter")
    })))

  it.effect.each(["open", "closed", "false"] as const)(
    "fails the author whose two closures write one child, the first slot or predicate %s",
    (first) =>
      provideHost(Effect.gen(function*() {
        const Side = Component.define({ name: "Side", scoped: false, model: Schema.Null, message: Schema.Never })
          .make({ init: () => null, update: (model) => model, parts: () => ({}) })
        const Inner = Component.define({ name: "Inner", scoped: false, model: Schema.Null, message: Schema.Never })
          .make({
            init: () => null,
            update: (model) => model,
            view: (_, h) =>
              h.scoped(({ model }) => first !== "false" || model !== null, (s) =>
                h.el(
                  "div",
                  Side(h, {
                    key: "a",
                    view: () =>
                      first === "open"
                        ? h.el("p", Billing(s, { key: "b" }))
                        : Shut(h, { key: "x", slots: { body: Billing(s, { key: "b" }) } })
                  }),
                  Side(h, { key: "b", view: () => Shut(h, { key: "y", slots: { body: Billing(s, { key: "b" }) } }) })
                ))
          })
        const root = yield* TestHost.mount(host(Inner), {})
        yield* TestHost.settle
        assert.strictEqual(root.text(), "down")
      }))
  )

  it.each(["closures", "slots"] as const)(
    "a Scene fails the author that writes two components of one name and key, in two %s",
    (where) => {
      const define = () =>
        Component.define({ name: "Row", scoped: true, model: Schema.Null, message: Schema.Never })
          .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("p", "row") })
      const [First, Second] = [define(), define()]
      const Side = Component.define({ name: "Side", scoped: false, model: Schema.Null, message: Schema.Never })
        .make({ init: () => null, update: (model) => model, parts: () => ({}) })
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.Null, message: Schema.Never })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            h.scoped((s) =>
              where === "closures"
                ? h.el(
                  "div",
                  Side(h, { key: "a", view: () => h.el("p", First(s, { key: "k" })) }),
                  Side(h, { key: "b", view: () => h.el("p", Second(s, { key: "k" })) })
                )
                : h.el(
                  "div",
                  Shut(h, { key: "x", slots: { body: First(s, { key: "k" }) } }),
                  Shut(h, { key: "y", slots: { body: Second(s, { key: "k" }) } })
                )
            )
        })
      assert.throws(() => Scene.start(Page, {}).view, /\/Page writes Row\[k\] twice in one render/)
    }
  )
})

describe("scoped children that report to shared state", () => {
  it.effect("move their report to the owner above where they're drawn", () =>
    provideHost(Effect.gen(function*() {
      const CountMsg = UiSchema.TaggedEnum({ Counted: { count: Schema.Number } })
      const Count = Component.define({
        name: "Count",
        scoped: false,
        model: Schema.Number,
        message: CountMsg,
        shares: {
          value: (count) => ({ count }),
          collects: { schema: Schema.Boolean, onChange: (reports) => CountMsg.Counted({ count: reports.length }) }
        }
      }).make({ init: () => 0, update: (_, { count }) => count, parts: (count) => ({ count }) })
      const Member = Component.define({
        name: "Member",
        scoped: true,
        model: Schema.Null,
        message: Schema.Never,
        shared: { count: { owner: Count, optional: true, report: () => true } }
      }).make({ init: () => null, update: (model) => model, view: (_, h) => h.el("i") })
      const Page = Component.define({ name: "Page", scoped: false, model: Schema.Boolean, message: Schema.Boolean })
        .make({
          init: () => true,
          update: (_, left) => left,
          view: (left, h) =>
            h.scoped((s) =>
              h.el(
                "main",
                Count(h, {
                  key: "l",
                  view: (parts) => h.el("p", "L" + parts.count, left ? Member(s, { key: "m" }) : null)
                }),
                Count(h, {
                  key: "r",
                  view: (parts) => h.el("p", "R" + parts.count, left ? null : Member(s, { key: "m" }))
                })
              )
            )
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "L1R0")
      root.send(false)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "L0R1")
    })))
})
