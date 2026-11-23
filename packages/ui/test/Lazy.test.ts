import { Component, UiSchema } from "@effect/ui"
import { HtmlServer } from "@effect/ui/html"
import { Locator, Scene, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"

const PageEvents = UiSchema.TaggedEnum({ Saved: { title: Schema.String } })

const Page = Component.define({
  name: "Page",
  scoped: false,
  props: Schema.Struct({ title: Schema.String }),
  model: Schema.Null,
  message: Schema.Never,
  events: PageEvents
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.text(`page:${h.props.title}`)
})

const AppMessage = UiSchema.TaggedEnum({ Toggled: {}, Saved: { title: Schema.String } })

const makeApp = (LazyPage: Component.Lazy<{ readonly title: string }, typeof PageEvents.Type>) =>
  Component.define({
    name: "App",
    scoped: false,
    model: Schema.Struct({ open: Schema.Boolean, saved: Schema.String }),
    message: AppMessage
  }).make({
    init: () => ({ open: true, saved: "" }),
    update: (model, message) =>
      AppMessage.match(message, {
        Toggled: () => ({ ...model, open: !model.open }),
        Saved: ({ title }) => ({ ...model, saved: title })
      }),
    view: (model, h) =>
      h.el(
        "p",
        `app${model.saved}:`,
        model.open
          ? LazyPage(h, {
            props: { title: "a" },
            onEmit: { Saved: ({ title }) => AppMessage.Saved({ title }) },
            fallback: (result) => h.text(AsyncResult.isFailure(result) ? "failed" : "loading")
          })
          : ""
      )
  })

const later = <A>(value: A) => new Promise<A>((resolve) => setTimeout(() => resolve(value), 10))

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
      assert.deepStrictEqual(root.pending(), [{ _tag: "Load", path: "/App/LazyPage[]", name: "LazyPage" }])
      yield* TestHost.settle
      root.send(AppMessage.Toggled())
      yield* TestHost.settle
      root.send(AppMessage.Toggled())
      yield* TestHost.settle
      assert.deepStrictEqual(root.frames(), ["app:loading", "app:page:a", "app:", "app:page:a"])
      const again = yield* TestHost.mount(App, {})
      assert.strictEqual(again.text(), "app:page:a")
      assert.strictEqual(loads, 1)
    })))

  it.effect("shows the fallback's Failure branch when the load fails, and loads again on the next mount", () =>
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
      for (let i = 0; i < 3; i++) {
        yield* TestHost.settle
        assert.strictEqual(root.text(), "app:failed")
        root.send(AppMessage.Toggled())
        yield* TestHost.settle
        root.send(AppMessage.Toggled())
      }
      yield* TestHost.settle
      assert.strictEqual(root.text(), "app:page:a")
      assert.strictEqual(loads, 4)
    })))

  it.effect("keeps a lazy scoped child once loaded, and closes its scope when the predicate ends it", () =>
    provideHost(Effect.gen(function*() {
      let closed = 0
      const DraftMessage = UiSchema.TaggedEnum({ Typed: {} })
      const Draft = Component.define({ name: "Draft", scoped: true, model: Schema.Number, message: DraftMessage }).make(
        {
          init: () => 0,
          update: (count) => count + 1,
          view: (count, h) => h.el("button").on("click", DraftMessage.Typed()).children(`draft:${count}`)
        }
      ).pipe(
        Component.provide(Layer.effectDiscard(Effect.addFinalizer(() => Effect.sync(() => closed++))))
      )
      const LazyDraft = Component.lazy("LazyDraft", () => later(Draft))
      const HostMessage = UiSchema.TaggedEnum({ Toggled: {}, Ended: {} })
      const Host = Component.define({
        name: "Host",
        scoped: false,
        model: Schema.Struct({ open: Schema.Boolean, alive: Schema.Boolean }),
        message: HostMessage
      }).make({
        init: () => ({ open: true, alive: true }),
        update: (model, message) =>
          HostMessage.match(message, {
            Toggled: () => ({ ...model, open: !model.open }),
            Ended: () => ({ ...model, alive: false })
          }),
        view: (model, h) =>
          h.el(
            "main",
            h.scoped(({ model }) => model.alive, (s) =>
              model.open ? LazyDraft(s, { key: "d", fallback: () => h.text("loading") }) : null)
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
      .childEmit(LazyPage, PageEvents.Saved({ title: "!" })).expect(Locator.tag("p")).toHaveText("app!:loading")
  })
})
