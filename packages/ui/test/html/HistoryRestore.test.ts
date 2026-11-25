// @vitest-environment happy-dom
import { Command, Component, Query, Route, Router, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlHydrate, HtmlServer } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Schema, SchemaGetter } from "effect"
import { AsyncResult } from "effect/reactivity"

const tick = Effect.promise(() =>
  new Promise<void>((resolve) => setTimeout(resolve, 0))
)

class Slow extends Context.Service<Slow, string>()("test/Slow") {}
let gate: Effect.Effect<void> = Effect.void
const slow = Layer.effect(Slow, Effect.suspend(() => Effect.as(gate, "ready")))

let inits = 0
const form = (name: string, restore?: false | ((model: string) => string)) =>
  Html.component({
    name,
    model: Schema.String,
    message: Schema.String,
    restore
  }).make(
    {
      init: () => inits++ === 0 ? "server" : "client",
      update: (_, text) => text,
      view: (h, text) => h.input.value(text).onInput(({ value }) => value)
    }
  )
const Form = form("Form")
const ExcludedForm = form("ExcludedForm", false)
const SlowForm = form("SlowForm").pipe(Component.provide(slow))
const ExcludedSlowForm = form("ExcludedSlowForm", false).pipe(
  Component.provide(slow)
)
const FilteredSlowForm = form("FilteredSlowForm", () => "filtered").pipe(
  Component.provide(slow)
)
const SlowSide = Html.component({
  name: "SlowSide",
  model: Schema.Null,
  message: Schema.Never
}).make({ init: () => null, update: ($) => $.model, view: (h) => h.i("side") })
  .pipe(Component.provide(slow))

let serving = false
const secret = (
  name: string,
  restore: false | ((model: string) => string)
) =>
  Html.component({
    name,
    model: Schema.String,
    message: Schema.Never,
    restore
  }).make({
    init: () => serving ? "secret-token" : "client",
    update: ($) => $.model,
    view: (h, text) => h.input.value(text)
  })
const vault = (name: string, restore: false | ((model: string) => string)) => {
  const Plain = secret(`${name}Plain`, restore)
  const Kept = secret(`${name}Kept`, restore)
  return Html.component({
    name,
    model: Schema.Null,
    message: Schema.Never
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) =>
      h.div(Plain(h, { key: "p" }), h.keepAlive((s) => Kept(s, { key: "k" })))
  }).pipe(Component.provide(slow))
}
const ExcludedVault = vault("ExcludedVault", false)
const FilteredVault = vault("FilteredVault", () => "filtered")

const Late = Schema.String.pipe(Schema.decode({
  decode: SchemaGetter.transformEffect((text: string) =>
    Effect.as(Effect.suspend(() => gate), text)
  ),
  encode: SchemaGetter.passthrough()
}))
const LateForm = Html.component({
  name: "LateForm",
  model: Late,
  message: Schema.String
}).make({
  init: () => "client",
  update: (_, text) => text,
  view: (h, text) => h.input.value(text).onInput(({ value }) => value)
})
const keepAliveForm = (
  name: string,
  restore?: false | ((model: string) => string)
) =>
  Html.component({
    name,
    model: Schema.String,
    message: Schema.String,
    restore
  }).make({
    init: () => inits++ === 0 ? "server" : "client",
    update: (_, text) => text,
    view: (h, text) => h.input.value(text)
  }).pipe(Component.provide(slow))
const KeepAliveForm = keepAliveForm("KeepAliveForm")
const ExcludedKeepAliveForm = keepAliveForm("ExcludedKeepAliveForm", false)
const FilteredKeepAliveForm = keepAliveForm(
  "FilteredKeepAliveForm",
  () => "filtered"
)
const holder = (child: typeof KeepAliveForm) =>
  Html.component({
    name: "Holder",
    model: Schema.Null,
    message: Schema.Never
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => h.keepAlive((s) => h.div(child(s, { key: "d" })))
  })
const Holder = holder(KeepAliveForm)
const ExcludedHolder = holder(ExcludedKeepAliveForm)
const FilteredHolder = holder(FilteredKeepAliveForm)

class GetTab extends Query.Service<GetTab>()("GetTab", {
  args: {},
  success: Schema.String,
  error: Schema.Never,
  staleTime: "30 seconds"
}) {
  static readonly layer = this.toLayer(
    Effect.succeed(() => Effect.succeed("billing"))
  )
}
const draft = (restore?: false) =>
  Html.component({
    name: "Draft",
    model: Schema.String,
    message: Schema.Never,
    restore
  })
    .make({
      init: () => inits++ === 0 ? "server" : "client",
      update: ($) => $.model,
      view: (h, text) => h.input.value(text)
    })
const Draft = draft()
const lateSettings = (child: typeof Draft) =>
  Html.component({
    name: "LateSettings",
    model: Late,
    message: Schema.String,
    queries: { tab: { query: GetTab, args: () => ({}) } }
  }).make({
    init: () => "",
    update: (_, shown) => shown,
    view: (h, shown) =>
      h.div(
        h.button.onClick("shown").children("show"),
        shown !== "" || !AsyncResult.isSuccess(h.queries.tab)
          ? h.keepAlive(
            ({ queries }) => !AsyncResult.isFailure(queries.tab),
            (s) => child(s, { key: "d" })
          )
          : null
      )
  }).pipe(Component.provide(GetTab.layer))
const LateSettings = lateSettings(Draft)
const ExcludedLateSettings = lateSettings(draft(false))
const lateKeepAlive = (name: string, restore?: (model: string) => string) =>
  Html.component({
    name,
    model: Late,
    message: Schema.Never,
    restore
  }).make({
    init: () => inits++ === 0 ? "server" : "client",
    update: ($) => $.model,
    view: (h, text) => h.input.value(text)
  })
const LateKeepAlive = lateKeepAlive("LateKeepAlive")
const FilteredLateKeepAlive = lateKeepAlive(
  "FilteredLateKeepAlive",
  () => "filtered"
)
const lateHolder = (child: typeof LateKeepAlive) =>
  Html.component({
    name: "LateHolder",
    model: Schema.Null,
    message: Schema.Never
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => h.keepAlive((s) => h.div(child(s, { key: "d" })))
  })
const LateHolder = lateHolder(LateKeepAlive)
const FilteredLateHolder = lateHolder(FilteredLateKeepAlive)
const Field = Html.component({
  name: "Field",
  model: Schema.String,
  message: Schema.String
}).make({
  init: () => "client",
  update: (_, text) => text,
  view: (h, text) => h.input.value(text).onInput(({ value }) => value)
})
const Group = Html.component({
  name: "Group",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.div(Form(h, { key: "c" }), h.keepAlive((s) => Field(s, { key: "e" })))
})
const LateCard = Html.component({
  name: "LateCard",
  model: Late,
  message: Schema.Never
}).make({
  init: () => "client",
  update: ($) => $.model,
  view: (h) =>
    h.div(h.keepAlive((s) => Field(s, { key: "p" })), Group(h, { key: "g" }))
})
const Card = Html.component({
  name: "Card",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.div(LateCard(h, { key: "l" }))
})
const CardHolder = Html.component({
  name: "CardHolder",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.keepAlive((s) => h.div(Card(s, { key: "d" })))
})
const Outer = Html.component({
  name: "Outer",
  model: Schema.Null,
  message: Schema.Never
})
  .make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => h.keepAlive((s) => h.div(Draft(s, { key: "d" })))
  })
const Nesting = Html.component({
  name: "Nesting",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.keepAlive((s) => h.div(Outer(s, { key: "o" })))
})

type Page =
  | "slow form"
  | "slow side"
  | "excluded slow side"
  | "excluded keep-alive form"
  | "excluded slow form"
  | "excluded vault"
  | "filtered vault"
  | "filtered slow form"
  | "filtered keep-alive form"
  | "filtered late keep-alive"
  | "late form"
  | "keep-alive form"
  | "late settings"
  | "excluded late settings"
  | "nested"
  | "late keep-alive"
  | "late card"
  | "open card"
  | "open contact"
  | "late contact"
const Routes = Route.union({
  Home: Route.make("/"),
  Next: Route.make("/next"),
  Away: Route.make("/away")
})
const Msg = UiSchema.TaggedEnum({
  Changed: { route: Routes },
  Go: {},
  Next: {},
  Went: {}
})
const appOf = (page: Page) =>
  Html.component({
    name: "App",
    props: Schema.Struct({ route: Routes }),
    model: Routes,
    message: Msg
  }).make({
    init: ($) => $.props.route,
    update: ($, message) =>
      Msg.match(message, {
        Changed: (changed) => changed.route,
        Go: () =>
          $.run(
            Router.push(Routes, Routes.Away()).pipe(
              Command.map(() => Msg.Went())
            )
          ),
        Next: () =>
          $.run(
            Router.push(Routes, Routes.Next()).pipe(
              Command.map(() => Msg.Went())
            )
          ),
        Went: () => $.model
      }),
    subscriptions: (
      { model: route }
    ) => [
      Router.subscription(Routes, route, (changed) =>
        Msg.Changed({ route: changed }))
    ],
    view: (h, route) =>
      h.main(
        page.endsWith("slow side") ||
          (page.startsWith("open") && route._tag === "Home")
          ? SlowSide(h, { key: "s" })
          : null,
        route._tag === "Away"
          ? h.p("away")
          : page === "slow side"
          ? Form(h, { key: "f" })
          : page === "excluded slow side"
          ? ExcludedForm(h, { key: "f" })
          : page === "excluded vault"
          ? ExcludedVault(h, { key: "f" })
          : page === "filtered vault"
          ? FilteredVault(h, { key: "f" })
          : page === "excluded slow form"
          ? ExcludedSlowForm(h, { key: "f" })
          : page === "filtered slow form"
          ? FilteredSlowForm(h, { key: "f" })
          : page === "excluded keep-alive form"
          ? ExcludedHolder(h, { key: "f" })
          : page === "filtered keep-alive form"
          ? FilteredHolder(h, { key: "f" })
          : page === "filtered late keep-alive"
          ? FilteredLateHolder(h, { key: "f" })
          : page === "late form"
          ? LateForm(h, { key: "f" })
          : page === "keep-alive form"
          ? Holder(h, { key: "f" })
          : page === "late settings"
          ? LateSettings(h, { key: "f" })
          : page === "excluded late settings"
          ? ExcludedLateSettings(h, { key: "f" })
          : page === "nested"
          ? Nesting(h, { key: "f" })
          : page === "late keep-alive"
          ? LateHolder(h, { key: "f" })
          : page === "late card" || page === "open card"
          ? CardHolder(h, { key: "f" })
          : page === "open contact" || page === "late contact"
          ? LateCard(h, { key: "f" })
          : SlowForm(h, { key: "f" })
      )
  })

const editor = (name: string) =>
  Html.component({
    name,
    props: Schema.Struct({ open: Schema.Boolean }),
    model: Schema.NullOr(Schema.String),
    message: Schema.NullOr(Schema.String)
  }).make({
    init: () => "subject",
    update: (_, subject) => subject,
    view: (h, subject) =>
      h.section(
        h.input.value(subject ?? "").onInput(({ value }) =>
          value === "" ? null : value
        ),
        h.props.open ? h.keepAlive((s) => Draft(s, { key: "d" })) : null
      )
  })
const Editor = editor("Editor")
const SlowEditor = editor("SlowEditor").pipe(Component.provide(slow))
const SlowNesting = Html.component({
  name: "SlowNesting",
  props: Schema.Struct({ open: Schema.Boolean }),
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.section(
      h.keepAlive(({ props }) => props.open, (s) => Outer(s, { key: "o" }))
    )
}).pipe(Component.provide(slow))
const Shown = Schema.Literals(["none", "closed", "open"])
const DeskMsg = UiSchema.TaggedEnum({
  Changed: { route: Routes },
  Go: {},
  Went: {},
  Show: { editor: Shown }
})
const deskOf = (waits: boolean, nested: boolean) =>
  Html.component({
    name: "Desk",
    props: Schema.Struct({ route: Routes }),
    model: Schema.Struct({ route: Routes, editor: Shown }),
    message: DeskMsg
  }).make({
    init: ($) => ({ route: $.props.route, editor: "open" as const }),
    update: ($, message) =>
      DeskMsg.match(message, {
        Changed: ({ route }) => ({ ...$.model, route }),
        Go: () =>
          $.run(
            Router.push(Routes, Routes.Away()).pipe(
              Command.map(() => DeskMsg.Went())
            )
          ),
        Went: () => $.model,
        Show: ({ editor }) => ({ ...$.model, editor })
      }),
    subscriptions: (
      { model: desk }
    ) => [Router.subscription(Routes, desk.route, (route) =>
      DeskMsg.Changed({ route }))],
    view: (h, desk) => {
      if (desk.route._tag === "Away") {
        return h.main("away")
      }
      const props = { open: desk.editor === "open" }
      return h.main(
        SlowSide(h, { key: "s" }),
        desk.editor === "none"
          ? null
          : nested
          ? SlowNesting(h, { key: "e", props })
          : waits
          ? SlowEditor(h, { key: "e", props })
          : Editor(h, { key: "e", props })
      )
    }
  })

const serve = Effect.fnUntraced(function*<E, R>(
  page: Effect.Effect<HtmlServer.Rendered<unknown>, E, R>,
  ready: boolean
) {
  inits = 0
  gate = Effect.void
  serving = true
  const { html, state } = yield* page.pipe(
    Effect.provide(
      Router.make({ routes: Routes, history: Router.memoryHistory("/") })
    )
  )
  serving = false
  const latch = yield* Deferred.make<void>()
  if (!ready) gate = Deferred.await(latch)
  const app = document.body.appendChild(document.createElement("div"))
  yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
  app.innerHTML = html
  return { app, state, open: Deferred.succeed(latch, undefined) }
})
const visit = Effect.fnUntraced(function*(page: Page, ready = false) {
  const App = appOf(page)
  const props = Router.props(Routes)
  const { app, open, state } = yield* serve(
    HtmlServer.renderToHtml(App, props),
    ready
  )
  const root = yield* HtmlHydrate.hydrateEffect(App, props, app, state)
  yield* tick
  return { app, root, open }
})
const sit = Effect.fnUntraced(
  function*(waits: boolean, ready = false, nested = false) {
    const Desk = deskOf(waits, nested)
    const props = Router.props(Routes)
    const { app, open, state } = yield* serve(
      HtmlServer.renderToHtml(Desk, props),
      ready
    )
    const root = yield* HtmlHydrate.hydrateEffect(Desk, props, app, state)
    yield* tick
    return {
      app,
      root,
      open,
      draft: () => app.querySelectorAll("input")[1]?.value
    }
  }
)
const Panel = Html.component({
  name: "Panel",
  model: Schema.Boolean,
  message: Schema.Boolean
}).make({
  init: () => true,
  update: (_, shown) => shown,
  view: (h, shown) =>
    h.main(
      SlowSide(h, { key: "s" }),
      shown ? Editor(h, { key: "e", props: { open: true } }) : null
    )
})
const aside = Effect.fnUntraced(function*(first: Page) {
  const { app, state } = yield* serve(HtmlServer.renderToHtml(Panel, {}), false)
  const other = document.body.appendChild(document.createElement("div"))
  yield* Effect.addFinalizer(() => Effect.sync(() => other.remove()))
  const primary = yield* BrowserHost.mountEffect(
    appOf(first),
    Router.props(Routes),
    other
  )
  const root = yield* HtmlHydrate.hydrateEffect(Panel, {}, app, state)
  yield* tick
  return {
    root,
    go: () => primary.send(Msg.Go()),
    draft: () => app.querySelectorAll("input")[1]?.value
  }
})

describe("history restore of a page whose hydration hasn't settled", {
  concurrent: false
}, () => {
  it.effect.each(
    [["excluded vault", "client"], ["filtered vault", "filtered"]] as const
  )(
    "no snapshot holds the server's Model of the children of a %s a push closed as it waited",
    ([page, saved]) => {
      const history = Router.memoryHistory("/")
      return Effect.gen(function*() {
        const { app, open, root } = yield* visit(page)
        const values = () =>
          Array.from(app.querySelectorAll("input"), (field) => field.value)
        const away = Effect.suspend(() => (root.send(Msg.Go()), tick))
        const back = Effect.suspend(() => {
          history.go(-1)
          const entry = JSON.stringify(history.current().state)
          assert.notInclude(entry, "secret-token")
          return Effect.as(tick, entry)
        })
        assert.deepStrictEqual(values(), ["secret-token", "secret-token"])
        yield* away
        yield* open
        yield* tick
        yield* back
        assert.deepStrictEqual(values(), ["client", "client"])
        yield* away
        const entry = yield* back
        assert.strictEqual(entry.includes("filtered"), saved === "filtered")
        assert.deepStrictEqual(values(), [saved, saved])
      }).pipe(
        Effect.scoped,
        Effect.provide(Router.make({ routes: Routes, history }))
      )
    }
  )

  it.effect.each(
    [
      ["excluded slow form", "/App/ExcludedSlowForm[f]", undefined, "client"],
      [
        "filtered slow form",
        "/App/FilteredSlowForm[f]",
        "filtered",
        "filtered"
      ],
      [
        "excluded keep-alive form",
        "/App/Holder[f]/ExcludedKeepAliveForm[d]",
        undefined,
        "client"
      ],
      [
        "filtered keep-alive form",
        "/App/Holder[f]/FilteredKeepAliveForm[d]",
        "filtered",
        "filtered"
      ],
      [
        "filtered late keep-alive",
        "/App/LateHolder[f]/FilteredLateKeepAlive[d]",
        undefined,
        "client"
      ]
    ] as const
  )(
    "a push as a %s waits writes what its restore keeps into the entry",
    ([page, path, saved, shown]) => {
      const history = Router.memoryHistory("/")
      return Effect.gen(function*() {
        const { app, open, root } = yield* visit(page)
        root.send(Msg.Go())
        yield* tick
        history.go(-1)
        const entry = JSON.stringify(history.current().state)
        assert.notInclude(entry, "\"server\"")
        if (saved === undefined) assert.notInclude(entry, `"${path}":"`)
        else assert.include(entry, `"${path}":"${saved}"`)
        yield* tick
        yield* open
        yield* tick
        assert.strictEqual(app.querySelector("input")!.value, shown)
      }).pipe(
        Effect.scoped,
        Effect.provide(Router.make({ routes: Routes, history }))
      )
    }
  )

  it.effect("Back runs a component with restore: false from init while another component waits", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app, root } = yield* visit("excluded slow side")
      assert.strictEqual(app.querySelector("input")!.value, "server")
      root.send(Msg.Go())
      yield* tick
      history.go(-1)
      yield* tick
      assert.strictEqual(app.querySelector("input")!.value, "client")
    }).pipe(
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history }))
    )
  })

  it.effect("Back restores the server's Model of a keep-alive child whose state still decodes after that Back", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app, open, root } = yield* visit("late keep-alive")
      root.send(Msg.Go())
      yield* tick
      history.go(-1)
      yield* tick
      yield* open
      yield* tick
      assert.strictEqual(app.querySelector("input")!.value, "server")
    }).pipe(
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history }))
    )
  })

  it.effect("Back restores a keep-alive child drawn by a keep-alive child", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app, root } = yield* visit("nested", true)
      root.send(Msg.Go())
      yield* tick
      history.go(-1)
      yield* tick
      assert.strictEqual(app.querySelector("input")!.value, "server")
    }).pipe(
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history }))
    )
  })

  it.effect.each(
    ["slow form", "keep-alive form"] as const
  )(
    "Back restores the server's Model of a %s a push closed as it waited for its Layer",
    (page) => {
      const history = Router.memoryHistory("/")
      return Effect.gen(function*() {
        const { app, open, root } = yield* visit(page)
        root.send(Msg.Go())
        yield* tick
        history.go(-1)
        yield* tick
        yield* open
        yield* tick
        assert.strictEqual(app.querySelector("input")!.value, "server")
      }).pipe(
        Effect.scoped,
        Effect.provide(Router.make({ routes: Routes, history }))
      )
    }
  )

  it.effect("a keep-alive child with restore: false the server kept undrawn starts from the server's Model when first drawn", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app } = yield* visit("excluded late settings", true)
      assert.notInclude(app.innerHTML, "input")
      app.querySelector("button")!.click()
      yield* tick
      assert.strictEqual(app.querySelector("input")!.value, "server")
    }).pipe(
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history }))
    )
  })

  it.effect("Back runs a keep-alive child the server kept undrawn from init when a push closed its author as its state decoded", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app, open, root } = yield* visit("late settings", false)
      assert.notInclude(app.innerHTML, "input")
      root.send(Msg.Go())
      yield* tick
      yield* open
      history.go(-1)
      yield* tick
      app.querySelector("button")!.click()
      yield* tick
      assert.strictEqual(app.querySelector("input")!.value, "client")
    }).pipe(
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history }))
    )
  })

  it.effect("a second Back runs a keep-alive child the server kept undrawn from init, after a push closed its author as it waited", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app, root } = yield* visit("late settings", true)
      root.send(Msg.Go())
      yield* tick
      const latch = yield* Deferred.make<void>()
      gate = Deferred.await(latch)
      history.go(-1)
      yield* tick
      root.send(Msg.Go())
      yield* tick
      yield* Deferred.succeed(latch, undefined)
      history.go(-1)
      yield* tick
      app.querySelector("button")!.click()
      yield* tick
      assert.strictEqual(app.querySelector("input")!.value, "client")
    }).pipe(
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history }))
    )
  })

  it.effect("Back restores what the user typed in a form a push closed as an earlier Back's state decoded", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app, open, root } = yield* visit("late form")
      yield* open
      yield* tick
      const field = app.querySelector("input")!
      field.value = "typed"
      field.dispatchEvent(new Event("input", { bubbles: true }))
      yield* tick
      root.send(Msg.Go())
      yield* tick
      const latch = yield* Deferred.make<void>()
      gate = Deferred.await(latch)
      history.go(-1)
      yield* tick
      root.send(Msg.Go())
      yield* tick
      yield* Deferred.succeed(latch, undefined)
      history.go(-1)
      yield* tick
      assert.strictEqual(app.querySelector("input")!.value, "typed")
    }).pipe(
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history }))
    )
  })

  it.effect.each(
    [
      ["open card", true],
      ["open card", false],
      ["late contact", true]
    ] as const
  )(
    "Back restores all the user typed below a form a push closed after an earlier Back (%s, whose state still decoded: %s)",
    ([page, decoding]) => {
      const history = Router.memoryHistory("/")
      return Effect.gen(function*() {
        const { app, open, root } = yield* visit(page)
        yield* open
        yield* tick
        const typed = ["phone", "name", "email"]
        const fields = () => Array.from(app.querySelectorAll("input"))
        fields().forEach((field, at) => {
          field.value = typed[at]
          field.dispatchEvent(new Event("input", { bubbles: true }))
        })
        yield* tick
        root.send(Msg.Go())
        yield* tick
        const latch = yield* Deferred.make<void>()
        if (decoding) gate = Deferred.await(latch)
        history.go(-1)
        yield* tick
        root.send(Msg.Go())
        yield* tick
        yield* Deferred.succeed(latch, undefined)
        history.go(-1)
        yield* tick
        assert.deepStrictEqual(fields().map((field) => field.value), typed)
      }).pipe(
        Effect.scoped,
        Effect.provide(Router.make({ routes: Routes, history }))
      )
    }
  )

  it.effect.each(["push", "Back"] as const)(
    "Back restores all the user typed below a form that crossed a %s to another entry while its state decoded",
    (crossing) => {
      const history = Router.memoryHistory("/")
      return Effect.gen(function*() {
        const { app, open, root } = yield* visit("late contact")
        yield* open
        yield* tick
        const fields = () => Array.from(app.querySelectorAll("input"))
        const type = (typed: ReadonlyArray<string>) =>
          Effect.suspend(() => {
            fields().forEach((field, at) => {
              field.value = typed[at]
              field.dispatchEvent(new Event("input", { bubbles: true }))
            })
            return tick
          })
        const go = (message: typeof Msg.Type) =>
          Effect.suspend(() => (root.send(message), tick))
        const back = Effect.suspend(() => (history.go(-1), tick))
        yield* type(["phone", "name", "email"])
        const typed = crossing === "Back"
          ? ["", "Mira", "mira"]
          : ["phone", "name", "email"]
        if (crossing === "Back") {
          yield* go(Msg.Next())
          yield* type(typed)
        }
        yield* go(Msg.Go())
        const latch = yield* Deferred.make<void>()
        gate = Deferred.await(latch)
        yield* back
        yield* crossing === "Back" ? back : go(Msg.Next())
        yield* go(Msg.Go())
        yield* Deferred.succeed(latch, undefined)
        yield* back
        assert.deepStrictEqual(fields().map((field) => field.value), typed)
      }).pipe(
        Effect.scoped,
        Effect.provide(Router.make({ routes: Routes, history }))
      )
    }
  )

  it.effect(
    "Back restores none of a form its parent stopped drawing before a push after an earlier Back",
    () => {
      const history = Router.memoryHistory("/")
      return Effect.gen(function*() {
        const { app, open, root } = yield* sit(false)
        yield* open
        yield* tick
        const field = app.querySelector("input")!
        field.value = "typed"
        field.dispatchEvent(new Event("input", { bubbles: true }))
        yield* tick
        root.send(DeskMsg.Go())
        yield* tick
        root.send(DeskMsg.Show({ editor: "none" }))
        const latch = yield* Deferred.make<void>()
        gate = Deferred.await(latch)
        history.go(-1)
        yield* tick
        root.send(DeskMsg.Go())
        yield* tick
        root.send(DeskMsg.Show({ editor: "open" }))
        yield* Deferred.succeed(latch, undefined)
        history.go(-1)
        yield* tick
        assert.strictEqual(app.querySelector("input")!.value, "subject")
      }).pipe(
        Effect.scoped,
        Effect.provide(Router.make({ routes: Routes, history }))
      )
    }
  )

  it.effect("Back restores none of a keep-alive child a push closed with its waiting author, when its predicate is false at that Back", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app, open, root } = yield* sit(true, false, true)
      root.send(DeskMsg.Go())
      yield* tick
      root.send(DeskMsg.Show({ editor: "closed" }))
      history.go(-1)
      yield* tick
      root.send(DeskMsg.Show({ editor: "open" }))
      yield* tick
      yield* open
      yield* tick
      assert.strictEqual(app.querySelector("input")!.value, "client")
    }).pipe(
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history }))
    )
  })

  it.effect("Back restores what the user typed, over the server's Model, while another component waits", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app, root } = yield* visit("slow side")
      const field = app.querySelector("input")!
      field.value = "typed"
      field.dispatchEvent(new Event("input", { bubbles: true }))
      yield* tick
      root.send(Msg.Go())
      yield* tick
      history.go(-1)
      yield* tick
      assert.strictEqual(app.querySelector("input")!.value, "typed")
    }).pipe(
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history }))
    )
  })

  it.effect("Back restores a Model the user set to null", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app, root } = yield* sit(false, true)
      const field = app.querySelector("input")!
      field.value = ""
      field.dispatchEvent(new Event("input", { bubbles: true }))
      yield* tick
      root.send(DeskMsg.Go())
      yield* tick
      history.go(-1)
      yield* tick
      assert.strictEqual(app.querySelector("input")!.value, "")
    }).pipe(
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history }))
    )
  })

  it.effect("Back runs a keep-alive child an author drew as a push closed it waiting from init, drawn again after the Back settles", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { draft, open, root } = yield* sit(true)
      root.send(DeskMsg.Go())
      yield* tick
      yield* open
      root.send(DeskMsg.Show({ editor: "closed" }))
      history.go(-1)
      yield* tick
      root.send(DeskMsg.Show({ editor: "open" }))
      yield* tick
      assert.strictEqual(draft(), "client")
    }).pipe(
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history }))
    )
  })

  it.effect("Back restores a keep-alive child a push closed with its waiting author once: an author made again at its key starts it afresh", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { draft, open, root } = yield* sit(true)
      root.send(DeskMsg.Go())
      yield* tick
      root.send(DeskMsg.Show({ editor: "closed" }))
      history.go(-1)
      yield* tick
      root.send(DeskMsg.Show({ editor: "none" }))
      yield* tick
      root.send(DeskMsg.Show({ editor: "open" }))
      yield* tick
      yield* open
      yield* tick
      assert.strictEqual(draft(), "client")
    }).pipe(
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history }))
    )
  })

  it.effect("Back restores a keep-alive child of an author made before the Back settles", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { draft, root } = yield* sit(false, true)
      root.send(DeskMsg.Go())
      yield* tick
      gate = Effect.never
      root.send(DeskMsg.Show({ editor: "none" }))
      history.go(-1)
      yield* tick
      root.send(DeskMsg.Show({ editor: "open" }))
      yield* tick
      assert.strictEqual(draft(), "server")
    }).pipe(
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history }))
    )
  })

  it.effect("Back restores no keep-alive child of an author made after it settled, in a root that still hydrates", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { draft, go, root } = yield* aside("nested")
      go()
      yield* tick
      root.send(false)
      history.go(-1)
      yield* tick
      root.send(true)
      yield* tick
      assert.strictEqual(draft(), "client")
    }).pipe(
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history }))
    )
  })

  it.effect("Back restores a keep-alive child once, in a root that still hydrates: an author made again at its key starts it afresh", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { draft, go, root } = yield* aside("slow form")
      go()
      yield* tick
      root.send(false)
      history.go(-1)
      yield* tick
      root.send(true)
      yield* tick
      assert.strictEqual(draft(), "server")
      root.send(false)
      yield* tick
      root.send(true)
      yield* tick
      assert.strictEqual(draft(), "client")
    }).pipe(
      Effect.scoped,
      Effect.provide(Router.make({ routes: Routes, history }))
    )
  })
})
