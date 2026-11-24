import { Component, type MessageLog, UiSchema } from "@effect/ui"
import { HtmlServer } from "@effect/ui/html"
import { Locator, Scene, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Layer, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"

const PageEvents = UiSchema.TaggedEnum({ Saved: { title: Schema.String } })

const Page = Component.define({
  name: "Page",
  props: Schema.Struct({ title: Schema.String }),
  model: Schema.Null,
  message: Schema.Never,
  events: PageEvents
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.text(`page:${h.props.title}`)
})

const AppMessage = UiSchema.TaggedEnum({
  Toggled: {},
  Saved: { title: Schema.String }
})

const makeApp = (
  LazyPage: Component.Lazy<{ readonly title: string }, typeof PageEvents.Type>
) =>
  Component.define({
    name: "App",
    model: Schema.Struct({ open: Schema.Boolean, saved: Schema.String }),
    message: AppMessage
  }).make({
    init: () => ({ open: true, saved: "" }),
    update: ($, message) =>
      AppMessage.match(message, {
        Toggled: () => ({ ...$.model, open: !$.model.open }),
        Saved: ({ title }) => ({ ...$.model, saved: title })
      }),
    view: (h, model) =>
      h.el(
        "p",
        `app${model.saved}:`,
        model.open
          ? LazyPage(h, {
            props: { title: "a" },
            onEmit: { Saved: ({ title }) => AppMessage.Saved({ title }) },
            fallback: (result) =>
              h.text(AsyncResult.isFailure(result) ? "failed" : "loading")
          })
          : ""
      )
  })

const lifecycle = (
  root: { readonly log: () => ReadonlyArray<MessageLog.Entry> },
  path: string
) =>
  root.log().flatMap((entry) =>
    "path" in entry && entry.path === path && entry._tag !== "Update"
      ? [entry._tag]
      : []
  )

const later = <A>(value: A) =>
  new Promise<A>((resolve) => setTimeout(() => resolve(value), 10))

const provideHost = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.scoped, Effect.provide(TestHost.layer()))

describe("Component.lazy", () => {
  it.effect("shows the fallback until the module loads, which settle waits for, and loads it once", () =>
    provideHost(Effect.gen(function*() {
      let loads = 0
      const LazyPage = Component.lazy("LazyPage", () => {
        loads++
        return later(Page)
      })
      const App = makeApp(LazyPage)
      const root = yield* TestHost.mount(App, {})
      assert.deepStrictEqual(root.pending(), [{
        _tag: "Load",
        path: "/App/LazyPage[]",
        name: "LazyPage"
      }])
      yield* TestHost.settle
      root.send(AppMessage.Toggled())
      yield* TestHost.settle
      root.send(AppMessage.Toggled())
      yield* TestHost.settle
      assert.deepStrictEqual(root.frames(), [
        "app:loading",
        "app:page:a",
        "app:",
        "app:page:a"
      ])
      const again = yield* TestHost.mount(App, {})
      assert.strictEqual(again.text(), "app:page:a")
      assert.strictEqual(loads, 1)
    })))

  it.effect("shows the fallback's Failure branch when the load fails, and a retry shows the component in every slot", () =>
    provideHost(Effect.gen(function*() {
      let loads = 0
      const LazyPage = Component.lazy("LazyPage", (): Promise<typeof Page> => {
        loads++
        if (loads === 1) return Promise.reject(new Error("offline"))
        if (loads === 2) throw new Error("no import")
        if (loads === 3) return Promise.resolve({ Page } as any)
        return later(Page)
      })
      const root = yield* TestHost.mount(makeApp(LazyPage), {})
      const sibling = yield* TestHost.mount(makeApp(LazyPage), {})
      for (let i = 0; i < 3; i++) {
        yield* TestHost.settle
        assert.strictEqual(root.text(), "app:failed")
        root.send(AppMessage.Toggled())
        yield* TestHost.settle
        root.send(AppMessage.Toggled())
      }
      yield* TestHost.settle
      assert.strictEqual(root.text(), "app:page:a")
      assert.strictEqual(sibling.text(), "app:page:a")
      assert.strictEqual(loads, 4)
    })))

  it.effect("stops waiting for a load once its slot is removed", () =>
    provideHost(Effect.gen(function*() {
      const root = yield* TestHost.mount(
        makeApp(
          Component.lazy("LazyPage", () => new Promise<typeof Page>(() => {}))
        ),
        {}
      )
      root.send(AppMessage.Toggled())
      yield* TestHost.settle
      assert.deepStrictEqual(root.pending(), [])
    })))

  it.effect("keeps a lazy child written with s, and closes its Scope when the predicate ends it", () =>
    provideHost(Effect.gen(function*() {
      let closed = 0
      const DraftMessage = UiSchema.TaggedEnum({ Typed: {} })
      const Draft = Component.define({
        name: "Draft",
        model: Schema.Number,
        message: DraftMessage
      }).make(
        {
          init: () => 0,
          update: ($) => $.model + 1,
          view: (h, count) =>
            h.el("button").on("click", DraftMessage.Typed()).children(
              `draft:${count}`
            )
        }
      ).pipe(
        Component.provide(
          Layer.effectDiscard(
            Effect.addFinalizer(() => Effect.sync(() => closed++))
          )
        )
      )
      const LazyDraft = Component.lazy("LazyDraft", () => later(Draft))
      const HostMessage = UiSchema.TaggedEnum({ Toggled: {}, Ended: {} })
      const Host = Component.define({
        name: "Host",
        model: Schema.Struct({ open: Schema.Boolean, alive: Schema.Boolean }),
        message: HostMessage
      }).make({
        init: () => ({ open: true, alive: true }),
        update: ($, message) =>
          HostMessage.match(message, {
            Toggled: () => ({ ...$.model, open: !$.model.open }),
            Ended: () => ({ ...$.model, alive: false })
          }),
        view: (h, model) =>
          h.el(
            "main",
            h.keepAlive(({ model }) => model.alive, (s) =>
              model.open
                ? LazyDraft(s, {
                  key: "d",
                  fallback: () => h.text("loading")
                })
                : null)
          )
      })
      const root = yield* TestHost.mount(Host, {})
      assert.strictEqual(root.text(), "loading")
      yield* TestHost.settle
      Locator.fire(root.get(Locator.text("draft:0")), "click")
      yield* TestHost.settle
      root.send(HostMessage.Toggled())
      yield* TestHost.settle
      assert.strictEqual(root.text(), "")
      root.send(HostMessage.Toggled())
      yield* TestHost.settle
      assert.strictEqual(root.text(), "draft:1")
      assert.strictEqual(closed, 0)
      root.send(HostMessage.Ended())
      yield* TestHost.settle
      assert.strictEqual(closed, 1)
    })))

  it.effect.each(
    [
      "placed directly",
      "in a slot its receiver opens and closes"
    ] as const
  )(
    "keeps a lazy child written with s from its first placement, with its fallback, while its module loads: %s",
    (placement) =>
      provideHost(Effect.gen(function*() {
        let spun = 0
        const Spinner = Component.define({
          name: "Spinner",
          model: Schema.Number,
          message: Schema.Never
        }).make({
          init: () => ++spun,
          update: ($) => $.model,
          view: (h, n) => h.text(`loading${n}`)
        })
        let load!: () => void
        const LazyPage = Component.lazy(
          "LazyPage",
          () =>
            new Promise<typeof Page>((resolve) => load = () => resolve(Page))
        )
        const Panel = Component.define({
          name: "Panel",
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
        const Host = Component.define({
          name: "Host",
          model: Schema.Boolean,
          message: Schema.Boolean
        }).make({
          init: () => true,
          update: (_, open) => open,
          view: (h, open) =>
            h.keepAlive((s) => {
              const page = LazyPage(s, {
                key: "p",
                props: { title: "a" },
                fallback: () => Spinner(h, {})
              })
              return placement === "placed directly"
                ? h.el("main", open ? page : null)
                : Panel(h, { slots: { body: page } })
            })
        })
        const drain = TestHost.TestHost.useSync((host) =>
          host.drain(host.budget)
        )
        const root = yield* TestHost.mount(Host, {})
        const direct = placement === "placed directly"
        const shown = direct ? "" : "toggle"
        const setOpen = (open: boolean) =>
          direct
            ? Effect.sync(() => root.send(open))
            : Effect.sync(() =>
              Locator.fire(root.get(Locator.text("toggle")), "click")
            )
        if (!direct) {
          assert.strictEqual(root.text(), shown)
          yield* setOpen(true)
          yield* drain
        }
        assert.strictEqual(root.text(), `${shown}loading1`)
        yield* setOpen(false)
        yield* drain
        assert.strictEqual(root.text(), shown)
        assert.lengthOf(root.pending(), 1)
        yield* setOpen(true)
        yield* drain
        assert.strictEqual(root.text(), `${shown}loading1`)
        yield* setOpen(false)
        yield* drain
        load()
        yield* TestHost.settle
        yield* setOpen(true)
        yield* TestHost.settle
        assert.strictEqual(root.text(), `${shown}page:a`)
        assert.deepStrictEqual(lifecycle(root, "/Host/LazyPage[p]"), [
          "Mounted"
        ])
      }))
  )

  it.effect.each(
    [
      "first shown by its receiver",
      "shown again by its receiver",
      "shown again by its receiver after its load fails",
      "patched by its author"
    ] as const
  )(
    "fails the author when a kept lazy child's fallback, %s, renders a child at a path the author's own child holds",
    (when) =>
      provideHost(Effect.gen(function*() {
        let clash = when === "first shown by its receiver"
        let loads = 0
        let reject!: () => void
        const Spinner = Component.define({
          name: "Spinner",
          model: Schema.Null,
          message: Schema.Never
        }).make({
          init: () => null,
          update: ($) => $.model,
          view: (h) => h.text("loading")
        })
        const LazyPage = Component.lazy("LazyPage", () => {
          loads++
          return new Promise<typeof Page>((_, fail) =>
            reject = () => fail(new Error("offline"))
          )
        })
        const Panel = Component.define({
          name: "Panel",
          model: Schema.Boolean,
          message: Schema.Literal("toggle"),
          slots: ["body"]
        }).make({
          init: () => when !== "first shown by its receiver",
          update: ($) => !$.model,
          view: (h, open) =>
            h.el(
              "section",
              h.el("button").on("click", "toggle").children("toggle"),
              open ? h.slots.body : null
            )
        })
        const Host = Component.define({
          name: "Host",
          model: Schema.Boolean,
          message: Schema.Boolean
        }).make({
          init: () => false,
          update: (_, bumped) => bumped,
          view: (h) =>
            h.keepAlive((s) =>
              h.el(
                "main",
                Panel(h, {
                  slots: {
                    body: LazyPage(s, {
                      key: "p",
                      props: { title: "a" },
                      fallback: (result) =>
                        clash || AsyncResult.isFailure(result)
                          ? Spinner(h, {})
                          : Spinner(h, { key: "initial" })
                    })
                  }
                }),
                Spinner(h, {})
              )
            )
        })
        const drain = TestHost.TestHost.useSync((host) =>
          host.drain(host.budget)
        )
        const root = yield* TestHost.mount(Host, {})
        const toggle = Effect.sync(() =>
          Locator.fire(root.get(Locator.text("toggle")), "click")
        )
        if (when === "patched by its author") {
          clash = true
          root.send(true)
        } else if (when === "shown again by its receiver") {
          yield* toggle
          yield* drain
          clash = true
        } else if (
          when === "shown again by its receiver after its load fails"
        ) {
          yield* toggle
          yield* drain
          reject()
          yield* TestHost.settle
        }
        if (when !== "patched by its author") yield* toggle
        yield* drain
        const failed = root.log().filter((entry): entry is MessageLog.Failed =>
          entry._tag === "Failed" && entry.path === "/Host"
        )
        assert.lengthOf(failed, 1)
        assert.include(
          Cause.pretty(failed[0].cause),
          "/Host renders two children at Spinner[], in the fallback of LazyPage[p]"
        )
        assert.strictEqual(loads, 1)
      }))
  )

  it.effect("keeps a loading lazy child once its call changes from h to s, with its fallback", () =>
    provideHost(Effect.gen(function*() {
      let spun = 0
      const Spinner = Component.define({
        name: "Spinner",
        model: Schema.Number,
        message: Schema.Never
      }).make({
        init: () => ++spun,
        update: ($) => $.model,
        view: (h, n) => h.text(`loading${n}`)
      })
      const LazyPage = Component.lazy(
        "LazyPage",
        () => new Promise<typeof Page>(() => {})
      )
      const Msg = UiSchema.TaggedEnum({
        Kept: {},
        Shown: { shown: Schema.Boolean }
      })
      const Host = Component.define({
        name: "Host",
        model: Schema.Struct({ kept: Schema.Boolean, shown: Schema.Boolean }),
        message: Msg
      }).make({
        init: () => ({ kept: false, shown: true }),
        update: ($, message) =>
          Msg.match(message, {
            Kept: () => ({ ...$.model, kept: true }),
            Shown: ({ shown }) => ({ ...$.model, shown })
          }),
        view: (h, { kept, shown }) =>
          h.keepAlive((s) =>
            h.el(
              "main",
              shown
                ? LazyPage(kept ? s : h, {
                  key: "p",
                  props: { title: "a" },
                  fallback: () => Spinner(h, {})
                })
                : null
            )
          )
      })
      const root = yield* TestHost.mount(Host, {})
      const show = Effect.fnUntraced(function*(message: typeof Msg.Type) {
        root.send(message)
        yield* TestHost.TestHost.useSync((host) => host.drain(host.budget))
        return [root.text(), root.pending().length] as const
      })
      assert.deepStrictEqual([
        yield* show(Msg.Kept()),
        yield* show(Msg.Shown({ shown: false })),
        yield* show(Msg.Shown({ shown: true }))
      ], [["loading1", 1], ["", 1], ["loading1", 1]])
    })))

  it.effect("preload loads the module before a child renders", () =>
    provideHost(Effect.gen(function*() {
      const LazyPage = Component.lazy("LazyPage", () => later(Page))
      yield* Effect.promise(() => LazyPage.preload())
      const root = yield* TestHost.mount(makeApp(LazyPage), {})
      assert.strictEqual(root.text(), "app:page:a")
    })))

  it.effect("the server waits for the load and renders the component", () =>
    Effect.gen(function*() {
      const LazyPage = Component.lazy("LazyPage", () => later(Page))
      const rendered = yield* HtmlServer.renderToHtml(makeApp(LazyPage), {})
      assert.include(rendered.html, "page:a")
    }))

  it("a Scene names the child by the lazy component", () => {
    const LazyPage = Component.lazy("LazyPage", () => later(Page))
    const s = Scene.start(makeApp(LazyPage), {})
    s.childPending(LazyPage).expect(Locator.tag("p")).toHaveText("app:loading")
      .childEmit(LazyPage, PageEvents.Saved({ title: "!" })).expect(
        Locator.tag("p")
      ).toHaveText("app!:loading")
  })
})
