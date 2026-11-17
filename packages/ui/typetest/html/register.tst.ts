// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"
import { Component, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

describe("@effect/ui/html/register", () => {
  it("types reusable pure views with Component.H", () => {
    const button = <Msg>(h: Component.H<Msg>, message: Msg) => {
      expect(h.props).type.toBe<unknown>()
      expect(h.button).type.toBe<Html.Tags<Msg>["button"]>()
      return h.button.onClick(message).children("Save")
    }
    Component.define({
      name: "SaveButton",
      props: Schema.Struct({ id: Schema.String }),
      model: Schema.Number,
      message: Schema.Literal("Save")
    }).view((_, h) => {
      expect(button<"Save">).type.not.toBeCallableWith(h, "Delete")
      return button(h, "Save")
    })
  })

  it("declares Html as the registered vocabulary", () => {
    expect<View.Registered>().type.toBe<Html.Elements>()
  })

  it("gives a component without `elements` the HTML tags", () => {
    const label = (h: Component.H, text: string) => {
      expect(h.span).type.toBe<Html.Tags<never>["span"]>()
      return h.span(text)
    }
    Component.define({
      name: "Greeting",
      model: Schema.Struct({}),
      message: Schema.Never
    }).make({
      init: () => ({}),
      update: (model) => model,
      view: (_, h) => {
        expect(h.p).type.toBe<Html.Tags<never>["p"]>()
        return h.p(label(h, "Hello"))
      }
    })
  })
})

const Msg = Schema.Literal("Click")
type Msg = typeof Msg.Type
class Clock extends Context.Service<Clock, {}>()("Clock") {}
class Logger extends Context.Service<Logger, {}>()("Logger") {}

it("shared wrappers preserve unspread options.children requirements across components", () => {
  const Card = <M>(h: Component.H<M>) => h.section.class("card")
  const Field = <M, C extends View.Children<M>>(h: Component.H<M>, options: {
    readonly label: string
    readonly children: C
  }) => h.label.children(options.label, h.div.class("control").children(options.children))
  const Page = Component.define({ name: "Page", model: Schema.Null, message: Msg, elements: Html }).make({
    init: () => null,
    update: (model) => model,
    view: (_, h) => {
      const clock = {} as View.Node<Msg, Clock>
      const logger = {} as View.Node<Msg, Logger>
      expect(Field(h, { label: "Empty", children: [] })).type.toBe<View.Element<Msg, never>>()
      expect(Field(h, { label: "Text", children: ["text", false, null, undefined, h.br] })).type.toBe<
        View.Element<Msg, never>
      >()
      const children = [clock, logger] as const
      expect(Field(h, { label: "Services", children })).type.toBe<View.Element<Msg, Clock | Logger>>()
      return Card(h).children(Field(h, { label: "Services", children: [clock, logger] }))
    }
  })
  expect<Component.Requirements<typeof Page>>().type.toBe<Clock | Logger>()
  const Other = Component.define({
    name: "Other",
    props: Schema.Struct({ title: Schema.String }),
    model: Schema.Null,
    message: Schema.String,
    elements: Html
  }).make({
    init: () => null,
    update: (model) => model,
    view: (_, h) =>
      Field(h, { label: h.props.title, children: [h.button.onClick("clicked"), {} as View.Node<string, Logger>] })
  })
  expect<Component.Requirements<typeof Other>>().type.toBe<Logger>()
})
