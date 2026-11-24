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
import * as services from "@effect/ui/internal/services"
import { Locator, Scene, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import {
  Cause,
  Deferred,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
  SchemaGetter
} from "effect"

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(TestHost.layer()))
const click = (
  root: Pick<TestHost.TestRoot<any, any, any>, "get">,
  text: string
) => Locator.fire(root.get(Locator.text(text, { exact: true })), "click")
const lifecycle = (
  root: { readonly log: () => ReadonlyArray<MessageLog.Entry> },
  path: string
) =>
  root.log().flatMap((entry) =>
    "path" in entry && entry.path === path && entry._tag !== "Update" &&
      !entry._tag.startsWith("Command")
      ? [entry._tag]
      : []
  )

const FormMsg = UiSchema.TaggedEnum({
  Typed: {},
  Save: {},
  Saved: { text: Schema.String }
})
const FormEvents = UiSchema.TaggedEnum({ Saved: { text: Schema.String } })
const FormModel = Schema.Struct({ draft: Schema.String, saved: Schema.String })

const makeForm = (saving: Deferred.Deferred<void>) => {
  const Save = Command.make(
    "Save",
    { args: { text: Schema.String } },
    ({ text }) =>
      Deferred.await(saving).pipe(Effect.as(FormMsg.Saved({ text })))
  )
  return Component.define({
    name: "Profile",
    model: FormModel,
    message: FormMsg,
    events: FormEvents
  }).make({
    head: () => [Head.title("Profile")],
    init: () => ({ draft: "", saved: "" }),
    update: ($, message) =>
      FormMsg.match(message, {
        Typed: () => ({ ...$.model, draft: $.model.draft + "a" }),
        Save: () => $.run(Save.make({ text: $.model.draft })),
        Saved: ({ text }) =>
          $.set({ ...$.model, saved: text }).emit(FormEvents.Saved({ text }))
      }),
    view: (h, model) =>
      h.el(
        "form",
        h.el("button").on("click", FormMsg.Typed()).children(
          "draft:" + model.draft
        ),
        h.el("button").on("click", FormMsg.Save()).children("save"),
        h.el("p", "saved:" + model.saved)
      )
  })
}

const Billing = Component.define({
  name: "Billing",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.el("p", "billing")
})

const SettingsMsg = UiSchema.TaggedEnum({
  Show: { tab: Schema.String },
  Saved: { text: Schema.String }
})
const SettingsModel = Schema.Struct({
  tab: Schema.String,
  saved: Schema.Array(Schema.String)
})

const makeSettings = (Profile: ReturnType<typeof makeForm>) =>
  Component.define({
    name: "Settings",
    model: SettingsModel,
    message: SettingsMsg
  }).make({
    head: () => [Head.title("Settings")],
    init: () => ({ tab: "profile", saved: [] }),
    update: ($, message) =>
      SettingsMsg.match(message, {
        Show: ({ tab }) => ({ ...$.model, tab }),
        Saved: ({ text }) => ({ ...$.model, saved: [...$.model.saved, text] })
      }),
    view: (h, model) =>
      h.el(
        "main",
        model.tab === "profile"
          ? h.keepAlive((s) =>
            Profile(s, {
              key: "Form",
              onEmit: (event) =>
                SettingsMsg.Saved({ text: event.text + "@" + model.tab })
            })
          )
          : h.keepAlive((s) => Billing(s, { key: "billing" }))
      )
  })

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
  const maybe = (node: TestHost.TestNode | undefined) =>
    node === undefined ? undefined : id(node)
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
      host.insertBefore(
        of(parent),
        of(node),
        ref === undefined ? undefined : of(ref)
      ),
    remove: (node) => host.remove(of(node)),
    parentOf: (node) => maybe(host.parentOf(of(node))),
    nextOf: (node) => maybe(host.nextOf(of(node))),
    setEvents: (node, handlers, dispatch, options) =>
      host.setEvents(of(node), handlers, dispatch, options),
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

describe("keep-alive children", () => {
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

      root.send(SettingsMsg.Show({ tab: "profile" }))
      yield* TestHost.settle
      assert.strictEqual(root.head().title, "Profile")
      assert.strictEqual(root.text(), "draft:asavesaved:a")
      assert.deepStrictEqual(lifecycle(root, "/Settings/Profile[Form]"), [
        "Mounted",
        "Kept",
        "Drawn"
      ])
      assert.deepStrictEqual(lifecycle(root, "/Settings/Billing[billing]"), [
        "Mounted",
        "Kept"
      ])
    })))

  it.effect("an event on a node of a kept child reaches the child", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(
        makeSettings(makeForm(yield* Deferred.make<void>())),
        {}
      )
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
  props: Schema.Struct({ label: Schema.String }),
  model: Schema.Number,
  message: Schema.Literal("inc")
}).make({
  init: () => 0,
  update: ($) => $.model + 1,
  view: (h, count) =>
    h.el("li").on("click", "inc").children(`${h.props.label}:${count}`)
})

const ListMsg = UiSchema.TaggedEnum({
  Filter: { text: Schema.String },
  Delete: { id: Schema.String },
  Add: { id: Schema.String, label: Schema.String }
})
const ListModel = Schema.Struct({
  items: Schema.Record(Schema.String, Schema.String),
  filter: Schema.String
})

const List = Component.define({
  name: "List",
  model: ListModel,
  message: ListMsg
}).make({
  init: () => ({ items: { a: "apple", b: "banana" }, filter: "" }),
  update: ($, message) =>
    ListMsg.match(message, {
      Filter: ({ text }) => ({ ...$.model, filter: text }),
      Delete: ({ id }) => {
        const { [id]: _, ...items } = $.model.items
        return { ...$.model, items }
      },
      Add: ({ id, label }) => ({
        ...$.model,
        items: { ...$.model.items, [id]: label }
      })
    }),
  view: (h, model) =>
    h.el(
      "ul",
      h.keepAlive(({ key, model }) => key in model.items, (s) =>
        Object.keys(model.items)
          .filter((id) =>
            model.items[id]!.includes(model.filter)
          )
          .map((id) => Row(s, { key: id, props: { label: model.items[id]! } })))
    )
})

const failureOf = (
  root: { readonly log: () => ReadonlyArray<MessageLog.Entry> }
) =>
  root.log().find((entry) => entry._tag === "Failed") as
    | MessageLog.Failed
    | undefined

const host = <Model, Message>(
  Inner: Component.Component<"Inner", {}, Model, Message, never>
) =>
  Component.define({
    name: "Host",
    model: Schema.Null,
    message: Schema.Never
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) =>
      h.el("main", Inner(h, { key: "i", fallback: () => h.el("p", "down") }))
  })

describe("keep-alive lists", () => {
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
      assert.deepStrictEqual(lifecycle(root, "/List/Row[a]"), [
        "Mounted",
        "Kept",
        "Drawn",
        "Kept",
        "Unmounted"
      ])
      root.send(ListMsg.Add({ id: "a", label: "apple" }))
      root.send(ListMsg.Filter({ text: "" }))
      yield* TestHost.settle
      assert.strictEqual(root.text(), "banana:0apple:0")
    })))
})

describe("keepAlive predicates", () => {
  for (
    const [name, alive] of [
      ["reads nothing from its argument", () => true],
      ["reads only the key", ($: { readonly key: string }) => $.key === "b"]
    ] as const
  ) {
    it.effect(`fails the author when it ${name}`, () =>
      provideHost(Effect.gen(function*() {
        const Inner = Component.define({
          name: "Inner",
          model: Schema.Null,
          message: Schema.Never
        })
          .make({
            init: () => null,
            update: ($) => $.model,
            view: (h) =>
              h.el("div", h.keepAlive(alive, (s) => Billing(s, { key: "b" })))
          })
        const root = yield* TestHost.mount(host(Inner), {})
        yield* TestHost.settle
        assert.strictEqual(root.text(), "down")
        const failed = failureOf(root)!
        assert.strictEqual(failed.path, "/Host/Inner[i]")
        assert.include(Cause.pretty(failed.cause), "({ model, key }) =>")
      })))
  }

  it.effect.each([true, false])(
    "fails the author when it throws (for a child that render writes: %s)",
    (written) =>
      provideHost(Effect.gen(function*() {
        const Inner = Component.define({
          name: "Inner",
          model: Schema.Boolean,
          message: Schema.Literal("go")
        })
          .make({
            init: () => false,
            update: () => true,
            view: (h, gone) =>
              h.el(
                "div",
                h.el("button").on("click", "go").children("go"),
                h.keepAlive(({ model }) => {
                  if (model) throw new Error("no model")
                  return true
                }, (s) => gone && !written ? null : Billing(s, { key: "b" }))
              )
          })
        const root = yield* TestHost.mount(host(Inner), {})
        yield* TestHost.settle
        assert.strictEqual(root.text(), "gobilling")
        click(root, "go")
        yield* TestHost.settle
        assert.strictEqual(root.text(), "down")
        assert.include(Cause.pretty(failureOf(root)!.cause), "no model")
      }))
  )
})

describe("keep-alive paths", () => {
  it.effect("fails the author that writes one child twice in a render", () =>
    provideHost(Effect.gen(function*() {
      const Inner = Component.define({
        name: "Inner",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) =>
            h.el(
              "div",
              h.keepAlive((s) => Billing(s, { key: "b" })),
              h.keepAlive((s) => Billing(s, { key: "b" }))
            )
        })
      const root = yield* TestHost.mount(host(Inner), {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "down")
      assert.include(Cause.pretty(failureOf(root)!.cause), "Billing[b]")
    })))
})

describe("keep-alive lifetimes", () => {
  it.effect("ends kept children with their author", () =>
    provideHost(Effect.gen(function*() {
      const Inner = Component.define({
        name: "Inner",
        model: Schema.Boolean,
        message: Schema.Boolean
      })
        .make({
          init: () => true,
          update: (_, shown) => shown,
          view: (h, shown) =>
            h.el(
              "div",
              h.keepAlive((s) => shown ? Billing(s, { key: "b" }) : null)
            )
        })
      const Page = Component.define({
        name: "Page",
        model: Schema.Boolean,
        message: Schema.Boolean
      })
        .make({
          init: () => true,
          update: (_, shown) => shown,
          view: (h, shown) =>
            h.el("main", shown ? Inner(h, { key: "i" }) : null)
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send(false)
      yield* TestHost.settle
      assert.deepStrictEqual(lifecycle(root, "/Page/Inner[i]/Billing[b]"), [
        "Mounted",
        "Unmounted"
      ])
      root.send(true)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "billing")
    })))

  it.effect("shows a child that failed while kept as its fallback once drawn", () =>
    provideHost(Effect.gen(function*() {
      const breaking = yield* Deferred.make<void>()
      const Boom = Command.make(
        "Boom",
        { args: {} },
        () => Deferred.await(breaking).pipe(Effect.andThen(Effect.die("boom")))
      )
      const Fragile = Component.define({
        name: "Fragile",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: ($) => $.set(null).run(Boom.make()),
          update: ($) => $.model,
          view: (h) => h.el("p", "fine")
        })
      const Page = Component.define({
        name: "Page",
        model: Schema.Boolean,
        message: Schema.Boolean
      })
        .make({
          init: () => true,
          update: (_, shown) => shown,
          view: (h, shown) =>
            h.el(
              "div",
              h.keepAlive((s) =>
                shown
                  ? Fragile(s, { key: "F", fallback: () => h.el("p", "down") })
                  : null
              )
            )
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send(false)
      yield* TestHost.settle
      yield* Deferred.succeed(breaking, undefined)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "")
      assert.include(Cause.pretty(failureOf(root)!.cause), "boom")
      root.send(true)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "down")
    })))

  it.effect("fails the author on a host that can't hold kept nodes", () =>
    Effect.gen(function*() {
      const Tabs = Component.define({
        name: "Tabs",
        props: Schema.Struct({ shown: Schema.Boolean }),
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.el(
            "div",
            h.keepAlive((s) => h.props.shown ? Billing(s, { key: "b" }) : null)
          )
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Boolean,
        message: Schema.Boolean
      })
        .make({
          init: () => true,
          update: (_, shown) => shown,
          view: (h, shown) =>
            Tabs(h, {
              key: "t",
              props: { shown },
              fallback: () => h.el("p", "down")
            })
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "billing")
      root.send(false)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "down")
      const failed = failureOf(root)!
      assert.strictEqual(failed.path, "/Page/Tabs[t]")
      assert.include(
        Cause.pretty(failed.cause),
        "this host has no createContainer"
      )
    }).pipe(Effect.provide(Renderer.layer(withoutContainer())), provideHost))

  it.effect("stops a kept child's mounts and starts them again once it's drawn", () =>
    Effect.gen(function*() {
      const running = new Set<string>()
      const track = (name: string) =>
        Mount.make(
          name,
          { args: {} },
          () =>
            Effect.acquireRelease(Effect.sync(() => running.add(name)), () =>
              Effect.sync(() => running.delete(name)))
              .pipe(Effect.andThen(Effect.never))
        )()
      const Leaf = Component.define({
        name: "Leaf",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.el("i").onMount(track("leaf"))
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Boolean,
        message: Schema.Boolean
      })
        .make({
          init: () => true,
          update: (_, shown) => shown,
          view: (h, shown) =>
            h.el(
              "div",
              h.keepAlive((s) => shown ? Leaf(s, { key: "l" }) : null)
            )
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
      Effect.provide(
        Renderer.layer({ ...TestHost.makeHost(), runsMounts: true })
      ),
      provideHost
    ))

  it.effect("starts a mount under a handle the host recycled from a removed author's container", () =>
    Effect.gen(function*() {
      const { containers, host, recycle, root: container, text } = numbered()
      let started = 0
      const Track = Mount.make(
        "Track",
        { args: {} },
        () =>
          Effect.sync(() => void started++).pipe(Effect.andThen(Effect.never))
      )
      const Tabs = Component.define({
        name: "Tabs",
        props: Schema.Boolean,
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) =>
            h.el(
              "div",
              h.keepAlive((s) => h.props ? Billing(s, { key: "b" }) : null)
            )
        })
      const State = Schema.Struct({
        key: Schema.String,
        shown: Schema.Boolean,
        tracked: Schema.Boolean
      })
      const Page = Component.define({
        name: "Page",
        model: State,
        message: State
      }).make({
        init: () => ({ key: "a", shown: true, tracked: false }),
        update: (_, next) => next,
        view: (h, state) =>
          h.el(
            "main",
            Tabs(h, { key: state.key, props: state.shown }),
            state.tracked ? h.el("b").onMount(Track()) : null
          )
      })
      const root = yield* Renderer.mount(Page, {}, container).pipe(
        Effect.provide(Renderer.layer(host))
      )
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

  it("a Scene counts a mount in a keep-alive child's slot once its predicate holds", () => {
    const Track = Mount.make("Track", { args: {} }, () => Effect.never)
    const Frame = Component.define({
      name: "Frame",
      model: Schema.Null,
      message: Schema.Never,
      slots: ["body"]
    })
      .make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.el("article", h.slots.body)
      })
    const Page = Component.define({
      name: "Page",
      model: Schema.Boolean,
      message: Schema.Boolean
    }).make(
      {
        init: () => false,
        update: ($) => !$.model,
        view: (h) =>
          h.el(
            "div",
            h.el("button").on("click", true).children("toggle"),
            h.keepAlive(({ model }) => model, (s) =>
              Frame(s, {
                key: "f",
                slots: { body: h.el("b").onMount(Track()) }
              }))
          )
      }
    )
    const s = Scene.start(Page, {})
    assert.throws(
      () => s.expectMount(Track()),
      /no rendered mount matches Track/
    )
    s.click(Locator.text("toggle")).expectMount(Track())
  })
})

const withoutContainer = () => {
  const { createContainer: _, ...host } = TestHost.makeHost()
  return host
}

const Draft = Component.define({
  name: "Draft",
  model: Schema.String,
  message: Schema.Literal("type")
})
  .make({
    init: () => "",
    update: ($) => $.model + "a",
    view: (h, draft) =>
      h.el("button").on("click", "type").children("draft:" + draft)
  })

const TabsRoute = Route.union({
  Home: Route.make("/"),
  Tabs: Route.make("/tabs")
})

const TabsPage = Component.define({
  name: "TabsPage",
  model: Schema.String,
  message: Schema.String
})
  .make({
    init: () => "profile",
    update: (_, tab) => tab,
    view: (h, tab) =>
      h.el(
        "section",
        h.el("button").on("click", tab === "profile" ? "billing" : "profile")
          .children("switch"),
        tab === "profile"
          ? h.keepAlive((s) => Draft(s, { key: "d" }))
          : h.keepAlive((s) => Billing(s, { key: "b" }))
      )
  })

const TabsMsg = UiSchema.TaggedEnum({
  Changed: { route: TabsRoute },
  Go: { route: TabsRoute },
  Done: {}
})
const TabsApp = Component.define({
  name: "TabsApp",
  props: Schema.Struct({ route: TabsRoute }),
  model: TabsRoute,
  message: TabsMsg
}).make({
  init: ($) => $.props.route,
  update: ($, message) =>
    TabsMsg.match(message, {
      Changed: (changed) => changed.route,
      Go: (go) =>
        $.run(
          Router.push(TabsRoute, go.route).pipe(
            Command.map(() => TabsMsg.Done())
          )
        ),
      Done: () => $.model
    }),
  subscriptions: (
    { model: route }
  ) => [
    Router.subscription(
      TabsRoute,
      route,
      (changed) => TabsMsg.Changed({ route: changed })
    )
  ],
  view: (h, route) =>
    h.el(
      "div",
      h.el("button").on(
        "click",
        TabsMsg.Go({ route: TabsRoute.make({ _tag: "Home" }) })
      ).children("Home"),
      route._tag === "Tabs" ? TabsPage(h, { key: "/tabs" }) : h.el("p", "home")
    )
})

describe("saved state of keep-alive children", () => {
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

  it.effect("the Router is asked for it once at mount and once per navigation", () => {
    const history = Router.memoryHistory("/tabs")
    return Effect.gen(function*() {
      const hooks = Option.getOrThrow(
        yield* Effect.serviceOption(services.RootHooks)
      )
      let asked = 0
      const counting: services.RootHooks = {
        ...hooks,
        entry: () => {
          asked++
          return hooks.entry()
        }
      }
      const root = yield* TestHost.mount(TabsApp, Router.props(TabsRoute)).pipe(
        Effect.provideService(services.RootHooks, counting)
      )
      yield* TestHost.settle
      assert.strictEqual(asked, 1)
      click(root, "switch")
      yield* TestHost.settle
      click(root, "Home")
      yield* TestHost.settle
      assert.strictEqual(asked, 2)
      history.go(-1)
      yield* TestHost.settle
      click(root, "switch")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "Homeswitchdraft:")
      assert.strictEqual(asked, 3)
    }).pipe(
      Effect.provide(Router.make({ routes: TabsRoute, history })),
      Effect.provide(TestHost.layer())
    )
  })
})

const Card = Component.define({
  name: "Card",
  model: Schema.Null,
  message: Schema.Never,
  slots: ["body"]
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.el("section", h.slots.body)
})

const Collapsible = Component.define({
  name: "Collapsible",
  model: Schema.Boolean,
  message: Schema.Literal("toggle"),
  slots: ["body"]
}).make({
  init: () => true,
  update: ($) => !$.model,
  view: (h, open) =>
    h.el(
      "section",
      h.el("button").on("click", "toggle").children("toggle"),
      open ? h.slots.body : null
    )
})

describe("EFF-4038 probes, keepAlive", () => {
  it.effect("P1: wrapping a child in a slot component keeps it", () =>
    provideHost(Effect.gen(function*() {
      const Page = Component.define({
        name: "Page",
        model: Schema.Boolean,
        message: Schema.Boolean
      })
        .make({
          init: () => false,
          update: (_, wide) => wide,
          view: (h, wide) =>
            h.keepAlive((s) =>
              h.el(
                "main",
                wide
                  ? Card(h, {
                    key: "card",
                    slots: { body: Draft(s, { key: "f" }) }
                  })
                  : Draft(s, { key: "f" })
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
      const Page = Component.define({
        name: "Page",
        model: Schema.Boolean,
        message: Schema.Boolean
      })
        .make({
          init: () => false,
          update: (_, moved) => moved,
          view: (h, moved) =>
            h.keepAlive((s) =>
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
      const Page = Component.define({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.keepAlive((s) =>
            Collapsible(h, {
              key: "c",
              slots: { body: Draft(s, { key: "f" }) }
            })
          )
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
      assert.deepStrictEqual(lifecycle(root, "/Page/Draft[f]"), [
        "Mounted",
        "Kept",
        "Drawn"
      ])
    })))
})

describe("keep-alive children of a headless child", () => {
  it.effect("a headless child's closure writes them with its author's h.keepAlive, and a kept one leaves collects", () =>
    provideHost(Effect.gen(function*() {
      const GroupMsg = UiSchema.TaggedEnum({
        ChangedOpen: { open: Schema.Boolean }
      })
      const PanelGroup = Component.define({
        name: "PanelGroup",
        model: Schema.Struct({ anyOpen: Schema.Boolean }),
        message: GroupMsg,
        shares: {
          value: (model) => ({ anyOpen: model.anyOpen }),
          collects: {
            schema: Schema.Boolean,
            onChange: (collected) =>
              GroupMsg.ChangedOpen({ open: collected.includes(true) })
          }
        }
      }).make({
        init: () => ({ anyOpen: false }),
        update: (_, { open }) => ({ anyOpen: open }),
        parts: (_, model) => ({ anyOpen: model.anyOpen })
      })
      const Panel = Component.define({
        name: "Panel",
        props: Schema.Struct({ title: Schema.String }),
        model: Schema.Boolean,
        message: Schema.Literal("toggle"),
        shared: {
          group: { owner: PanelGroup, optional: true, report: (open) => open }
        }
      }).make({
        init: () => false,
        update: ($) => !$.model,
        view: (h, open) =>
          h.el("button").on("click", "toggle").children(
            h.props.title + (open ? "+" : "-")
          )
      })
      const App = Component.define({
        name: "App",
        model: Schema.Boolean,
        message: Schema.Boolean
      })
        .make({
          init: () => true,
          update: (_, shown) => shown,
          view: (h, shown) =>
            h.keepAlive((s) =>
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
      assert.deepStrictEqual(lifecycle(root, "/App/Panel[b]"), [
        "Mounted",
        "Kept",
        "Drawn"
      ])
    })))

  it.effect("headless owners in a keep-alive child moved up a level get an event deepest first", () =>
    provideHost(Effect.gen(function*() {
      const HitMsg = UiSchema.TaggedEnum({ Hit: {} })
      const owner = <Name extends string>(name: Name) =>
        Component.define({
          name,
          model: Schema.Null,
          message: HitMsg
        }).make({
          init: () => null,
          update: ($) => $.model,
          parts: (p) => ({ hit: p.part((b) => b.on("click", HitMsg.Hit())) })
        })
      const Outer = owner("Outer")
      const Inner = owner("Inner")
      const Tree = Component.define({
        name: "Tree",
        model: Schema.Boolean,
        message: Schema.Literal("nest")
      }).make({
        init: () => false,
        update: () => true,
        view: (h, nested) =>
          h.el(
            "div",
            h.el("button").on("click", "nest").children("nest"),
            Outer(h, {
              key: "o",
              view: (outer) =>
                nested
                  ? Inner(h, {
                    key: "i",
                    view: (inner) =>
                      inner.hit(outer.hit(h.el("button"))).children("go")
                  })
                  : outer.hit(h.el("button")).children("go")
            })
          )
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Boolean,
        message: Schema.Boolean
      })
        .make({
          init: () => true,
          update: (_, deep) => deep,
          view: (h, deep) =>
            h.keepAlive((s) => {
              const tree = Tree(s, { key: "t" })
              return h.el(
                "main",
                deep ? Box(s, { key: "b", slots: { body: tree } }) : tree
              )
            })
        })
      const root = yield* TestHost.mount(Page, {})
      root.send(false)
      yield* TestHost.settle
      click(root, "nest")
      yield* TestHost.settle
      assert.deepStrictEqual(
        (root.get(Locator.text("go", { exact: true })) as TestHost.TestElement)
          .owners,
        {
          click: ["/Page/Tree[t]/Outer[o]/Inner[i]", "/Page/Tree[t]/Outer[o]"]
        }
      )
    })))
})

const CounterMsg = UiSchema.TaggedEnum({ Inc: {} })
const Counter = Component.define({
  name: "Counter",
  model: Schema.Number,
  message: CounterMsg
}).make({
  init: () => 0,
  update: ($) => $.model + 1,
  view: (h, count) =>
    h.el("button").on("click", CounterMsg.Inc()).children("count:" + count)
})

const Box = Component.define({
  name: "Box",
  model: Schema.Null,
  message: Schema.Never,
  slots: ["body"]
})
  .make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => h.el("section", h.slots.body)
  })

const Shut = Component.define({
  name: "Shut",
  model: Schema.Boolean,
  message: Schema.Literal("toggle"),
  slots: ["body"]
}).make({
  init: () => false,
  update: ($) => !$.model,
  view: (h, open) =>
    h.el(
      "section",
      h.el("button").on("click", "toggle").children("toggle"),
      open ? h.slots.body : null
    )
})

describe("keep-alive children drawn by other children", () => {
  it.effect("are drawn again once their own keyed Layer builds again", () =>
    provideHost(Effect.gen(function*() {
      const Room = Component.define({
        name: "Room",
        model: Schema.Literals(["a", "b"]),
        message: Schema.Literal("move")
      }).make({
        init: () => "a" as const,
        update: () => "b" as const,
        view: (h, room) =>
          h.el("button").on("click", "move").children("room:" + room)
      })
      const Keyed = Component.provide(Room, {
        key: (_, room) => room,
        layer: () => Layer.empty
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.keepAlive((s) => h.el("main", Keyed(s, { key: "r" })))
      })
      const root = yield* TestHost.mount(Page, {})
      click(root, "room:a")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "room:b")
    })))

  it.effect("keeps a child drawn in a receiver that fails, and draws it elsewhere after", () =>
    provideHost(Effect.gen(function*() {
      const Frail = Component.define({
        name: "Frail",
        model: Schema.Null,
        message: Schema.Literal("break"),
        slots: ["body"]
      }).make({
        init: () => null,
        update: () => {
          throw new Error("broken")
        },
        view: (h) =>
          h.el(
            "section",
            h.el("button").on("click", "break").children("break"),
            h.slots.body
          )
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Boolean,
        message: Schema.Boolean
      })
        .make({
          init: () => false,
          update: (_, direct) => direct,
          view: (h, direct) =>
            h.keepAlive((s) => {
              const counter = Counter(s, { key: "c" })
              return h.el(
                "main",
                direct
                  ? counter
                  : Frail(h, {
                    key: "f",
                    slots: { body: counter },
                    fallback: () => h.el("p", "down")
                  })
              )
            })
        })
      const root = yield* TestHost.mount(Page, {})
      click(root, "count:0")
      yield* TestHost.settle
      click(root, "break")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "down")
      root.send(true)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "count:1")
    })))

  it.effect("keeps a child its receiver stops placing as its Layer builds again", () =>
    provideHost(Effect.gen(function*() {
      const Room = Component.define({
        name: "Room",
        model: Schema.Literals(["a", "b"]),
        message: Schema.Literal("move"),
        slots: ["body"]
      }).make({
        init: () => "a" as const,
        update: () => "b" as const,
        view: (h, room) =>
          h.el(
            "section",
            h.el("button").on("click", "move").children("move"),
            room === "a" ? h.slots.body : null
          )
      })
      const Keyed = Component.provide(Room, {
        key: (_, room) => room,
        layer: () => Layer.empty
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.keepAlive((s) =>
            h.el(
              "main",
              Keyed(h, { key: "r", slots: { body: Counter(s, { key: "c" }) } })
            )
          )
      })
      const root = yield* TestHost.mount(Page, {})
      click(root, "count:0")
      yield* TestHost.settle
      click(root, "move")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "move")
      assert.deepStrictEqual(lifecycle(root, "/Page/Counter[c]"), [
        "Mounted",
        "Kept"
      ])
    })))

  it.effect("shows the fallback of a child that failed as it mounted wherever it's drawn, until its predicate ends it", () =>
    provideHost(Effect.gen(function*() {
      const Fragile = Component.define({
        name: "Fragile",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: (): null => {
            throw new Error("boom")
          },
          update: ($) => $.model,
          view: (h) => h.el("p", "fine")
        })
      const Where = Schema.Literals(["slot", "direct", "gone"])
      const Page = Component.define({
        name: "Page",
        model: Where,
        message: Where
      }).make({
        init: () => "slot" as const,
        update: (_, where) => where,
        view: (h, where) =>
          h.keepAlive(({ model }) => model !== "gone", (s) => {
            const fragile = Fragile(s, {
              key: "f",
              fallback: () => h.el("p", "down")
            })
            return h.el(
              "main",
              where === "direct" ? fragile : null,
              where === "direct"
                ? null
                : Shut(h, { key: "o", slots: { body: fragile } })
            )
          })
      })
      const root = yield* TestHost.mount(Page, {})
      const texts: Array<string> = []
      for (
        const step of [
          "toggle",
          "toggle",
          "toggle",
          "direct",
          "slot",
          "toggle",
          "gone"
        ] as const
      ) {
        if (step === "toggle") click(root, "toggle")
        else root.send(step)
        yield* TestHost.settle
        texts.push(root.text())
      }
      assert.deepStrictEqual(texts, [
        "toggledown",
        "toggle",
        "toggledown",
        "down",
        "toggle",
        "toggledown",
        "toggle"
      ])
    })))

  it.effect("keeps a child drawn in a receiver whose own predicate ends it", () =>
    provideHost(Effect.gen(function*() {
      const Shown = Schema.Struct({
        box: Schema.Boolean,
        direct: Schema.Boolean
      })
      const Page = Component.define({
        name: "Page",
        model: Shown,
        message: Shown
      }).make({
        init: () => ({ box: true, direct: false }),
        update: (_, shown) => shown,
        view: (h, shown) =>
          h.el(
            "main",
            h.keepAlive(({ model }) => model.box, (s) =>
              shown.box
                ? Box(s, {
                  key: "x",
                  slots: {
                    body: shown.direct
                      ? null
                      : h.keepAlive((t) => Counter(t, { key: "c" }))
                  }
                })
                : null),
            shown.direct ? h.keepAlive((t) => Counter(t, { key: "c" })) : null
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

  it.effect("a child drawn in a kept receiver keeps its Model, and its mounts follow it out", () =>
    Effect.gen(function*() {
      const running = new Set<string>()
      const Tracked = Component.define({
        name: "Tracked",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) =>
            h.el("i").onMount(
              Mount.make("track", { args: {} }, () =>
                Effect.acquireRelease(
                  Effect.sync(() => running.add("t")),
                  () => Effect.sync(() => running.delete("t"))
                )
                  .pipe(Effect.andThen(Effect.never)))()
            )
        })
      const Page = Component.define({
        name: "Page",
        model: Schema.String,
        message: Schema.String
      })
        .make({
          init: () => "box",
          update: (_, where) => where,
          view: (h, where) =>
            h.keepAlive((s) =>
              h.el(
                "main",
                where === "box"
                  ? Box(s, {
                    key: "b",
                    slots: {
                      body: [Counter(s, { key: "c" }), Tracked(s, { key: "t" })]
                    }
                  })
                  : null,
                where === "page"
                  ? [Tracked(s, { key: "t" }), Counter(s, { key: "c" })]
                  : null
              )
            )
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "count:0")
      yield* TestHost.settle
      assert.deepStrictEqual(Array.from(running), ["t"])
      root.send("none")
      yield* TestHost.settle
      assert.deepStrictEqual(Array.from(running), [])
      root.send("page")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "count:1")
      assert.deepStrictEqual(Array.from(running), ["t"])
    }).pipe(
      Effect.provide(
        Renderer.layer({ ...TestHost.makeHost(), runsMounts: true })
      ),
      provideHost
    ))

  it.effect("shows the fallback of a drawn child that fails in its place", () =>
    provideHost(Effect.gen(function*() {
      const Boom = Command.make("Boom", { args: {} }, () => Effect.die("boom"))
      const FragileMsg = UiSchema.TaggedEnum({ Break: {} })
      const Fragile = Component.define({
        name: "Fragile",
        model: Schema.Null,
        message: FragileMsg
      }).make(
        {
          init: () => null,
          update: ($) => $.run(Boom.make()),
          view: (h) =>
            h.el("button").on("click", FragileMsg.Break()).children("fine")
        }
      )
      const Page = Component.define({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) =>
            h.el(
              "div",
              "before",
              h.keepAlive((s) =>
                Fragile(s, { key: "F", fallback: () => h.el("p", "failed") })
              ),
              "after"
            )
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "fine")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "beforefailedafter")
    })))
})

describe("keep-alive children that read shared state", () => {
  it.effect.each([true, false])(
    "read the owner above where they're drawn (an optional read: %s)",
    (optional) =>
      provideHost(Effect.gen(function*() {
        const Side = Component.define({
          name: "Side",
          props: Schema.Struct({ name: Schema.String }),
          model: Schema.String,
          message: Schema.Never,
          shares: { value: (name) => ({ name }) }
        }).make({
          init: ($) => $.props.name,
          update: ($) => $.model,
          parts: () => ({})
        })
        const Reader = Component.define({
          name: "Reader",
          model: Schema.Number,
          message: Schema.Literal("changed"),
          shared: {
            side: {
              owner: Side,
              optional: optional as true,
              onChange: () => "changed" as const
            }
          }
        }).make({
          init: () => 0,
          update: ($) => $.model + 1,
          view: (h, changes) =>
            h.el("p", (h.shared.side?.name ?? "none") + ":" + changes)
        })
        const Open = Component.define({
          name: "Open",
          model: Schema.Null,
          message: Schema.Never,
          slots: ["body"]
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.el("article", h.slots.body)
        })
        const Frame = Component.define({
          name: "Frame",
          model: Schema.Null,
          message: Schema.Never
        }).make(
          {
            init: () => null,
            update: ($) => $.model,
            view: (h) =>
              h.el(
                "section",
                Reader(h, { key: "r", fallback: () => h.el("p", "absent") })
              )
          }
        )
        const Page = Component.define({
          name: "Page",
          model: Schema.String,
          message: Schema.String
        })
          .make({
            init: () => "left",
            update: (_, where) => where,
            view: (h, where) =>
              h.keepAlive((s) =>
                h.el(
                  "main",
                  Side(h, {
                    key: "l",
                    props: { name: "left" },
                    view: () =>
                      h.el(
                        "div",
                        Open(h, {
                          key: "o",
                          slots: {
                            body: where === "inner"
                              ? Frame(s, { key: "f" })
                              : null
                          }
                        }),
                        where === "left" ? Frame(s, { key: "f" }) : null
                      )
                  }),
                  Side(h, {
                    key: "r",
                    props: { name: "right" },
                    view: () =>
                      h.el(
                        "div",
                        where === "right" ? Frame(s, { key: "f" }) : null
                      )
                  }),
                  where === "none" ? Frame(s, { key: "f" }) : null
                )
              )
          })
        const root = yield* TestHost.mount(Page, {})
        const texts: Array<string> = []
        for (
          const where of ["left", "right", "none", "left", "inner", "left"]
        ) {
          root.send(where)
          yield* TestHost.settle
          texts.push(root.text())
        }
        assert.deepStrictEqual(
          texts,
          optional
            ? ["left:0", "right:0", "none:0", "left:0", "left:0", "left:0"]
            : ["left:0", "right:0", "absent", "absent", "absent", "absent"]
        )
      }))
  )
})

const Nested = Component.define({
  name: "Nested",
  model: Schema.String,
  message: Schema.Literal("type")
})
  .make({
    init: () => "",
    update: ($) => $.model + "a",
    view: (h, draft) =>
      h.el("button").on("click", "type").children("nested:" + draft)
  })
const Holder = Component.define({
  name: "Holder",
  props: Schema.Struct({ bare: Schema.Boolean }),
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.el(
      "div",
      h.props.bare
        ? null
        : Nested(h, { key: "n", fallback: () => h.el("p", "down") })
    )
})

const FormPage = Component.define({
  name: "FormPage",
  props: Schema.Struct({
    hidden: Schema.Boolean,
    ended: Schema.Boolean,
    bare: Schema.Boolean
  }),
  model: Schema.Redacted(Schema.String),
  message: Schema.Never
}).make({
  init: () => Redacted.make(""),
  update: ($) => $.model,
  view: (h) =>
    h.el(
      "section",
      h.keepAlive(
        ({ props }) => !props.ended,
        (s) =>
          h.props.hidden
            ? null
            : [
              Draft(s, { key: "d" }),
              Holder(s, { key: "h", props: { bare: h.props.bare } })
            ]
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
const Aside = Component.define({
  name: "Aside",
  model: Schema.Boolean,
  message: Schema.Boolean
}).make({
  init: () => false,
  update: (_, hidden) => hidden,
  view: (h, hidden) =>
    h.el("aside", h.keepAlive((s) => hidden ? null : Draft(s, { key: "d" })))
})

const Shell = Component.define({
  name: "Shell",
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
  init: ($) => ({
    route: $.props.route,
    hidden: false,
    ended: false,
    bare: false,
    omitted: false
  }),
  update: ($, message) =>
    ShellMsg.match(message, {
      Changed: ({ route }) => ({ ...$.model, route }),
      Go: ({ route }) =>
        $.run(
          Router.push(TabsRoute, route).pipe(Command.map(() => ShellMsg.Done()))
        ),
      Done: () => $.model,
      Hide: ({ hidden }) => ({ ...$.model, hidden }),
      End: ({ ended }) => ({ ...$.model, ended }),
      Bare: ({ bare }) => ({ ...$.model, bare }),
      Omit: ({ omitted }) => ({ ...$.model, omitted })
    }),
  subscriptions: ({ model }) => [
    Router.subscription(
      TabsRoute,
      model.route,
      (route) => ShellMsg.Changed({ route })
    )
  ],
  view: (h, model) =>
    h.el(
      "div",
      h.el("button").on(
        "click",
        ShellMsg.Go({ route: TabsRoute.make({ _tag: "Home" }) })
      ).children("Home"),
      model.route._tag !== "Tabs"
        ? h.el("p", "home")
        : model.omitted
        ? model.hidden ? Aside(h, { key: "a" }) : null
        : FormPage(h, {
          key: "/tabs",
          props: { hidden: model.hidden, ended: model.ended, bare: model.bare }
        })
    )
})

type History = ReturnType<typeof Router.memoryHistory>

describe("keep-alive children across a router restore", () => {
  const routed = <A, E, R>(
    effect: (history: History) => Effect.Effect<A, E, R>
  ) => {
    const history = Router.memoryHistory("/tabs")
    return effect(history).pipe(
      Effect.provide(Router.make({ routes: TabsRoute, history })),
      Effect.provide(TestHost.layer())
    )
  }
  const hide = Effect.fnUntraced(
    function*(root: TestHost.TestRoot<any, any, any>, hidden: boolean) {
      root.send(ShellMsg.Hide({ hidden }))
      yield* TestHost.settle
    }
  )
  const away = Effect.fnUntraced(
    function*(root: TestHost.TestRoot<any, any, any>, history: History) {
      click(root, "Home")
      yield* TestHost.settle
      history.go(-1)
      yield* TestHost.settle
    }
  )

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
      effect.pipe(
        Effect.provide(Router.make({ routes: TabsRoute, history })),
        Effect.provide(TestHost.layer())
      )
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

  const twin = (stays: boolean) =>
    Component.define({
      name: "Twin",
      props: Schema.Struct({ route: TabsRoute }),
      model: Schema.Struct({ route: TabsRoute, hidden: Schema.Boolean }),
      message: ShellMsg
    }).make({
      init: ($) => ({ route: $.props.route, hidden: false }),
      update: ($, message) =>
        ShellMsg.match(message, {
          Changed: ({ route }) => ({ ...$.model, route }),
          Go: ({ route }) =>
            $.run(
              Router.push(TabsRoute, route).pipe(
                Command.map(() => ShellMsg.Done())
              )
            ),
          Hide: ({ hidden }) => ({ ...$.model, hidden }),
          Done: () => $.model,
          End: () => $.model,
          Bare: () => $.model,
          Omit: () => $.model
        }),
      subscriptions: ({ model }) => [
        Router.subscription(TabsRoute, model.route, (route) =>
          ShellMsg.Changed({ route }))
      ],
      view: (h, model) => {
        const page = (hidden: boolean) =>
          FormPage(h, {
            key: "/tabs",
            props: { hidden, ended: false, bare: true }
          })
        return h.el(
          "div",
          h.el("button").on(
            "click",
            ShellMsg.Go({ route: TabsRoute.make({ _tag: "Home" }) })
          ).children("Home"),
          stays
            ? model.hidden ? null : page(false)
            : model.route._tag === "Tabs"
            ? page(model.hidden)
            : h.el("aside", page(false))
        )
      }
    })

  it.effect("keeps a draft a Back restores when the page it leaves has one at the same path", () =>
    routed((history) =>
      Effect.gen(function*() {
        const root = yield* TestHost.mount(twin(false), Router.props(TabsRoute))
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

  it.effect("drops a draft a Back restores once the page that stayed through it is removed", () =>
    routed((history) =>
      Effect.gen(function*() {
        const root = yield* TestHost.mount(twin(true), Router.props(TabsRoute))
        yield* TestHost.settle
        click(root, "draft:")
        yield* TestHost.settle
        yield* away(root, history)
        assert.strictEqual(root.text(), "Homedraft:a")
        yield* hide(root, true)
        yield* hide(root, false)
        assert.strictEqual(root.text(), "Homedraft:")
      })
    ))
})

describe("keep-alive children whose state encodes after the push that left them", () => {
  let gate: Promise<void> | undefined = Promise.resolve()
  const Slow = Schema.String.pipe(Schema.decode({
    decode: SchemaGetter.passthrough(),
    encode: SchemaGetter.transformEffect((text: string) => {
      const held = gate
      return held === undefined
        ? Effect.succeed(text)
        : Effect.promise(() => held.then(() => text))
    })
  }))
  const macrotask = Effect.promise(() =>
    new Promise<void>((resolve) => setTimeout(resolve, 0))
  )
  const note = (name: string, model: Schema.Codec<string, string>) =>
    Component.define({
      name,
      props: Schema.Struct({ label: Schema.String }),
      model,
      message: Schema.Null
    })
      .make({
        init: () => "new",
        update: ($) => $.model + "!",
        view: (h, text) =>
          h.el("button").on("click", null).children(`${h.props.label}:${text} `)
      })
  const SlowNote = note("SlowNote", Slow)
  const Note = note("Note", Schema.String)
  const Notes = Component.define({
    name: "Notes",
    props: Schema.Struct({ hidden: Schema.Boolean, sibling: Schema.Boolean }),
    model: Schema.Null,
    message: Schema.Never
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) =>
      h.el(
        "section",
        h.keepAlive((s) => {
          const first = SlowNote(s, { key: "a", props: { label: "a" } })
          const second = SlowNote(s, { key: "b", props: { label: "b" } })
          const sibling = h.props.sibling
            ? Note(s, { key: "c", props: { label: "c" } })
            : null
          return [first, h.props.hidden ? null : second, sibling]
        })
      )
  })
  const Routes = Route.union({
    Notes: Route.make("/", { search: { q: Schema.optional(Schema.String) } }),
    Away: Route.make("/away")
  })
  const Message = UiSchema.TaggedEnum({
    Changed: { route: Routes },
    Go: {},
    Query: {},
    Done: {},
    Show: { hidden: Schema.Boolean, bare: Schema.Boolean }
  })
  const app = (sibling: boolean) =>
    Component.define({
      name: "NotesApp",
      props: Schema.Struct({ route: Routes }),
      model: Schema.Struct({
        route: Routes,
        hidden: Schema.Boolean,
        bare: Schema.Boolean
      }),
      message: Message
    }).make({
      init: ($) => ({ route: $.props.route, hidden: false, bare: false }),
      update: ($, message) =>
        Message.match(message, {
          Changed: ({ route }) => ({ ...$.model, route }),
          Go: () =>
            $.run(
              Router.push(Routes, Routes.Away()).pipe(
                Command.map(() => Message.Done())
              )
            ),
          Query: () =>
            $.run(
              Router.push(Routes, Routes.Notes({ search: { q: "q" } })).pipe(
                Command.map(() => Message.Done())
              )
            ),
          Done: () => $.model,
          Show: ({ bare, hidden }) => ({ ...$.model, bare, hidden })
        }),
      subscriptions: (
        { model }
      ) => [Router.subscription(Routes, model.route, (route) =>
        Message.Changed({ route }))],
      view: (h, model) =>
        h.el(
          "div",
          h.el("a").on("click", Message.Go()).children("Away "),
          model.route._tag !== "Notes" || model.bare
            ? null
            : Notes(h, {
              key: "notes",
              props: { hidden: model.hidden, sibling }
            })
        )
    })
  const visits = (sibling: boolean) => {
    const App = app(sibling)
    const memory = Router.memoryHistory("/")
    const history: Router.History = {
      ...memory,
      push: (url, state) => memory.push(url, structuredClone(state)),
      replace: (url, state) => memory.replace(url, structuredClone(state))
    }
    const visit = Effect.fnUntraced(
      function*<A, E, R>(
        effect: (
          root: TestHost.TestRoot<any, any, any>
        ) => Effect.Effect<A, E, R>
      ) {
        const root = yield* TestHost.mount(App, Router.props(Routes))
        yield* TestHost.settle
        return yield* effect(root)
      },
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history })),
      Effect.provide(TestHost.layer())
    )
    const show = Effect.fnUntraced(function*(
      root: TestHost.TestRoot<any, any, any>,
      shown: { readonly hidden: boolean; readonly bare: boolean }
    ) {
      root.send(Message.Show(shown))
      yield* TestHost.settle
    })
    const push = Effect.fnUntraced(
      function*(root: TestHost.TestRoot<any, any, any>) {
        click(root, "Away")
        yield* TestHost.settle
        yield* macrotask
        yield* TestHost.settle
      }
    )
    const go = Effect.fnUntraced(function*(delta: number) {
      history.go(delta)
      yield* TestHost.settle
    })
    const query = Effect.fnUntraced(
      function*(root: TestHost.TestRoot<any, any, any>) {
        root.send(Message.Query())
        yield* TestHost.settle
      }
    )
    const type = Effect.fnUntraced(
      function*(root: TestHost.TestRoot<any, any, any>, was: string) {
        click(root, `a:${was}`)
        click(root, `b:${was}`)
        yield* show(root, { hidden: true, bare: false })
      }
    )
    const later = Effect.fnUntraced(
      function*(root: TestHost.TestRoot<any, any, any>) {
        let open!: () => void
        gate = new Promise((resolve) => open = resolve)
        click(root, "Away")
        yield* TestHost.settle
        open()
        yield* macrotask
        yield* TestHost.settle
      }
    )
    const edit = Effect.fnUntraced(
      function*(root: TestHost.TestRoot<any, any, any>) {
        yield* type(root, "new")
        yield* later(root)
      }
    )
    return { visit, show, push, go, edit, query, type, later }
  }

  it.effect("start fresh after a reload, when a sibling's state was written into the entry", () => {
    const { edit, go, visit } = visits(true)
    return Effect.gen(function*() {
      yield* visit(Effect.fnUntraced(function*(root) {
        click(root, "c:new")
        yield* edit(root)
      }))
      yield* visit(Effect.fnUntraced(function*(root) {
        yield* go(-1)
        assert.strictEqual(root.text(), "Away a:new b:new c:new! ")
      }))
    })
  })

  it.effect("start fresh after a reload, when edited again after a Back and left before that encodes", () => {
    const { go, later, query, show, type, visit } = visits(false)
    return Effect.gen(function*() {
      gate = undefined
      yield* visit(Effect.fnUntraced(function*(root) {
        yield* type(root, "new")
        yield* query(root)
        yield* go(-1)
        yield* show(root, { hidden: false, bare: false })
        yield* type(root, "new!")
        yield* later(root)
      }))
      yield* visit(Effect.fnUntraced(function*(root) {
        yield* go(-1)
        assert.strictEqual(root.text(), "Away a:new b:new ")
      }))
    })
  })

  it.effect("start fresh in an entry that never drew them, after a Back from one that did", () => {
    const { go, push, query, show, type, visit } = visits(false)
    gate = undefined
    return visit(Effect.fnUntraced(function*(root) {
      yield* show(root, { hidden: false, bare: true })
      yield* query(root)
      yield* show(root, { hidden: false, bare: false })
      yield* type(root, "new")
      yield* push(root)
      yield* show(root, { hidden: false, bare: true })
      yield* go(-1)
      yield* go(-1)
      yield* show(root, { hidden: false, bare: false })
      assert.strictEqual(root.text(), "Away a:new b:new ")
    }))
  })
})

describe("keep-alive children written into closed slots", () => {
  it.effect("run no mounts and report nothing while the slot is closed", () =>
    Effect.gen(function*() {
      const running = new Set<string>()
      const GroupMsg = UiSchema.TaggedEnum({
        Counted: { count: Schema.Number }
      })
      const Group = Component.define({
        name: "Group",
        model: Schema.Number,
        message: GroupMsg,
        shares: {
          value: (count) => ({ count }),
          collects: {
            schema: Schema.Boolean,
            onChange: (reports) => GroupMsg.Counted({ count: reports.length })
          }
        }
      }).make({
        init: () => 0,
        update: (_, { count }) => count,
        parts: (_, count) => ({ count })
      })
      const Member = Component.define({
        name: "Member",
        model: Schema.Null,
        message: Schema.Never,
        shared: { group: { owner: Group, optional: true, report: () => true } }
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.el("i").onMount(
            Mount.make("track", { args: {} }, () =>
              Effect.acquireRelease(
                Effect.sync(() => running.add("m")),
                () => Effect.sync(() => running.delete("m"))
              )
                .pipe(Effect.andThen(Effect.never)))()
          )
      })
      const App = Component.define({
        name: "App",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.keepAlive((s) =>
            Group(h, {
              key: "g",
              view: (parts) =>
                h.el(
                  "div",
                  h.el("p", "n" + parts.count),
                  Shut(h, {
                    key: "c",
                    slots: { body: Member(s, { key: "m" }) }
                  })
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
      Effect.provide(
        Renderer.layer({ ...TestHost.makeHost(), runsMounts: true })
      ),
      provideHost
    ))

  it.effect("start when a slot first places them", () =>
    provideHost(Effect.gen(function*() {
      let inits = 0
      const Late = Component.define({
        name: "Late",
        model: Schema.Number,
        message: CounterMsg
      }).make({
        init: () => {
          inits++
          return 0
        },
        update: ($) => $.model + 1,
        view: (h, count) => h.el("b", "count:" + count)
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) =>
            h.keepAlive((s) =>
              h.el(
                "main",
                Billing(s, { key: "b" }),
                Shut(h, { key: "c", slots: { body: Late(s, { key: "L" }) } })
              )
            )
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(inits, 0)
      click(root, "toggle")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "billingtogglecount:0")
    })))

  it.effect("keep the props and onEmit of the last render that placed them", () =>
    provideHost(Effect.gen(function*() {
      const LabelMsg = UiSchema.TaggedEnum({ Tell: {} })
      const Label = Component.define({
        name: "Label",
        props: Schema.Struct({ n: Schema.Number }),
        model: Schema.Null,
        message: LabelMsg,
        events: Schema.Number
      }).make({
        init: () => null,
        update: ($) => $.emit($.props.n),
        view: (h) =>
          h.el("button").on("click", LabelMsg.Tell()).children("n:" + h.props.n)
      })
      const PageMsg = UiSchema.TaggedEnum({
        Inc: {},
        Told: { text: Schema.String }
      })
      const Model = Schema.Struct({ n: Schema.Number, told: Schema.String })
      const Page = Component.define({
        name: "Page",
        model: Model,
        message: PageMsg
      }).make({
        init: () => ({ n: 0, told: "" }),
        update: ($, message) =>
          PageMsg.match(message, {
            Inc: () => ({ ...$.model, n: $.model.n + 1 }),
            Told: ({ text }) => ({ ...$.model, told: text })
          }),
        view: (h, { n, told }) =>
          h.keepAlive((s) =>
            h.el(
              "main",
              told,
              Shut(h, {
                key: "c",
                slots: {
                  body: Label(s, {
                    key: "L",
                    props: { n },
                    onEmit: (from) => PageMsg.Told({ text: from + "@" + n })
                  })
                }
              })
            )
          )
      })
      const root = yield* TestHost.mount(Page, {})
      const texts: Array<string> = []
      const settled = TestHost.settle.pipe(
        Effect.andThen(Effect.sync(() => texts.push(root.text())))
      )
      click(root, "toggle")
      yield* settled
      const label = root.get(Locator.text("n:0", { exact: true }))
      click(root, "toggle")
      yield* settled
      root.send(PageMsg.Inc())
      yield* settled
      Locator.fire(label, "click")
      yield* settled
      click(root, "toggle")
      yield* settled
      click(root, "n:1")
      yield* settled
      assert.deepStrictEqual(texts, [
        "togglen:0",
        "toggle",
        "toggle",
        "0@0toggle",
        "0@0togglen:1",
        "1@1togglen:1"
      ])
    })))

  it.effect("a receiver that redraws an old write leaves the child where the author wrote it last", () =>
    provideHost(Effect.gen(function*() {
      const ToggleMsg = UiSchema.TaggedEnum({ Toggle: {} })
      const Toggling = Component.define({
        name: "Toggling",
        model: Schema.Boolean,
        message: ToggleMsg,
        slots: ["body"]
      }).make({
        init: () => true,
        update: ($) => !$.model,
        view: (h, open) =>
          h.el(
            "section",
            h.el("button").on("click", ToggleMsg.Toggle()).children("flip"),
            open ? h.slots.body : null
          )
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Boolean,
        message: Schema.Literal("move")
      }).make({
        init: () => false,
        update: () => true,
        view: (h, moved) =>
          h.keepAlive((s) =>
            h.el(
              "main",
              moved
                ? null
                : Toggling(s, {
                  key: "B",
                  slots: { body: Counter(s, { key: "c" }) }
                }),
              moved ? Counter(s, { key: "c" }) : null
            )
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      click(root, "count:0")
      yield* TestHost.settle
      const flip = root.get(Locator.text("flip", { exact: true }))
      root.send("move")
      yield* TestHost.settle
      Locator.fire(flip, "click")
      yield* TestHost.settle
      Locator.fire(flip, "click")
      yield* TestHost.settle
      assert.lengthOf(
        root.log().filter((entry) =>
          entry._tag === "Update" && entry.path === "/Page/Toggling[B]"
        ),
        2
      )
      assert.strictEqual(root.text(), "count:1")
    })))

  it.effect("keeps a child whose headless writer is replaced by another that writes it", () =>
    provideHost(Effect.gen(function*() {
      const Row = Component.define({
        name: "Row",
        model: Schema.Number,
        message: Schema.Literal("inc"),
        elements: Html
      }).make({
        init: () => 0,
        update: ($) => $.model + 1,
        view: (h, count) => h.button.onClick("inc").children("count:" + count)
      })
      const Writer = Component.define({
        name: "Writer",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({ init: () => null, update: ($) => $.model, parts: () => ({}) })
      const Switch = Component.define({
        name: "Switch",
        model: Schema.Literals(["a", "b"]),
        message: Schema.Literal("flip"),
        elements: Html
      }).make({
        init: () => "a" as const,
        update: ($) => $.model === "a" ? "b" : "a",
        parts: (p, which) => ({
          which,
          flip: p.part("button", (b) => b.onClick("flip"))
        })
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.keepAlive((s) =>
            Switch(h, {
              key: "s",
              view: (parts) =>
                h.div(
                  parts.flip(h.button.children("flip")),
                  Writer(h, {
                    key: parts.which,
                    view: () => Row(s, { key: "r" })
                  })
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

  it.effect("a receiver that redraws an old write doesn't start a child that ended while its author left it out", () =>
    provideHost(Effect.gen(function*() {
      let starts = 0
      const Probe = Component.define({
        name: "Probe",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => {
            starts++
            return null
          },
          update: ($) => $.model,
          view: (h) => h.el("i", "probe")
        })
      const ToggleMsg = UiSchema.TaggedEnum({ Toggle: {} })
      const Toggling = Component.define({
        name: "Toggling",
        model: Schema.Boolean,
        message: ToggleMsg,
        slots: ["body"]
      }).make({
        init: () => true,
        update: ($) => !$.model,
        view: (h, open) =>
          h.el(
            "section",
            h.el("button").on("click", ToggleMsg.Toggle()).children("flip"),
            open ? h.slots.body : null
          )
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Literals(["box", "page", "ended"]),
        message: Schema.Literals(["page", "end"])
      }).make({
        init: () => "box" as const,
        update: (_, message) => message === "end" ? "ended" : "page",
        view: (h, mode) =>
          h.el(
            "main",
            h.keepAlive((s) =>
              mode === "box"
                ? Toggling(s, {
                  key: "B",
                  slots: { body: Probe(s, { key: "p" }) }
                })
                : null
            ),
            h.keepAlive(({ model }) => model !== "ended", (s) =>
              mode === "page" ? Probe(s, { key: "p" }) : null)
          )
      })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      const flip = root.get(Locator.text("flip", { exact: true }))
      for (const message of ["page", "end"] as const) {
        root.send(message)
        yield* TestHost.settle
      }
      Locator.fire(flip, "click")
      yield* TestHost.settle
      Locator.fire(flip, "click")
      yield* TestHost.settle
      assert.lengthOf(
        root.log().filter((entry) =>
          entry._tag === "Update" && entry.path === "/Page/Toggling[B]"
        ),
        2
      )
      assert.strictEqual(starts, 1)
    })))

  it.effect("fails the author that writes two components of one name and key", () =>
    provideHost(Effect.gen(function*() {
      const define = () =>
        Component.define({
          name: "Row",
          model: Schema.Null,
          message: Schema.Never
        })
          .make({
            init: () => null,
            update: ($) => $.model,
            view: (h) => h.el("p", "row")
          })
      const [First, Second] = [define(), define()]
      const Open = Component.define({
        name: "Open",
        model: Schema.Null,
        message: Schema.Never,
        slots: ["body"]
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.el("article", h.slots.body)
      })
      const Inner = Component.define({
        name: "Inner",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) =>
            h.keepAlive((s) =>
              h.el(
                "div",
                h.el("p", First(s, { key: "k" })),
                Open(h, { key: "o", slots: { body: Second(s, { key: "k" }) } })
              )
            )
        })
      const root = yield* TestHost.mount(host(Inner), {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "down")
      assert.include(Cause.pretty(failureOf(root)!.cause), "Row[k]")
    })))

  it.effect.each(
    [
      "its own view",
      "the same view",
      "a slot after it",
      "a slot before it",
      "the author's view beside its slot"
    ] as const
  )(
    "an ordinary child and a keep-alive one of the same name and key, the keep-alive one in %s",
    (where) =>
      provideHost(Effect.gen(function*() {
        const Kept = Component.define({
          name: "Row",
          model: Schema.Null,
          message: Schema.Never
        })
          .make({
            init: () => null,
            update: ($) => $.model,
            view: (h) => h.el("p", "kept")
          })
        const Plain = Component.define({
          name: "Row",
          model: Schema.Null,
          message: Schema.Never,
          slots: ["body"]
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.el("p", "plain", h.slots.body)
        })
        const Headless = Component.define({
          name: "Row",
          model: Schema.Null,
          message: Schema.Never
        })
          .make({ init: () => null, update: ($) => $.model, parts: () => ({}) })
        const Inner = Component.define({
          name: "Inner",
          model: Schema.Null,
          message: Schema.Never
        })
          .make({
            init: () => null,
            update: ($) => $.model,
            view: (h) =>
              h.keepAlive((s) => {
                const kept = Kept(s, { key: "k" })
                const slot = () => Plain(h, { key: "o", slots: { body: kept } })
                return where === "its own view"
                  ? Headless(h, { key: "k", view: () => kept })
                  : where === "the same view"
                  ? h.el("div", Plain(h, { key: "k" }), Plain(s, { key: "k" }))
                  : where === "a slot after it"
                  ? h.el("div", Plain(h, { key: "k" }), slot())
                  : where === "a slot before it"
                  ? h.el("div", slot(), Plain(h, { key: "k" }))
                  : h.el(
                    "div",
                    Plain(h, {
                      key: "o",
                      slots: { body: Plain(h, { key: "k" }) }
                    }),
                    kept
                  )
              })
          })
        const root = yield* TestHost.mount(host(Inner), {})
        yield* TestHost.settle
        if (where === "the author's view beside its slot") {
          return assert.strictEqual(root.text(), "plainplainkept")
        }
        assert.strictEqual(root.text(), "down")
        assert.include(Cause.pretty(failureOf(root)!.cause), "Row[k]")
      }))
  )

  it.effect("keeps a component written with s, and unmounts it written with h, and a headless one either way", () =>
    provideHost(Effect.gen(function*() {
      const Row = Component.define({
        name: "Row",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.el("p", "row")
        })
      const Box = Component.define({
        name: "Box",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({ init: () => null, update: ($) => $.model, parts: () => ({}) })
      const App = Component.define({
        name: "App",
        model: Schema.Boolean,
        message: Schema.Boolean
      })
        .make({
          init: () => true,
          update: (_, shown) => shown,
          view: (h, shown) =>
            h.keepAlive((s) =>
              h.el(
                "div",
                shown && [
                  Row(s, { key: "s" }),
                  Row(h, { key: "h" }),
                  Box(s, { key: "b", view: () => h.el("p", "box") })
                ]
              )
            )
        })
      const root = yield* TestHost.mount(App, {})
      root.send(false)
      yield* TestHost.settle
      root.send(true)
      yield* TestHost.settle
      assert.deepStrictEqual(
        ["/App/Row[s]", "/App/Row[h]", "/App/Box[b]"].map((path) =>
          lifecycle(root, path)
        ),
        [
          ["Mounted", "Kept", "Drawn"],
          ["Mounted", "Unmounted", "Mounted"],
          ["Mounted", "Unmounted", "Mounted"]
        ]
      )
    })))

  it.effect("keeps a child once its call changes from h to s, and unmounts it once it changes back", () =>
    provideHost(Effect.gen(function*() {
      let made = 0
      const Row = Component.define({
        name: "Row",
        model: Schema.Number,
        message: Schema.Never
      })
        .make({
          init: () => ++made,
          update: ($) => $.model,
          view: (h, n) => h.el("p", `row${n}`)
        })
      const Msg = UiSchema.TaggedEnum({
        Kept: { kept: Schema.Boolean },
        Shown: { shown: Schema.Boolean }
      })
      const App = Component.define({
        name: "App",
        model: Schema.Struct({ kept: Schema.Boolean, shown: Schema.Boolean }),
        message: Msg
      })
        .make({
          init: () => ({ kept: false, shown: true }),
          update: ($, message) => ({ ...$.model, ...message }),
          view: (h, { kept, shown }) =>
            h.keepAlive((s) =>
              h.el(
                "div",
                !shown
                  ? null
                  : kept
                  ? Row(s, { key: "r" })
                  : Row(h, { key: "r" })
              )
            )
        })
      const root = yield* TestHost.mount(App, {})
      const show = Effect.fnUntraced(function*(message: typeof Msg.Type) {
        root.send(message)
        yield* TestHost.settle
        return root.text()
      })
      assert.deepStrictEqual([
        yield* show(Msg.Kept({ kept: true })),
        yield* show(Msg.Shown({ shown: false })),
        yield* show(Msg.Shown({ shown: true })),
        yield* show(Msg.Kept({ kept: false })),
        yield* show(Msg.Shown({ shown: false })),
        yield* show(Msg.Shown({ shown: true }))
      ], ["row1", "", "row1", "row1", "", "row2"])
    })))

  it.effect("a keep-alive child takes the path of an ordinary one of its name and key that the same render ends", () =>
    provideHost(Effect.gen(function*() {
      const Kept = Component.define({
        name: "Row",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.el("p", "kept")
        })
      const Plain = Component.define({
        name: "Row",
        model: Schema.Null,
        message: Schema.Never,
        slots: ["body"]
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.el("p", "plain", h.slots.body)
      })
      const Inner = Component.define({
        name: "Inner",
        model: Schema.Boolean,
        message: Schema.Literal("swap")
      }).make({
        init: () => false,
        update: () => true,
        view: (h, swapped) =>
          h.keepAlive((s) =>
            h.el(
              "div",
              h.el("button").on("click", "swap").children("swap"),
              swapped
                ? Plain(h, { key: "o", slots: { body: Kept(s, { key: "k" }) } })
                : null,
              swapped ? null : Plain(h, { key: "k" })
            )
          )
      })
      const root = yield* TestHost.mount(host(Inner), {})
      click(root, "swap")
      yield* TestHost.settle
      assert.strictEqual(root.text(), "swapplainkept")
    })))

  it.effect("draws a child its author returns again without writing it again", () =>
    provideHost(Effect.gen(function*() {
      let cached: View.Child<any, any> | undefined
      const Page = Component.define({
        name: "Page",
        model: Schema.Number,
        message: Schema.Null
      })
        .make({
          init: () => 0,
          update: ($) => $.model + 1,
          view: (h) =>
            h.keepAlive((s) => h.el("div", cached ??= Billing(s, { key: "b" })))
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      root.send(null)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "billing")
    })))

  it.effect("draws a child a failed child's fallback writes", () =>
    provideHost(Effect.gen(function*() {
      const Broken = Component.define({
        name: "Broken",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: () => {
            throw new Error("broken")
          }
        })
      const Page = Component.define({
        name: "Page",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) =>
            h.keepAlive((s) =>
              h.el(
                "div",
                h.el("p", "before"),
                Broken(h, {
                  key: "x",
                  fallback: () => Billing(s, { key: "b" })
                }),
                h.el("p", "after")
              )
            )
        })
      const root = yield* TestHost.mount(Page, {})
      yield* TestHost.settle
      assert.strictEqual(root.text(), "beforebillingafter")
    })))

  it("a Scene fails the author that writes two components of one name and key, in two slots", () => {
    const define = () =>
      Component.define({
        name: "Row",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.el("p", "row")
        })
    const [First, Second] = [define(), define()]
    const Page = Component.define({
      name: "Page",
      model: Schema.Null,
      message: Schema.Never
    })
      .make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.keepAlive((s) =>
            h.el(
              "div",
              Shut(h, { key: "x", slots: { body: First(s, { key: "k" }) } }),
              Shut(h, { key: "y", slots: { body: Second(s, { key: "k" }) } })
            )
          )
      })
    assert.throws(
      () => Scene.start(Page, {}).view,
      /\/Page writes Row\[k\] twice in one render/
    )
  })
})

describe("keep-alive children that report to shared state", () => {
  it.effect("move their report to the owner above where they're drawn", () =>
    provideHost(Effect.gen(function*() {
      const CountMsg = UiSchema.TaggedEnum({
        Counted: { count: Schema.Number }
      })
      const Count = Component.define({
        name: "Count",
        model: Schema.Number,
        message: CountMsg,
        shares: {
          value: (count) => ({ count }),
          collects: {
            schema: Schema.Boolean,
            onChange: (reports) => CountMsg.Counted({ count: reports.length })
          }
        }
      }).make({
        init: () => 0,
        update: (_, { count }) => count,
        parts: (_, count) => ({ count })
      })
      const Member = Component.define({
        name: "Member",
        model: Schema.Null,
        message: Schema.Never,
        shared: { count: { owner: Count, optional: true, report: () => true } }
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.el("i")
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Boolean,
        message: Schema.Boolean
      })
        .make({
          init: () => true,
          update: (_, left) => left,
          view: (h, left) =>
            h.keepAlive((s) =>
              h.el(
                "main",
                Count(h, {
                  key: "l",
                  view: (parts) =>
                    h.el(
                      "p",
                      "L" + parts.count,
                      left ? Member(s, { key: "m" }) : null
                    )
                }),
                Count(h, {
                  key: "r",
                  view: (parts) =>
                    h.el(
                      "p",
                      "R" + parts.count,
                      left ? null : Member(s, { key: "m" })
                    )
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
