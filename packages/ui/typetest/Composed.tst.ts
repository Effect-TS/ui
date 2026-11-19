import { Component, Composed, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Option, Schema } from "effect"
import { expect, it } from "tstyche"

const RowMessage = UiSchema.TaggedEnum({ Typed: { value: Schema.String } })
const Row = Component.define({
  name: "Row",
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Struct({ draft: Schema.String }),
  message: RowMessage,
  elements: Html
}).make({
  init: () => ({ draft: "" }),
  update: (_model, message) => ({ draft: message.value }),
  view: (model, h) => h.p(model.draft)
})

const Badge = Component.define({
  name: "Badge",
  props: Schema.Struct({ label: Schema.String }),
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({ init: () => ({}), update: (model) => model, view: (_, h) => h.span(h.props.label) })

const ListMessage = UiSchema.TaggedEnum({ Cleared: { id: Schema.String } })
const ListDef = Component.define({
  name: "List",
  model: Schema.Struct({ ids: Schema.Array(Schema.String) }),
  message: ListMessage,
  elements: Html
})
const rows = {
  component: Row,
  each: (model: { readonly ids: ReadonlyArray<string> }) => model.ids.map((id) => ({ key: id, props: { id } }))
}
const init = () => ({ ids: ["a"] })

it("places a child with state from children and one without from h.place", () => {
  const List = Composed.make(ListDef, {
    children: { rows },
    init,
    update: (model, message, $) =>
      Option.match($.children.rows.at(message.id), {
        onNone: () => model,
        onSome: (row) => {
          expect(row.model).type.toBe<{ readonly draft: string }>()
          row.send(RowMessage.Typed({ value: "" }))
          return model
        }
      }),
    view: (_model, h) =>
      h.div(
        h.place(Badge, { key: "badge", props: { label: "rows" } }),
        ...h.children.rows.all().map(([, row]) => row),
        Option.getOrNull(h.children.rows.at("a"))
      )
  })
  expect<Component.Model<typeof List>["children"]["rows"]>().type.toBe<ReadonlyArray<Composed.Entry<typeof Row>>>()
})

it("rejects a component with a Model that a view declares", () => {
  Composed.make(ListDef, {
    children: { rows },
    init,
    update: (model) => model,
    view: (_model, h) => {
      // @ts-expect-error Property 'el' is missing
      Row(h, { key: "a", props: { id: "a" } })
      // @ts-expect-error Property '"a component with a Model is declared in `children`"' is missing
      h.place(Row, { key: "a", props: { id: "a" } })
      return h.div()
    }
  })
})

it("rejects a name that children doesn't declare", () => {
  Composed.make(ListDef, {
    children: { rows },
    init,
    update: (model, _message, $) => {
      // @ts-expect-error Property 'cells' does not exist on type 'Handles<
      void $.children.cells
      return model
    },
    view: (_model, h) => {
      // @ts-expect-error Property 'cells' does not exist on type 'Places<
      void h.children.cells
      return h.div()
    }
  })
})

it("rejects a keyed child that is placed or sent to without its absent case", () => {
  Composed.make(ListDef, {
    children: { rows },
    init,
    update: (model, message, $) => {
      // @ts-expect-error Property 'send' does not exist on type 'Option<Handle<
      $.children.rows.at(message.id).send(RowMessage.Typed({ value: "" }))
      return model
    },
    // @ts-expect-error Argument of type 'Option<Node<
    view: (_model, h) => h.div(h.children.rows.at("a"))
  })
})
