import { Command, Component, type MessageLog, Route, Router, UiSchema } from "@effect/ui"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const AppRoute = Route.union({ Home: Route.make("/"), Page: Route.make("/page") })

const LoginMessage = UiSchema.TaggedEnum({ Filled: {} })

const login = <Scoped extends boolean>(scoped: Scoped) =>
  Component.define({
    name: "Login",
    scoped,
    model: Schema.Struct({ email: Schema.String, password: Schema.String }),
    message: LoginMessage,
    restore: (model) => ({ ...model, password: "" })
  }).make({
    init: () => ({ email: "", password: "" }),
    update: () => ({ email: "ada@example.com", password: "hunter2" }),
    view: (model, h) =>
      h.el("button").on("click", LoginMessage.Filled()).children(`login ${model.email}|${model.password}`)
  })
const Login = login(false)
const ScopedLogin = login(true)

const CounterMessage = UiSchema.TaggedEnum({ Clicked: {} })

const Counter = Component.define({
  name: "Counter",
  scoped: false,
  model: Schema.Number,
  message: CounterMessage,
  restore: false
})
  .make({
    init: () => 0,
    update: (count) => count + 1,
    view: (count, h) => h.el("button").on("click", CounterMessage.Clicked()).children(`counter ${count}`)
  })

const GroupMessage = UiSchema.TaggedEnum({ ChangedOn: { on: Schema.Boolean }, Picked: {} })

const Group = Component.define({
  name: "Group",
  scoped: false,
  model: Schema.Struct({ on: Schema.Boolean, picks: Schema.Number }),
  message: GroupMessage,
  shares: {
    value: (model) => model,
    receives: ["Picked"],
    collects: { schema: Schema.Boolean, onChange: (reports) => GroupMessage.ChangedOn({ on: reports.includes(true) }) }
  }
}).make({
  init: () => ({ on: false, picks: 0 }),
  update: (model, message) =>
    GroupMessage.match(message, {
      ChangedOn: ({ on }) => ({ ...model, on }),
      Picked: () => ({ ...model, picks: model.picks + 1 })
    }),
  parts: () => ({})
})

const ReaderMessage = UiSchema.TaggedEnum({ Toggled: {}, Picked: {} })

const makeReader = (name: string, restore: false | undefined) =>
  Component.define({
    name,
    scoped: false,
    model: Schema.Boolean,
    message: ReaderMessage,
    restore,
    shared: { group: { owner: Group, report: (on) => on } }
  }).make({
    init: () => false,
    update: (on, message, $) =>
      ReaderMessage.match(message, {
        Toggled: () => !on,
        Picked: () => $.set(on).send(Group, GroupMessage.Picked())
      }),
    view: (_, h) =>
      h.el(
        "p",
        h.el("button").on("click", ReaderMessage.Toggled()).children(`toggle ${name}`),
        h.el("button").on("click", ReaderMessage.Picked()).children(`pick ${name}`),
        h.el("span", `${name} on=${h.shared.group.on} picks=${h.shared.group.picks}`)
      )
  })

const Kept = makeReader("Kept", undefined)
const Fresh = makeReader("Fresh", false)

const Page = Component.define({ name: "Page", scoped: false, model: Schema.Null, message: Schema.Never }).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) =>
    h.el(
      "main",
      Login(h, { key: "login" }),
      Counter(h, { key: "counter" }),
      Group(h, { key: "kept", view: () => Kept(h, { key: "r" }) }),
      Group(h, { key: "fresh", view: () => Fresh(h, { key: "r" }) })
    )
})

const AppMessage = UiSchema.TaggedEnum({ ChangedRoute: { route: AppRoute }, Go: { route: AppRoute }, Navigated: {} })

const App = Component.define({
  name: "App",
  scoped: false,
  props: Schema.Struct({ route: AppRoute }),
  model: AppRoute,
  message: AppMessage
}).make({
  init: ($) => $.props.route,
  update: (route, message, $) =>
    AppMessage.match(message, {
      ChangedRoute: (changed) => changed.route,
      Go: ({ route: next }) =>
        $.set(route).run(Router.push(AppRoute, next).pipe(Command.map(() => AppMessage.Navigated()))),
      Navigated: () => route
    }),
  subscriptions: (route) => [Router.subscription(AppRoute, route, (next) => AppMessage.ChangedRoute({ route: next }))],
  view: (route, h) =>
    h.el(
      "div",
      h.el("button").on("click", AppMessage.Go({ route: AppRoute.Home() })).children("Home"),
      AppRoute.match(route, { Home: () => h.el("h1", "Home"), Page: () => Page(h, { key: "page" }) })
    )
})

const click = (root: TestHost.TestRoot<any, any, any>, text: string) =>
  Locator.fire(root.get(Locator.text(text, { exact: true })), "click")
const textOf = (root: TestHost.TestRoot<any, any, any>, prefix: string) =>
  root.all(Locator.tag("span")).map(Locator.textOf).find((text) => text.startsWith(prefix))
const collectedAt = (log: ReadonlyArray<MessageLog.Entry>, path: string) =>
  log.filter((entry) => entry._tag === "Update" && entry.path === path && entry.source._tag === "Collected").length

const Editor = Component.define({ name: "Editor", scoped: false, model: Schema.Null, message: Schema.Never }).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.scoped((s) => ScopedLogin(s, { key: "login" }))
})

const ShellMessage = UiSchema.TaggedEnum({ Counted: {}, Shown: {} })

const Shell = Component.define({
  name: "Shell",
  scoped: false,
  model: Schema.Struct({ count: Schema.Number, shown: Schema.Boolean }),
  message: ShellMessage,
  restore: (model) => ({ ...model, shown: false })
}).make({
  init: () => ({ count: 0, shown: false }),
  update: (model, message) =>
    ShellMessage.match(message, {
      Counted: () => ({ ...model, count: model.count + 1 }),
      Shown: () => ({ ...model, shown: true })
    }),
  view: (model, h) =>
    h.el(
      "div",
      h.el("button").on("click", ShellMessage.Counted()).children(`shell ${model.count}`),
      h.el("button").on("click", ShellMessage.Shown()).children("show"),
      model.shown ? Editor(h, { key: "editor" }) : null
    )
})

const buttonText = (root: TestHost.TestRoot<any, any, any>, prefix: string) =>
  root.all(Locator.tag("button")).map(Locator.textOf).find((text) => text.startsWith(prefix))

describe("restore", () => {
  it.effect("saves what a function returns, skips false, and restores shared owners with collected reports on Back", () =>
    Effect.gen(function*() {
      const history = Router.memoryHistory("/page")
      yield* Effect.gen(function*() {
        const root = yield* TestHost.mount(App, Router.props(AppRoute))
        yield* TestHost.settle
        for (const button of ["login |", "counter 0", "toggle Kept", "toggle Fresh", "pick Kept"]) {
          click(root, button)
          yield* TestHost.settle
        }
        click(root, "Home")
        yield* TestHost.settle
        const start = root.log().length
        history.go(-1)
        yield* TestHost.settle
        const since = root.log().slice(start)
        root.get(Locator.text("login ada@example.com|", { exact: true }))
        root.get(Locator.text("counter 0", { exact: true }))
        assert.notInclude(JSON.stringify(history.current().state), "hunter2")
        assert.notInclude(JSON.stringify(history.current().state), "/App/Page[page]/Counter[counter]")
        assert.strictEqual(textOf(root, "Kept"), "Kept on=true picks=1")
        assert.strictEqual(collectedAt(since, "/App/Page[page]/Group[kept]"), 0)
        assert.strictEqual(collectedAt(since, "/App/Page[page]/Group[fresh]"), 1)
        assert.strictEqual(textOf(root, "Fresh"), "Fresh on=false picks=0")
      }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: AppRoute, history })))
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("restores every root on its first mount after a reload, and none on a remount", () =>
    Effect.gen(function*() {
      const history = Router.memoryHistory("/page")
      yield* Effect.gen(function*() {
        const app = yield* TestHost.mount(App, Router.props(AppRoute))
        const shell = yield* TestHost.mount(Shell, {})
        yield* TestHost.settle
        for (
          const [root, button] of [[app, "login |"], [shell, "shell 0"], [shell, "show"], [shell, "login |"]] as const
        ) {
          click(root, button)
          yield* TestHost.settle
        }
        click(app, "Home")
        yield* TestHost.settle
        history.go(-1)
        yield* TestHost.settle
      }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: AppRoute, history })))
      const mountBoth = Effect.gen(function*() {
        const app = yield* TestHost.mount(App, Router.props(AppRoute))
        const shell = yield* TestHost.mount(Shell, {})
        yield* TestHost.settle
        click(shell, "show")
        yield* TestHost.settle
        return [buttonText(app, "login"), buttonText(shell, "shell"), buttonText(shell, "login")]
      }).pipe(Effect.scoped)
      const [first, again] = yield* Effect.all([mountBoth, mountBoth]).pipe(
        Effect.provide(Router.make({ routes: AppRoute, history }))
      )
      assert.deepStrictEqual(first, ["login ada@example.com|", "shell 1", "login |"])
      assert.deepStrictEqual(again, ["login |", "shell 0", "login |"])
    }).pipe(Effect.provide(TestHost.layer())))
})
