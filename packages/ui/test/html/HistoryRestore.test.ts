// @vitest-environment happy-dom
import { Command, Component, Query, Route, Router, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlServer } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Schema, SchemaGetter } from "effect"
import { AsyncResult } from "effect/reactivity"

const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

class Slow extends Context.Service<Slow, string>()("test/Slow") {}
let gate: Effect.Effect<void> = Effect.void
const slow = Layer.effect(Slow, Effect.suspend(() => Effect.as(gate, "ready")))

let inits = 0
const form = (name: string, restore?: false | ((model: string) => string)) =>
  Component.define({ name, scoped: false, model: Schema.String, message: Schema.String, elements: Html, restore }).make(
    {
      init: () => inits++ === 0 ? "server" : "client",
      update: (_, text) => text,
      view: (text, h) => h.input.value(text).onInput(({ value }) => value)
    }
  )
const Form = form("Form")
const ExcludedForm = form("ExcludedForm", false)
const SlowForm = form("SlowForm").pipe(Component.provide(slow))
const ExcludedSlowForm = form("ExcludedSlowForm", false).pipe(Component.provide(slow))
const FilteredSlowForm = form("FilteredSlowForm", () => "filtered").pipe(Component.provide(slow))
const SlowSide = Component.define({
  name: "SlowSide",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({ init: () => null, update: (model) => model, view: (_, h) => h.i("side") }).pipe(Component.provide(slow))

let serving = false
const secret = <Scoped extends boolean>(name: string, scoped: Scoped, restore: false | ((model: string) => string)) =>
  Component.define({ name, scoped, model: Schema.String, message: Schema.Never, elements: Html, restore }).make({
    init: () => serving ? "secret-token" : "client",
    update: (model) => model,
    view: (text, h) => h.input.value(text)
  })
const vault = (name: string, restore: false | ((model: string) => string)) => {
  const Plain = secret(`${name}Plain`, false, restore)
  const Kept = secret(`${name}Kept`, true, restore)
  return Component.define({ name, scoped: false, model: Schema.Null, message: Schema.Never, elements: Html }).make({
    init: () => null,
    update: (model) => model,
    view: (_, h) => h.div(Plain(h, { key: "p" }), h.scoped((s) => Kept(s, { key: "k" })))
  }).pipe(Component.provide(slow))
}
const ExcludedVault = vault("ExcludedVault", false)
const FilteredVault = vault("FilteredVault", () => "filtered")

const Late = Schema.String.pipe(Schema.decode({
  decode: SchemaGetter.transformEffect((text: string) => Effect.as(Effect.suspend(() => gate), text)),
  encode: SchemaGetter.passthrough()
}))
const LateForm = Component.define({
  name: "LateForm",
  scoped: false,
  model: Late,
  message: Schema.String,
  elements: Html
}).make({
  init: () => "client",
  update: (_, text) => text,
  view: (text, h) => h.input.value(text).onInput(({ value }) => value)
})
const scopedForm = (name: string, restore?: false | ((model: string) => string)) =>
  Component.define({
    name,
    scoped: true,
    model: Schema.String,
    message: Schema.String,
    elements: Html,
    restore
  }).make({
    init: () => inits++ === 0 ? "server" : "client",
    update: (_, text) => text,
    view: (text, h) => h.input.value(text)
  }).pipe(Component.provide(slow))
const ScopedForm = scopedForm("ScopedForm")
const ExcludedScopedForm = scopedForm("ExcludedScopedForm", false)
const FilteredScopedForm = scopedForm("FilteredScopedForm", () => "filtered")
const holder = (child: typeof ScopedForm) =>
  Component.define({
    name: "Holder",
    scoped: false,
    model: Schema.Null,
    message: Schema.Never,
    elements: Html
  }).make({
    init: () => null,
    update: (model) => model,
    view: (_, h) => h.scoped((s) => h.div(child(s, { key: "d" })))
  })
const Holder = holder(ScopedForm)
const ExcludedHolder = holder(ExcludedScopedForm)
const FilteredHolder = holder(FilteredScopedForm)

class GetTab extends Query.Service<GetTab>()("GetTab", {
  args: {},
  success: Schema.String,
  error: Schema.Never,
  staleTime: "30 seconds"
}, Effect.succeed(() => Effect.succeed("billing"))) {}
const draft = (restore?: false) =>
  Component.define({
    name: "Draft",
    scoped: true,
    model: Schema.String,
    message: Schema.Never,
    elements: Html,
    restore
  })
    .make({
      init: () => inits++ === 0 ? "server" : "client",
      update: (model) => model,
      view: (text, h) => h.input.value(text)
    })
const Draft = draft()
const lateSettings = (child: typeof Draft) =>
  Component.define({
    name: "LateSettings",
    scoped: false,
    model: Late,
    message: Schema.String,
    elements: Html,
    queries: { tab: { query: GetTab, args: () => ({}) } }
  }).make({
    init: () => "",
    update: (_, shown) => shown,
    view: (shown, h) =>
      h.div(
        h.button.onClick("shown").children("show"),
        shown !== "" || !AsyncResult.isSuccess(h.queries.tab)
          ? h.scoped(({ queries }) => !AsyncResult.isFailure(queries.tab), (s) => child(s, { key: "d" }))
          : null
      )
  }).pipe(Component.provide(GetTab.layer))
const LateSettings = lateSettings(Draft)
const ExcludedLateSettings = lateSettings(draft(false))
const lateScoped = (name: string, restore?: (model: string) => string) =>
  Component.define({
    name,
    scoped: true,
    model: Late,
    message: Schema.Never,
    elements: Html,
    restore
  }).make({
    init: () => inits++ === 0 ? "server" : "client",
    update: (model) => model,
    view: (text, h) => h.input.value(text)
  })
const LateScoped = lateScoped("LateScoped")
const FilteredLateScoped = lateScoped("FilteredLateScoped", () => "filtered")
const lateHolder = (child: typeof LateScoped) =>
  Component.define({
    name: "LateHolder",
    scoped: false,
    model: Schema.Null,
    message: Schema.Never,
    elements: Html
  }).make({
    init: () => null,
    update: (model) => model,
    view: (_, h) => h.scoped((s) => h.div(child(s, { key: "d" })))
  })
const LateHolder = lateHolder(LateScoped)
const FilteredLateHolder = lateHolder(FilteredLateScoped)
const Field = Component.define({
  name: "Field",
  scoped: true,
  model: Schema.String,
  message: Schema.String,
  elements: Html
}).make({
  init: () => "client",
  update: (_, text) => text,
  view: (text, h) => h.input.value(text).onInput(({ value }) => value)
})
const Group = Component.define({
  name: "Group",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.div(Form(h, { key: "c" }), h.scoped((s) => Field(s, { key: "e" })))
})
const LateCard = Component.define({
  name: "LateCard",
  scoped: false,
  model: Late,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => "client",
  update: (model) => model,
  view: (_, h) => h.div(h.scoped((s) => Field(s, { key: "p" })), Group(h, { key: "g" }))
})
const Card = Component.define({
  name: "Card",
  scoped: true,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({ init: () => null, update: (model) => model, view: (_, h) => h.div(LateCard(h, { key: "l" })) })
const CardHolder = Component.define({
  name: "CardHolder",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.scoped((s) => h.div(Card(s, { key: "d" })))
})
const Outer = Component.define({
  name: "Outer",
  scoped: true,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
})
  .make({
    init: () => null,
    update: (model) => model,
    view: (_, h) => h.scoped((s) => h.div(Draft(s, { key: "d" })))
  })
const Nesting = Component.define({
  name: "Nesting",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.scoped((s) => h.div(Outer(s, { key: "o" })))
})

type Page =
  | "slow form"
  | "slow side"
  | "excluded slow side"
  | "excluded scoped form"
  | "excluded slow form"
  | "excluded vault"
  | "filtered vault"
  | "filtered slow form"
  | "filtered scoped form"
  | "filtered late scoped"
  | "late form"
  | "scoped form"
  | "late settings"
  | "excluded late settings"
  | "nested"
  | "late scoped"
  | "late card"
  | "open card"
  | "open contact"
  | "late contact"
const Routes = Route.union({ Home: Route.make("/"), Next: Route.make("/next"), Away: Route.make("/away") })
const Msg = UiSchema.TaggedEnum({ Changed: { route: Routes }, Go: {}, Next: {}, Went: {} })
const appOf = (page: Page) =>
  Component.define({
    name: "App",
    scoped: false,
    props: Schema.Struct({ route: Routes }),
    model: Routes,
    message: Msg,
    elements: Html
  }).make({
    init: ($) => $.props.route,
    update: (route, message, $) =>
      Msg.match(message, {
        Changed: (changed) => changed.route,
        Go: () => $.run(Router.push(Routes, Routes.Away()).pipe(Command.map(() => Msg.Went()))),
        Next: () => $.run(Router.push(Routes, Routes.Next()).pipe(Command.map(() => Msg.Went()))),
        Went: () => route
      }),
    subscriptions: (route) => [Router.subscription(Routes, route, (changed) => Msg.Changed({ route: changed }))],
    view: (route, h) =>
      h.main(
        page.endsWith("slow side") || (page.startsWith("open") && route._tag === "Home")
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
          : page === "excluded scoped form"
          ? ExcludedHolder(h, { key: "f" })
          : page === "filtered scoped form"
          ? FilteredHolder(h, { key: "f" })
          : page === "filtered late scoped"
          ? FilteredLateHolder(h, { key: "f" })
          : page === "late form"
          ? LateForm(h, { key: "f" })
          : page === "scoped form"
          ? Holder(h, { key: "f" })
          : page === "late settings"
          ? LateSettings(h, { key: "f" })
          : page === "excluded late settings"
          ? ExcludedLateSettings(h, { key: "f" })
          : page === "nested"
          ? Nesting(h, { key: "f" })
          : page === "late scoped"
          ? LateHolder(h, { key: "f" })
          : page === "late card" || page === "open card"
          ? CardHolder(h, { key: "f" })
          : page === "open contact" || page === "late contact"
          ? LateCard(h, { key: "f" })
          : SlowForm(h, { key: "f" })
      )
  })

const editor = (name: string) =>
  Component.define({
    name,
    scoped: false,
    props: Schema.Struct({ open: Schema.Boolean }),
    model: Schema.NullOr(Schema.String),
    message: Schema.NullOr(Schema.String),
    elements: Html
  }).make({
    init: () => "subject",
    update: (_, subject) => subject,
    view: (subject, h) =>
      h.section(
        h.input.value(subject ?? "").onInput(({ value }) => value === "" ? null : value),
        h.props.open ? h.scoped((s) => Draft(s, { key: "d" })) : null
      )
  })
const Editor = editor("Editor")
const SlowEditor = editor("SlowEditor").pipe(Component.provide(slow))
const SlowNesting = Component.define({
  name: "SlowNesting",
  scoped: false,
  props: Schema.Struct({ open: Schema.Boolean }),
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.section(h.scoped(({ props }) => props.open, (s) => Outer(s, { key: "o" })))
}).pipe(Component.provide(slow))
const Shown = Schema.Literals(["none", "closed", "open"])
const DeskMsg = UiSchema.TaggedEnum({ Changed: { route: Routes }, Go: {}, Went: {}, Show: { editor: Shown } })
const deskOf = (waits: boolean, nested: boolean) =>
  Component.define({
    name: "Desk",
    scoped: false,
    props: Schema.Struct({ route: Routes }),
    model: Schema.Struct({ route: Routes, editor: Shown }),
    message: DeskMsg,
    elements: Html
  }).make({
    init: ($) => ({ route: $.props.route, editor: "open" as const }),
    update: (desk, message, $) =>
      DeskMsg.match(message, {
        Changed: ({ route }) => ({ ...desk, route }),
        Go: () => $.run(Router.push(Routes, Routes.Away()).pipe(Command.map(() => DeskMsg.Went()))),
        Went: () => desk,
        Show: ({ editor }) => ({ ...desk, editor })
      }),
    subscriptions: (desk) => [Router.subscription(Routes, desk.route, (route) => DeskMsg.Changed({ route }))],
    view: (desk, h) => {
      if (desk.route._tag === "Away") return h.main("away")
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
    Effect.provide(Router.make({ routes: Routes, history: Router.memoryHistory("/") }))
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
  const { app, open, state } = yield* serve(HtmlServer.renderToHtml(App, props), ready)
  const root = yield* BrowserHost.mountEffect(App, props, app, { state })
  yield* tick
  return { app, root, open }
})
const sit = Effect.fnUntraced(function*(waits: boolean, ready = false, nested = false) {
  const Desk = deskOf(waits, nested)
  const props = Router.props(Routes)
  const { app, open, state } = yield* serve(HtmlServer.renderToHtml(Desk, props), ready)
  const root = yield* BrowserHost.mountEffect(Desk, props, app, { state })
  yield* tick
  return { app, root, open, draft: () => app.querySelectorAll("input")[1]?.value }
})
const Panel = Component.define({
  name: "Panel",
  scoped: false,
  model: Schema.Boolean,
  message: Schema.Boolean,
  elements: Html
}).make({
  init: () => true,
  update: (_, shown) => shown,
  view: (shown, h) => h.main(SlowSide(h, { key: "s" }), shown ? Editor(h, { key: "e", props: { open: true } }) : null)
})
const aside = Effect.fnUntraced(function*(first: Page) {
  const { app, state } = yield* serve(HtmlServer.renderToHtml(Panel, {}), false)
  const other = document.body.appendChild(document.createElement("div"))
  yield* Effect.addFinalizer(() => Effect.sync(() => other.remove()))
  const primary = yield* BrowserHost.mountEffect(appOf(first), Router.props(Routes), other)
  const root = yield* BrowserHost.mountEffect(Panel, {}, app, { state })
  yield* tick
  return { root, go: () => primary.send(Msg.Go()), draft: () => app.querySelectorAll("input")[1]?.value }
})

describe("history restore of a page whose hydration hasn't settled", { concurrent: false }, () => {
  it.effect.each(
    [["excluded vault", "client"], ["filtered vault", "filtered"]] as const
  )("no snapshot holds the server's Model of the children of a %s a push closed as it waited", ([page, saved]) => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app, open, root } = yield* visit(page)
      const values = () => Array.from(app.querySelectorAll("input"), (field) => field.value)
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
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
  })

  it.effect.each(
    [
      ["excluded slow form", "/App/ExcludedSlowForm[f]", undefined, "client"],
      ["filtered slow form", "/App/FilteredSlowForm[f]", "filtered", "filtered"],
      ["excluded scoped form", "/App/Holder[f]/ExcludedScopedForm[d]", undefined, "client"],
      ["filtered scoped form", "/App/Holder[f]/FilteredScopedForm[d]", "filtered", "filtered"],
      ["filtered late scoped", "/App/LateHolder[f]/FilteredLateScoped[d]", undefined, "client"]
    ] as const
  )("a push as a %s waits writes what its restore keeps into the entry", ([page, path, saved, shown]) => {
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
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
  })

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
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
  })

  it.effect("Back restores the server's Model of a scoped child whose state still decodes after that Back", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app, open, root } = yield* visit("late scoped")
      root.send(Msg.Go())
      yield* tick
      history.go(-1)
      yield* tick
      yield* open
      yield* tick
      assert.strictEqual(app.querySelector("input")!.value, "server")
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
  })

  it.effect("Back restores a scoped child drawn by a scoped child", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app, root } = yield* visit("nested", true)
      root.send(Msg.Go())
      yield* tick
      history.go(-1)
      yield* tick
      assert.strictEqual(app.querySelector("input")!.value, "server")
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
  })

  it.effect.each(
    ["slow form", "scoped form"] as const
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
      }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
    }
  )

  it.effect("a scoped child with restore: false the server kept undrawn starts from the server's Model when first drawn", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const { app } = yield* visit("excluded late settings", true)
      assert.notInclude(app.innerHTML, "input")
      app.querySelector("button")!.click()
      yield* tick
      assert.strictEqual(app.querySelector("input")!.value, "server")
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
  })

  it.effect("Back runs a scoped child the server kept undrawn from init when a push closed its author as its state decoded", () => {
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
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
  })

  it.effect("a second Back runs a scoped child the server kept undrawn from init, after a push closed its author as it waited", () => {
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
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
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
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
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
      }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
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
        const go = (message: typeof Msg.Type) => Effect.suspend(() => (root.send(message), tick))
        const back = Effect.suspend(() => (history.go(-1), tick))
        yield* type(["phone", "name", "email"])
        const typed = crossing === "Back" ? ["", "Mira", "mira"] : ["phone", "name", "email"]
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
      }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
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
      }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
    }
  )

  it.effect("Back restores none of a scoped child a push closed with its waiting author, when its predicate is false at that Back", () => {
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
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
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
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
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
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
  })

  it.effect("Back runs a scoped child an author drew as a push closed it waiting from init, drawn again after the Back settles", () => {
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
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
  })

  it.effect("Back restores a scoped child a push closed with its waiting author once: an author made again at its key starts it afresh", () => {
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
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
  })

  it.effect("Back restores a scoped child of an author made before the Back settles", () => {
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
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
  })

  it.effect("Back restores no scoped child of an author made after it settled, in a root that still hydrates", () => {
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
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
  })

  it.effect("Back restores a scoped child once, in a root that still hydrates: an author made again at its key starts it afresh", () => {
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
    }).pipe(Effect.scoped, Effect.provide(Router.make({ routes: Routes, history })))
  })
})
