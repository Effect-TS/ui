import { Component, type View } from "@effect/ui"
import { BrowserHost, Html, HtmlServer } from "@effect/ui/html"
import { Effect, Exit, Schema, Scope } from "effect"

const Row = Schema.Struct({ id: Schema.String, label: Schema.String, done: Schema.Boolean })
type Row = typeof Row.Type
const AppProps = Schema.Struct({ count: Schema.Number })
const AppMessage = Schema.TaggedUnion({ Toggle: { id: Schema.String }, Reverse: {} })
type AppMessage = typeof AppMessage.Type
const Flip = Schema.TaggedUnion({ Flip: {} })
const flip = Flip.make({ _tag: "Flip" })

const init = ($: { readonly props: { readonly count: number } }): ReadonlyArray<Row> =>
  Array.from({ length: $.props.count }, (_, i) => ({ id: "r" + i, label: "Row " + i, done: false }))
const update = (rows: ReadonlyArray<Row>, message: AppMessage): ReadonlyArray<Row> =>
  AppMessage.match(message, {
    Toggle: ({ id }) => rows.map((row) => row.id === id ? { ...row, done: !row.done } : row),
    Reverse: () => [...rows].reverse()
  })
const app = { name: "App", props: AppProps, model: Schema.Array(Row), message: AppMessage, elements: Html } as const

// Every variant renders the same row:
// li.row[data-done] > button[aria-expanded][aria-controls] + span + div#panel[hidden]

/** Rows as plain elements of the list's own view. */
const Plain = Component.define(app).make({
  init,
  update,
  view: (rows, h) =>
    h.ul.children(rows.map((row) =>
      h.li.key(row.id).class("row").attr("data-done", row.done ? "" : undefined).children(
        h.button.attr("aria-expanded", "false").attr("aria-controls", h.id("panel", row.id))
          .onClick(AppMessage.make({ _tag: "Toggle", id: row.id })).children(row.label),
        h.span(row.done ? "done" : "todo"),
        h.div.id(h.id("panel", row.id)).attr("hidden", "").children("details")
      )
    ))
})

/** A normal child per row: it owns the markup, and skips when its props are the same. */
const NormalRow = Component.define({
  name: "Row",
  props: Schema.Struct({ row: Row }),
  model: Schema.Boolean,
  message: Flip,
  elements: Html
}).make({
  init: () => false,
  update: (open) => !open,
  view: (open, h) =>
    h.li.class("row").attr("data-done", h.props.row.done ? "" : undefined).children(
      h.button.attr("aria-expanded", String(open)).attr("aria-controls", h.id("panel")).onClick(flip)
        .children(h.props.row.label),
      h.span(h.props.row.done ? "done" : "todo"),
      h.div.id(h.id("panel")).attr("hidden", open ? undefined : "").children("details")
    )
})
const Normal = Component.define(app).make({
  init,
  update,
  view: (rows, h) => h.ul.children(rows.map((row) => NormalRow(h, { key: row.id, props: { row } })))
})

/** The same disclosure, headless: the list's closure owns the markup. */
const Disclosure = Component.define({ name: "Disclosure", model: Schema.Boolean, message: Flip, elements: Html }).make({
  init: () => false,
  update: (open) => !open,
  parts: (open, p) => ({
    open,
    trigger: p.part(
      "button",
      (b) => b.attr("aria-expanded", String(open)).attr("aria-controls", p.id("panel")).onClick(flip)
    ),
    panel: p.part("div", (b) => b.id(p.id("panel")).attr("hidden", open ? undefined : ""))
  })
})
const Headless = Component.define(app).make({
  init,
  update,
  view: (rows, h) =>
    h.ul.children(rows.map((row) =>
      Disclosure(h, {
        key: row.id,
        view: (d) =>
          h.li.class("row").attr("data-done", row.done ? "" : undefined).children(
            d.trigger(h.button).children(row.label),
            h.span(row.done ? "done" : "todo"),
            d.panel(h.div).children("details")
          )
      })
    ))
})

/** The proposal's advice: a normal row component around the headless child, so the skip happens above the closure. */
const WrappedRow = Component.define({
  name: "Row",
  props: Schema.Struct({ row: Row }),
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) =>
    Disclosure(h, {
      key: "d",
      view: (d) =>
        h.li.class("row").attr("data-done", h.props.row.done ? "" : undefined).children(
          d.trigger(h.button).children(h.props.row.label),
          h.span(h.props.row.done ? "done" : "todo"),
          d.panel(h.div).children("details")
        )
    })
})
const Wrapped = Component.define(app).make({
  init,
  update,
  view: (rows, h) => h.ul.children(rows.map((row) => WrappedRow(h, { key: row.id, props: { row } })))
})

// -- under an owner of shared state ---------------------------------------------------------------
// The same rows inside a Provider's `view` closure. Every Provider update re-runs the closure, so
// these measure what a Provider update costs with each shape of subtree under it. `touch` changes
// the Provider's Model but not what it shares; `open` changes what it shares.

const ProviderMessage = Schema.TaggedUnion({ Touch: {}, Open: { id: Schema.String } })
const Provider = Component.define({
  name: "Provider",
  model: Schema.Struct({ open: Schema.NullOr(Schema.String), touches: Schema.Number }),
  message: ProviderMessage,
  receives: ["Touch", "Open"],
  shares: (model) => ({ open: model.open }),
  elements: Html
}).make({
  init: () => ({ open: null, touches: 0 }),
  update: (model, message) =>
    ProviderMessage.match(message, {
      Touch: () => ({ ...model, touches: model.touches + 1 }),
      Open: ({ id }) => ({ ...model, open: model.open === id ? null : id })
    }),
  parts: (model) => model
})

/** Sends to the Provider from inside its closure: a normal component with no props, so it's skipped. */
const Poker = Component.define({ name: "Poker", model: Schema.Null, message: ProviderMessage, elements: Html })
  .make({
    init: () => null,
    update: (model, message, $) => $.set(model).send(Provider, message),
    view: (_, h) =>
      h.div(
        h.button.class("poke-touch").onClick(ProviderMessage.make({ _tag: "Touch" })).children("touch"),
        h.button.class("poke-open").onClick(ProviderMessage.make({ _tag: "Open", id: "r0" })).children("open")
      )
  })

const AppDef = Component.define(app)
type H = Component.Helper<typeof AppDef>

/** What every owner variant puts around its rows: the Provider, its state, and the Poker. */
const underProvider = <RV>(h: H, rows: () => View.Content<AppMessage, RV>) =>
  Provider(h, {
    key: "tips",
    view: (state) =>
      h.div(
        h.span.class("touches").children(String(state.touches)),
        h.span.class("open").children(String(state.open)),
        Poker(h, { key: "poke" }),
        rows()
      )
  })

/** headless rows written straight into the Provider's closure: every Provider update re-renders each. */
const OwnerHeadless = Component.define(app).make({
  init,
  update,
  view: (rows, h) =>
    underProvider(h, () =>
      h.ul.children(rows.map((row) =>
        Disclosure(h, {
          key: row.id,
          view: (d) =>
            h.li.class("row").attr("data-done", row.done ? "" : undefined).children(
              d.trigger(h.button).children(row.label),
              h.span(row.done ? "done" : "todo"),
              d.panel(h.div).children("details")
            )
        })
      )))
})

/** A normal row component per row in the closure: each is skipped on equal props. */
const OwnerWrapped = Component.define(app).make({
  init,
  update,
  view: (rows, h) =>
    underProvider(h, () => h.ul.children(rows.map((row) => WrappedRow(h, { key: row.id, props: { row } }))))
})

/** The guidance: one normal component directly under the Provider, holding the headless rows. */
const Body = Component.define({
  name: "Body",
  props: Schema.Struct({ rows: Schema.Array(Row) }),
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) =>
    h.ul.children(h.props.rows.map((row) =>
      Disclosure(h, {
        key: row.id,
        view: (d) =>
          h.li.class("row").attr("data-done", row.done ? "" : undefined).children(
            d.trigger(h.button).children(row.label),
            h.span(row.done ? "done" : "todo"),
            d.panel(h.div).children("details")
          )
      })
    ))
})
const OwnerBoundary = Component.define(app).make({
  init,
  update,
  view: (rows, h) => underProvider(h, () => Body(h, { key: "body", props: { rows } }))
})

/** Wrapped rows that each read the Provider: every row re-renders when what it shares changes. */
const ReaderRow = Component.define({
  name: "Row",
  props: Schema.Struct({ row: Row }),
  model: Schema.Null,
  message: Schema.Never,
  shared: { provider: Provider },
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) =>
    Disclosure(h, {
      key: "d",
      view: (d) =>
        h.li.class("row").attr("data-done", h.props.row.done ? "" : undefined)
          .attr("data-open", h.shared.provider.open === h.props.row.id ? "" : undefined).children(
            d.trigger(h.button).children(h.props.row.label),
            h.span(h.props.row.done ? "done" : "todo"),
            d.panel(h.div).children("details")
          )
    })
})
const OwnerReaders = Component.define(app).make({
  init,
  update,
  view: (rows, h) =>
    underProvider(h, () => h.ul.children(rows.map((row) => ReaderRow(h, { key: row.id, props: { row } }))))
})

const variants = {
  plain: Plain,
  normal: Normal,
  headless: Headless,
  wrapped: Wrapped,
  "owner-headless": OwnerHeadless,
  "owner-wrapped": OwnerWrapped,
  "owner-boundary": OwnerBoundary,
  "owner-readers": OwnerReaders
}

// -- what a figure is --------------------------------------------------------------------------
// Wall-clock time on an otherwise idle page, from just before the message is sent (or the mount
// starts) to the first microtask after the render flush. The flush itself runs on a microtask, so
// that covers `update`, the hop to the flush, the views, the diff, the DOM writes and the commit
// hooks. It is not render CPU time in isolation. The timestamp is taken before the DOM is read to
// confirm the change, so that read is outside the figure, and nothing here forces layout or paint.
const task = () =>
  new Promise<void>((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => resolve()
    channel.port2.postMessage(0)
  })
let hops = 0
/**
 * When `done` first held: after one microtask, or else after as few tasks as it takes. A figure
 * that needed a task has a failed read of the DOM and the wait for the task in it, so `hops`
 * counts those and an update that needed one fails the run.
 */
const settle = async (done: () => boolean, label = ""): Promise<number> => {
  // Not `await null`: the linter's fix removes an await of a value that is no promise.
  await Promise.resolve()
  let end = performance.now()
  if (done()) return end
  for (let i = 0; i < 200; i++) {
    await task()
    hops++
    end = performance.now()
    if (done()) return end
  }
  throw new Error("bench: the change never rendered: " + label + " :: " + document.body.innerHTML.slice(0, 600))
}
const check = (condition: boolean, message: string) => {
  if (!condition) throw new Error("bench check failed: " + message)
}
const median = (values: Array<number>) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]

const pass = async (name: keyof typeof variants, count: number, repeats: number) => {
  const App = variants[name]
  hops = 0
  const container = document.body.appendChild(document.createElement("div"))
  const scope = Effect.runSync(Scope.make())
  const rows = () => container.querySelectorAll("li.row")
  const done = () => container.querySelectorAll("li.row[data-done]").length
  let start = performance.now()
  const root = await Effect.runPromise(Scope.provide(BrowserHost.mountEffect(App, { count }, container), scope))
  const mount = (await settle(() => rows().length === count, name + " mount")) - start
  const mountHops = hops
  hops = 0

  const toggle: Array<number> = []
  for (let i = 0; i < repeats; i++) {
    const id = "r" + ((i * 37) % count)
    const before = done()
    start = performance.now()
    root.send(AppMessage.make({ _tag: "Toggle", id }))
    toggle.push((await settle(() => Math.abs(done() - before) === 1, name + " toggle")) - start)
  }
  const reverse: Array<number> = []
  for (let i = 0; i < repeats; i++) {
    const first = rows()[0]
    start = performance.now()
    root.send(AppMessage.make({ _tag: "Reverse" }))
    reverse.push((await settle(() => rows()[count - 1] === first, name + " reverse")) - start)
    check(rows().length === count, "every row is still there")
  }
  // A click on one row's button: the child's own state everywhere but in the plain list.
  const click: Array<number> = []
  for (let i = 0; i < repeats; i++) {
    const row = rows()[(i * 53) % count]
    const before = row.outerHTML
    start = performance.now()
    row.querySelector("button")!.click()
    click.push((await settle(() => row.outerHTML !== before, name + " click")) - start)
  }
  // A Provider update from the Poker: one that keeps what it shares, then one that changes it.
  const touch: Array<number> = []
  const open: Array<number> = []
  const poke = container.querySelector<HTMLButtonElement>("button.poke-touch")
  if (poke !== null) {
    const touches = () => container.querySelector(".touches")!.textContent
    const opened = () => container.querySelector(".open")!.textContent
    for (let i = 0; i < repeats; i++) {
      const before = touches()
      start = performance.now()
      poke.click()
      touch.push((await settle(() => touches() !== before, name + " touch")) - start)
    }
    for (let i = 0; i < repeats; i++) {
      const before = opened()
      start = performance.now()
      container.querySelector<HTMLButtonElement>("button.poke-open")!.click()
      open.push((await settle(() => opened() !== before, name + " open")) - start)
      if (name === "owner-readers") {
        check(container.querySelectorAll("li.row[data-open]").length === (opened() === "r0" ? 1 : 0), "readers follow")
      }
    }
  }
  const updateHops = hops
  check(updateHops === 0, name + ": an update rendered later than the first microtask")
  await Effect.runPromise(Scope.close(scope, Exit.void))
  container.remove()

  const rendered = await Effect.runPromise(HtmlServer.renderToHtml(App, { count }) as Effect.Effect<any>)
  const target = document.body.appendChild(document.createElement("div"))
  target.innerHTML = rendered.html
  check(target.querySelectorAll("li.row").length === count, "the server rendered every row")
  const firstRow = target.querySelector("li.row")!
  const hydrateScope = Effect.runSync(Scope.make())
  start = performance.now()
  const hydrated = await Effect.runPromise(
    Scope.provide(BrowserHost.mountEffect(App, { count }, target, { state: rendered.state }), hydrateScope)
  )
  await Effect.runPromise(hydrated.adopted)
  const hydrate = performance.now() - start
  check(target.querySelector("li.row") === firstRow && target.querySelectorAll("li.row").length === count, "adopted")
  // Live after hydration: the first row's button answers.
  const before = firstRow.outerHTML
  firstRow.querySelector("button")!.click()
  await settle(() => firstRow.outerHTML !== before, name + " hydrated click")
  await Effect.runPromise(Scope.close(hydrateScope, Exit.void))
  target.remove()
  return {
    mount,
    hydrate,
    toggle: median(toggle),
    reverse: median(reverse),
    click: median(click),
    touch: touch.length === 0 ? undefined : median(touch),
    open: open.length === 0 ? undefined : median(open),
    mountHops,
    updateHops
  }
}
;(window as any).bench = async (name: keyof typeof variants, count: number) => {
  await pass(name, count, 5)
  return pass(name, count, 21)
}
