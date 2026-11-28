import {
  Command,
  Component,
  type MessageLog,
  Route,
  Router,
  UiSchema
} from "@effect/ui"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const AppRoute = Route.union({
  Home: Route.make("/"),
  Page: Route.make("/page")
})

const LoginMessage = UiSchema.TaggedEnum({ Filled: {} })

const Login = Component.define({
  name: "Login",
  model: Schema.Struct({ email: Schema.String, password: Schema.String }),
  message: LoginMessage,
  restore: (model) => ({ ...model, password: "" })
}).make({
  init: () => ({ email: "", password: "" }),
  update: () => ({ email: "ada@example.com", password: "hunter2" }),
  view: (h, model) =>
    h.el("button").on("click", LoginMessage.Filled()).children(
      `login ${model.email}|${model.password}`
    )
})

const CounterMessage = UiSchema.TaggedEnum({ Clicked: {} })

const Counter = Component.define({
  name: "Counter",
  model: Schema.Number,
  message: CounterMessage,
  restore: false
})
  .make({
    init: () => 0,
    update: ($) => $.model + 1,
    view: (h, count) =>
      h.el("button").on("click", CounterMessage.Clicked()).children(
        `counter ${count}`
      )
  })

const GroupMessage = UiSchema.TaggedEnum({
  ChangedOn: { on: Schema.Boolean },
  Picked: {}
})

const Group = Component.define({
  name: "Group",
  model: Schema.Struct({ on: Schema.Boolean, picks: Schema.Number }),
  message: GroupMessage,
  shares: {
    value: ({ model }) => model,
    receives: ["Picked"],
    collects: {
      schema: Schema.Boolean,
      onChange: (reports) =>
        GroupMessage.ChangedOn({ on: reports.includes(true) })
    }
  }
}).make({
  init: () => ({ on: false, picks: 0 }),
  update: ($, message) =>
    GroupMessage.match(message, {
      ChangedOn: ({ on }) => ({ ...$.model, on }),
      Picked: () => ({ ...$.model, picks: $.model.picks + 1 })
    }),
  parts: () => ({})
})

const ReaderMessage = UiSchema.TaggedEnum({ Toggled: {}, Picked: {} })

const makeReader = (name: string, restore: false | undefined) =>
  Component.define({
    name,
    model: Schema.Boolean,
    message: ReaderMessage,
    restore,
    reads: { group: { owner: Group, report: (on) => on } }
  }).make({
    init: () => false,
    update: ($, message) =>
      ReaderMessage.match(message, {
        Toggled: () => !$.model,
        Picked: () => $.send(Group, GroupMessage.Picked())
      }),
    view: (h) =>
      h.el(
        "p",
        h.el("button").on("click", ReaderMessage.Toggled()).children(
          `toggle ${name}`
        ),
        h.el("button").on("click", ReaderMessage.Picked()).children(
          `pick ${name}`
        ),
        h.el(
          "span",
          `${name} on=${h.reads.group.on} picks=${h.reads.group.picks}`
        )
      )
  })

const Kept = makeReader("Kept", undefined)
const Fresh = makeReader("Fresh", false)

const Page = Component.define({
  name: "Page",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.el(
      "main",
      Login(h, { key: "login" }),
      Counter(h, { key: "counter" }),
      Group(h, { key: "kept", view: () => Kept(h, { key: "r" }) }),
      Group(h, { key: "fresh", view: () => Fresh(h, { key: "r" }) })
    )
})

const AppMessage = UiSchema.TaggedEnum({
  ChangedRoute: { route: AppRoute },
  Go: { route: AppRoute },
  Navigated: {}
})

const App = Component.define({
  name: "App",
  props: Schema.Struct({ route: AppRoute }),
  model: AppRoute,
  message: AppMessage
}).make({
  init: ($) => $.props.route,
  update: ($, message) =>
    AppMessage.match(message, {
      ChangedRoute: (changed) => changed.route,
      Go: ({ route: next }) =>
        $.run(
          Router.push(AppRoute, next).pipe(
            Command.map(() => AppMessage.Navigated())
          )
        ),
      Navigated: () => $.model
    }),
  subscriptions: (
    { model: route }
  ) => [
    Router.subscription(
      AppRoute,
      route,
      (next) => AppMessage.ChangedRoute({ route: next })
    )
  ],
  view: (h, route) =>
    h.el(
      "div",
      h.el("button").on("click", AppMessage.Go({ route: AppRoute.Home() }))
        .children("Home"),
      AppRoute.match(route, {
        Home: () => h.el("h1", "Home"),
        Page: () => Page(h, { key: "page" })
      })
    )
})

const click = (
  root: TestHost.TestRoot<unknown, never, unknown>,
  text: string
) => Locator.fire(root.get(Locator.text(text, { exact: true })), "click")
const textOf = (
  root: TestHost.TestRoot<unknown, never, unknown>,
  prefix: string
) =>
  root.all(Locator.tag("span")).map(Locator.textOf).find((text) =>
    text.startsWith(prefix)
  )
const collectedAt = (log: ReadonlyArray<MessageLog.Entry>, path: string) =>
  log.filter((entry) =>
    entry._tag === "Update" && entry.path === path &&
    entry.source._tag === "Collected"
  ).length

const Editor = Component.define({
  name: "Editor",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.keepAlive((s) => Login(s, { key: "login" }))
})

const desk = (restore?: false) =>
  Component.define({
    name: "Desk",
    model: Schema.Number,
    message: CounterMessage,
    restore
  }).make({
    init: () => 0,
    update: ($) => $.model + 1,
    view: (h, count) =>
      h.el(
        "div",
        h.el("button").on("click", CounterMessage.Clicked()).children(
          `desk ${count}`
        ),
        h.keepAlive((s) => Login(s, { key: "login" }))
      )
  })
const Desk = desk()
const office = (child: typeof Desk) =>
  Component.define({
    name: "Office",
    model: Schema.Null,
    message: Schema.Never,
    restore: false
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => h.keepAlive((s) => child(s, { key: "desk" }))
  })
const Office = office(Desk)
const OptedOffice = office(desk(false))

const ShellMessage = UiSchema.TaggedEnum({ Counted: {}, Shown: {} })

const Shell = Component.define({
  name: "Shell",
  model: Schema.Struct({ count: Schema.Number, shown: Schema.Boolean }),
  message: ShellMessage,
  restore: (model) => ({ ...model, shown: false })
}).make({
  init: () => ({ count: 0, shown: false }),
  update: ($, message) =>
    ShellMessage.match(message, {
      Counted: () => ({ ...$.model, count: $.model.count + 1 }),
      Shown: () => ({ ...$.model, shown: true })
    }),
  view: (h, model) =>
    h.el(
      "div",
      h.el("button").on("click", ShellMessage.Counted()).children(
        `shell ${model.count}`
      ),
      h.el("button").on("click", ShellMessage.Shown()).children("show"),
      model.shown ? Editor(h, { key: "editor" }) : null
    )
})

const buttonText = (
  root: TestHost.TestRoot<unknown, never, unknown>,
  prefix: string
) =>
  root.all(Locator.tag("button")).map(Locator.textOf).find((text) =>
    text.startsWith(prefix)
  )

const leaveOffice = Effect.gen(function*() {
  const history = Router.memoryHistory("/page")
  yield* Effect.gen(function*() {
    const app = yield* TestHost.mount(App, Router.props(AppRoute))
    const office = yield* TestHost.mount(Office, {})
    yield* TestHost.settle
    const steps: ReadonlyArray<
      readonly [TestHost.TestRoot<unknown, never, unknown>, string]
    > = [
      [app, "login |"],
      [office, "desk 0"],
      [office, "login |"],
      [app, "Home"]
    ]
    for (const [root, button] of steps) {
      click(root, button)
      yield* TestHost.settle
    }
    history.go(-1)
    yield* TestHost.settle
  }).pipe(
    Effect.scoped,
    Effect.provide(Router.make({ routes: AppRoute, history }))
  )
  return history
})
const shown = Effect.fnUntraced(
  function*<E, R>(
    mount: Effect.Effect<TestHost.TestRoot<unknown, never, unknown>, E, R>
  ) {
    const root = yield* mount
    yield* TestHost.settle
    return [buttonText(root, "desk"), buttonText(root, "login")].filter((
      text
    ) => text !== undefined).join(" ")
  },
  Effect.scoped
)

describe("restore", () => {
  it.effect("saves what a function returns, skips false, and restores shared owners with collected reports on Back", () =>
    Effect.gen(function*() {
      const history = Router.memoryHistory("/page")
      yield* Effect.gen(function*() {
        const root = yield* TestHost.mount(App, Router.props(AppRoute))
        yield* TestHost.settle
        for (
          const button of [
            "login |",
            "counter 0",
            "toggle Kept",
            "toggle Fresh",
            "pick Kept"
          ]
        ) {
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
        assert.notInclude(
          JSON.stringify(history.current().state),
          "/App/Page[page]/Counter[counter]"
        )
        assert.strictEqual(textOf(root, "Kept"), "Kept on=true picks=1")
        assert.strictEqual(collectedAt(since, "/App/Page[page]/Group[kept]"), 0)
        assert.strictEqual(
          collectedAt(since, "/App/Page[page]/Group[fresh]"),
          1
        )
        assert.strictEqual(textOf(root, "Fresh"), "Fresh on=false picks=0")
      }).pipe(
        Effect.scoped,
        Effect.provide(Router.make({ routes: AppRoute, history }))
      )
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("saves nothing with restore: false, so Back starts the page fresh", () =>
    Effect.gen(function*() {
      const history = Router.memoryHistory("/page")
      yield* Effect.gen(function*() {
        const root = yield* TestHost.mount(App, Router.props(AppRoute))
        yield* TestHost.settle
        click(root, "login |")
        yield* TestHost.settle
        click(root, "Home")
        yield* TestHost.settle
        history.go(-1)
        yield* TestHost.settle
        root.get(Locator.text("login |", { exact: true }))
        assert.notInclude(JSON.stringify(history.current().state), "Login")
      }).pipe(
        Effect.scoped,
        Effect.provide(
          Router.make({ routes: AppRoute, history, restore: false })
        )
      )
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("restores every root on its first mount after a reload, and none on a remount", () =>
    Effect.gen(function*() {
      const history = Router.memoryHistory("/page")
      yield* Effect.gen(function*() {
        const app = yield* TestHost.mount(App, Router.props(AppRoute))
        const shell = yield* TestHost.mount(Shell, {})
        yield* TestHost.settle
        for (
          const [root, button] of [[app, "login |"], [shell, "shell 0"], [
            shell,
            "show"
          ], [shell, "login |"]] as const
        ) {
          click(root, button)
          yield* TestHost.settle
        }
        click(app, "Home")
        yield* TestHost.settle
        history.go(-1)
        yield* TestHost.settle
      }).pipe(
        Effect.scoped,
        Effect.provide(Router.make({ routes: AppRoute, history }))
      )
      const mountBoth = Effect.gen(function*() {
        const app = yield* TestHost.mount(App, Router.props(AppRoute))
        const shell = yield* TestHost.mount(Shell, {})
        yield* TestHost.settle
        click(shell, "show")
        yield* TestHost.settle
        return [
          buttonText(app, "login"),
          buttonText(shell, "shell"),
          buttonText(shell, "login")
        ]
      }).pipe(Effect.scoped)
      const [first, again] = yield* Effect.all([mountBoth, mountBoth]).pipe(
        Effect.provide(Router.make({ routes: AppRoute, history }))
      )
      assert.deepStrictEqual(first, [
        "login ada@example.com|",
        "shell 1",
        "login |"
      ])
      assert.deepStrictEqual(again, ["login |", "shell 0", "login |"])
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("a keep-alive instance with restore: false ignores what an older entry saved of it, and restores its children", () =>
    Effect.gen(function*() {
      const history = yield* leaveOffice
      const office = yield* shown(TestHost.mount(OptedOffice, {})).pipe(
        Effect.provide(Router.make({ routes: AppRoute, history }))
      )
      assert.strictEqual(office, "desk 0 login ada@example.com|")
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect.each(["Office", "App"] as const)(
    "after a reload, a root's first mount takes its kept state and leaves another root's (%s first)",
    (first) =>
      Effect.gen(function*() {
        const history = yield* leaveOffice
        const office = shown(TestHost.mount(Office, {}))
        const app = shown(TestHost.mount(App, Router.props(AppRoute)))
        const order = first === "Office"
          ? [office, office, app]
          : [app, office, office]
        const texts = yield* Effect.all(order).pipe(
          Effect.provide(Router.make({ routes: AppRoute, history }))
        )
        const restored = "desk 1 login ada@example.com|"
        assert.deepStrictEqual(
          texts,
          first === "Office"
            ? [restored, "desk 0 login |", "login ada@example.com|"]
            : ["login ada@example.com|", restored, "desk 0 login |"]
        )
      }).pipe(Effect.provide(TestHost.layer()))
  )
})
