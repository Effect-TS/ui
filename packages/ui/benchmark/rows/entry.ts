import { Component, Head, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlServer } from "@effect/ui/html"
import { Effect, Exit, Schema, Scope } from "effect"
import { init, install, update } from "./harness.ts"
import type { Model as TableModel } from "./harness.ts"

// The keyed table of js-framework-benchmark (krausest), on @effect/ui. Four variants render the same
// DOM (see harness.ts):
//
//   plain      every row is plain elements in the table's own view: one component in total.
//   lazy       plain, with each row behind `h.lazy`: a row whose row and selection are the same isn't
//              built again or patched.
//   component  a child component per row (key + props), which skips rendering when its props are equal.
//   titled     component, with a title in the table's head: the head is folded after each render.

const Row = Schema.Struct({ id: Schema.Number, label: Schema.String })
const Model = Schema.Struct({ rows: Schema.Array(Row), selected: Schema.Number, nextId: Schema.Number })
const Message = UiSchema.TaggedEnum({
  Run: { count: Schema.Number },
  Add: { count: Schema.Number },
  Update: {},
  Clear: {},
  Swap: {},
  Select: { id: Schema.Number },
  Remove: { id: Schema.Number }
})

const app = { name: "Table", scoped: false, model: Model, message: Message, elements: Html } as const
const TableDef = Component.define(app)

const lazyRow = (h: Component.Helper<typeof TableDef>, row: typeof Row.Type, selected: boolean) =>
  h.tr.key(String(row.id)).class(selected && "danger").children(
    h.td.class("col-md-1").children(String(row.id)),
    h.td.class("col-md-4").children(
      h.a.onClick(Message.Select({ id: row.id })).children(row.label)
    ),
    h.td.class("col-md-1").children(
      h.a.onClick(Message.Remove({ id: row.id })).children(
        h.span.class("glyphicon", "glyphicon-remove").attr("aria-hidden", "true")
      )
    ),
    h.td.class("col-md-6")
  )

const RowMessage = UiSchema.TaggedEnum({ Select: {}, Remove: {} })
const RowView = Component.define({
  name: "Row",
  scoped: false,
  props: Schema.Struct({ row: Row, selected: Schema.Boolean }),
  model: Schema.Null,
  message: RowMessage,
  events: Message,
  elements: Html
}).make({
  init: () => null,
  update: (_, message, $) =>
    $.emit(
      message._tag === "Select"
        ? Message.Select({ id: $.props.row.id })
        : Message.Remove({ id: $.props.row.id })
    ),
  view: (_, h) =>
    h.tr.class(h.props.selected && "danger").children(
      h.td.class("col-md-1").children(String(h.props.row.id)),
      h.td.class("col-md-4").children(h.a.onClick(RowMessage.Select()).children(h.props.row.label)),
      h.td.class("col-md-1").children(
        h.a.onClick(RowMessage.Remove()).children(
          h.span.class("glyphicon", "glyphicon-remove").attr("aria-hidden", "true")
        )
      ),
      h.td.class("col-md-6")
    )
})

const componentRows = (model: TableModel, h: Component.Helper<typeof TableDef>) =>
  h.table.class("table").children(
    h.tbody.children(model.rows.map((row) =>
      RowView(h, {
        key: String(row.id),
        props: { row, selected: row.id === model.selected },
        onEmit: (message) => message
      })
    ))
  )

/** The variants' table components, starting from `start`'s Model. */
const tables = (start: () => TableModel) => ({
  plain: Component.define(app).make({
    init: start,
    update,
    view: (model, h) =>
      h.table.class("table").children(
        h.tbody.children(model.rows.map((row) =>
          h.tr.key(String(row.id)).class(row.id === model.selected && "danger").children(
            h.td.class("col-md-1").children(String(row.id)),
            h.td.class("col-md-4").children(
              h.a.onClick(Message.Select({ id: row.id })).children(row.label)
            ),
            h.td.class("col-md-1").children(
              h.a.onClick(Message.Remove({ id: row.id })).children(
                h.span.class("glyphicon", "glyphicon-remove").attr("aria-hidden", "true")
              )
            ),
            h.td.class("col-md-6")
          )
        ))
      )
  }),
  lazy: TableDef.make({
    init: start,
    update,
    view: (model, h) =>
      h.table.class("table").children(
        h.tbody.children(model.rows.map((row) => h.lazy(lazyRow, row, row.id === model.selected)))
      )
  }),
  component: TableDef.make({ init: start, update, view: componentRows }),
  titled: TableDef.make({ init: start, update, head: () => [Head.title("Rows")], view: componentRows })
})

type Table = ReturnType<typeof tables>["plain"]

const mount = (component: Table) => async (container: HTMLElement) => {
  const scope = Effect.runSync(Scope.make())
  const root = await Effect.runPromise(Scope.provide(BrowserHost.mountEffect(component, {}, container), scope))
  return {
    send: (message: typeof Message.Type) => root.send(message),
    close: () => Effect.runPromise(Scope.close(scope, Exit.void))
  }
}

const empty = tables(init)
install({
  plain: mount(empty.plain),
  lazy: mount(empty.lazy),
  component: mount(empty.component),
  titled: mount(empty.titled)
})

// -- server rendering and hydration ---------------------------------------------------------------
// The same tables, starting with 1,000 rows. `ssr` renders one on the server (renderToHtml, then
// serializeState), puts the HTML in a container and hydrates it until `adopted`: both in milliseconds.

const full = tables(() => update(init(), { _tag: "Run", count: 1000 }))
const check = (condition: boolean, message: string) => {
  if (!condition) throw new Error("bench check failed: " + message)
}
type VariantName = keyof typeof full
const renderTable = async (name: VariantName, profile = false) => {
  const component = full[name]
  if (profile) console.profile("render")
  const start = performance.now()
  const rendered = await Effect.runPromise(HtmlServer.renderToHtml(component, {}, { budget: 0 }))
  const json = HtmlServer.serializeState(rendered.state)
  const render = performance.now() - start
  if (profile) console.profileEnd("render")
  return { html: rendered.html, json, render }
}
const hydrateTable = async (
  name: VariantName,
  { html, json }: Awaited<ReturnType<typeof renderTable>>,
  profile = false
) => {
  const component = full[name]
  const container = document.body.appendChild(document.createElement("div"))
  container.innerHTML = html
  const first = container.querySelector("tr")
  check(container.querySelectorAll("tr").length === 1000, "the server rendered every row")
  const state = JSON.parse(json)
  const scope = Effect.runSync(Scope.make())
  if (profile) console.profile("hydrate")
  const start = performance.now()
  const root = await Effect.runPromise(
    Scope.provide(BrowserHost.mountEffect(component, {}, container, { state }), scope)
  )
  await Effect.runPromise(root.adopted)
  const hydrate = performance.now() - start
  if (profile) console.profileEnd("hydrate")
  check(container.querySelector("tr") === first && container.querySelectorAll("tr").length === 1000, "adopted")
  await Effect.runPromise(Scope.close(scope, Exit.void))
  container.remove()
  return hydrate
}
;(window as any).renderTable = renderTable
;(window as any).hydrateTable = hydrateTable
;(window as any).ssr = async (name: VariantName, profile = false) => {
  const fixture = await renderTable(name, profile)
  return { render: fixture.render, hydrate: await hydrateTable(name, fixture, profile) }
}
