/**
 * The js-framework-benchmark operations from
 * `packages/ui/benchmark/js-framework-benchmark`, on native views.
 */
import type * as Component from "@effect/ui/Component"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { reduce, type Row } from "./rows.ts"
import * as Spike from "./Spike.ts"

const Model = Schema.Struct({
  rows: Schema.Array(
    Schema.Struct({ id: Schema.Number, label: Schema.String })
  ),
  selected: Schema.Number,
  nextId: Schema.Number
})
type Model = typeof Model.Type

export const Message = UiSchema.TaggedEnum({
  Run: {},
  RunLots: {},
  Add: {},
  Update: {},
  Clear: {},
  SwapRows: {},
  Select: { id: Schema.Number },
  Remove: { id: Schema.Number }
})
type Message = typeof Message.Type

const update = (
  { model }: { readonly model: Model },
  message: Message
): Model => reduce(model, message)

const BenchDef = Spike.component({
  name: "Bench",
  model: Model,
  message: Message
})
type H = Component.Helper<typeof BenchDef>

const button = (h: H, title: string, message: Message) =>
  h.view.prop("style", {
    backgroundColor: "#2563eb",
    padding: 8,
    borderRadius: 4
  }).on("press", message).children(
    h.text.prop("style", { color: "white" }).children(title)
  )

const row = (h: H, row: Row, selected: boolean) =>
  h.view.key(String(row.id)).prop("style", {
    flexDirection: "row",
    padding: 6,
    backgroundColor: selected ? "#fde68a" : undefined
  }).children(
    h.text.prop("style", { width: 60 }).children(String(row.id)),
    h.text.prop("style", { flex: 1 }).on(
      "press",
      Message.Select({ id: row.id })
    ).children(row.label),
    h.text.on("press", Message.Remove({ id: row.id })).children("x")
  )

export const Bench = BenchDef.make({
  init: () => ({ rows: [], selected: 0, nextId: 1 }),
  update,
  view: (h, model) =>
    h.view.prop("style", { flex: 1, backgroundColor: "white", paddingTop: 48 })
      .children(
        h.view.prop("style", {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 6,
          padding: 6
        }).children(
          button(h, "Create 1,000", Message.Run()),
          button(h, "Create 10,000", Message.RunLots()),
          button(h, "Append 1,000", Message.Add()),
          button(h, "Update 10th", Message.Update()),
          button(h, "Swap", Message.SwapRows()),
          button(h, "Clear", Message.Clear())
        ),
        h.scroll.prop("style", { flex: 1 }).children(
          model.rows.map((item) =>
            h.lazy(row, item, item.id === model.selected)
          )
        )
      )
})
