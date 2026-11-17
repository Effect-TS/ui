import { Component, Feature, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Context, Effect, Layer, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, { readonly now: number }>()("typetest/slots/Clock") {}
class Store extends Context.Service<Store, { readonly draft: string }>()("typetest/slots/Store") {}

const PanelMsg = Schema.TaggedUnion({ Toggle: {} })
const PanelDef = Component.define({
  name: "Panel",
  model: Schema.Boolean,
  message: PanelMsg,
  elements: Html,
  slots: ["body", "footer"]
})
const Panel = PanelDef.make({
  init: () => true,
  update: (open) => !open,
  view: (open, h) => h.section(open && h.slots.body, h.footer(h.slots.footer))
})

const Plain = Component.define({ name: "Plain", model: Schema.Null, message: Schema.Never, elements: Html }).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.p("plain")
})

// Needs Clock to render.
declare const Ticker: Component.Component<"Ticker", {}, null, never, never, Clock>

const PageMsg = Schema.TaggedUnion({ Saved: {} })
type PageMsg = typeof PageMsg.Type
const OtherMsg = Schema.TaggedUnion({ Other: {} })
declare const h: View.Helper<PageMsg, unknown> & View.Tags<Html.Elements, PageMsg>
declare const other: View.Helper<typeof OtherMsg.Type, unknown> & View.Tags<Html.Elements, typeof OtherMsg.Type>

declare const either: { readonly body: View.Child<PageMsg, Clock> } | { readonly footer: string }
declare const stray: { readonly body: string } | { readonly header: string }
declare const undeclared: { readonly header: string }
declare const extra: { readonly body: string; readonly header: string }
interface SlotMap {
  readonly body: View.Child<PageMsg, Clock>
}
declare const interfaceSlots: SlotMap
interface ExtraMap {
  readonly body: string
  readonly header: string
}
declare const interfaceExtra: ExtraMap

describe("slots", () => {
  it("types h.slots in the view, fragments and Component.Helper", () => {
    PanelDef.view((_, h) => {
      expect(h.slots).type.toBe<{ readonly body: View.Outlet; readonly footer: View.Outlet }>()
      return h.slots.body
    })
    PanelDef.fragment((h) => expect(h.slots.footer).type.toBe<View.Outlet>())
    expect<Component.Helper<typeof PanelDef>["slots"]>().type.toBe<
      { readonly body: View.Outlet; readonly footer: View.Outlet }
    >()
    Component.define({ name: "None", model: Schema.Null, message: Schema.Never }).view((_, h) => {
      expect(h).type.not.toHaveProperty("slots")
      return h.el("p")
    })
    expect<Component.Slots<typeof Panel>>().type.toBe<"body" | "footer">()
    expect<Component.Slots<typeof Plain>>().type.toBe<never>()
  })

  it("takes content for declared slots, written with the parent's h", () => {
    expect(Panel(h, { key: "p" })).type.toBe<View.Child<PageMsg, never>>()
    expect(Panel(h, {
      key: "p",
      slots: { body: [h.p("note"), h.button.onClick(PageMsg.make({ _tag: "Saved" })).children("save")] }
    })).type.toBe<View.Child<PageMsg, never>>()
    expect(Panel(h, { key: "p", slots: { body: "text", footer: Plain(h, { key: "x" }) } })).type.not.toRaiseError()
  })

  it("rejects slots on a component without any, undeclared names and another component's messages", () => {
    expect(Plain).type.not.toBeCallableWith(h, { key: "x", slots: { body: "text" } })
    expect(Panel).type.not.toBeCallableWith(h, { key: "p", slots: { header: "text" } })
    expect(Panel).type.not.toBeCallableWith(h, {
      key: "p",
      slots: { body: other.button.onClick(OtherMsg.make({ _tag: "Other" })).children("x") }
    })
  })

  it("maps a content child's events and failures to the parent's messages", () => {
    const Note = Component.define({
      name: "Note",
      model: Schema.Null,
      message: Schema.Never,
      events: Schema.TaggedUnion({ Typed: {} }),
      elements: Html
    }).make({ init: () => null, update: (model) => model, view: (_, h) => h.p("note") })
    const saved = PageMsg.make({ _tag: "Saved" })
    expect(Panel(h, {
      key: "p",
      slots: { body: Note(h, { key: "n", onEmit: () => saved, onFailure: () => saved }) }
    })).type.toBe<View.Child<PageMsg, never>>()
    expect(Panel).type.not.toBeCallableWith(h, {
      key: "p",
      slots: { body: Note(other, { key: "n", onEmit: () => OtherMsg.make({ _tag: "Other" }) }) }
    })
  })

  it("adds the content's requirements to the parent's", () => {
    expect(Panel(h, { key: "p", slots: { body: Ticker(h, { key: "t" }) } })).type.toBe<View.Child<PageMsg, Clock>>()
    const Provided = Component.provide(Panel, Layer.succeed(Store, { draft: "" }))
    expect<Component.Slots<typeof Provided>>().type.toBe<"body" | "footer">()
    // Providing the child doesn't provide its content: Clock stays.
    const ClockProvided = Component.provide(Panel, Layer.succeed(Clock, { now: 0 }))
    expect(ClockProvided(h, { key: "p", slots: { body: Ticker(h, { key: "t" }) } })).type.toBe<
      View.Child<PageMsg, Clock>
    >()
  })

  it("keeps a slotted component a Component.Any", () => {
    expect<typeof Panel>().type.toBeAssignableTo<Component.Any>()
    expect<typeof Panel>().type.not.toBeAssignableTo<Component.Mountable<{}, never, never, never, "body" | "header">>()
  })

  it("keeps every branch's requirements, and checks every branch's names, in a conditional map", () => {
    expect(Panel(h, { key: "p", slots: either })).type.toBe<View.Child<PageMsg, Clock>>()
    expect(Panel).type.not.toBeCallableWith(h, { key: "p", slots: stray })
    expect(Panel).type.not.toBeCallableWith(h, { key: "p", slots: undeclared })
  })

  it("takes slots from a variable typed by an interface, and keeps its requirements", () => {
    expect(Panel(h, { key: "p", slots: interfaceSlots })).type.toBe<View.Child<PageMsg, Clock>>()
  })

  it("rejects an undeclared name in a variable that also passes a declared one", () => {
    expect(Panel).type.not.toBeCallableWith(h, { key: "p", slots: extra })
    expect(Panel).type.not.toBeCallableWith(h, { key: "p", slots: interfaceExtra })
  })

  it("takes no slots when the parent's message is given and the slots map isn't", () => {
    // `SC` isn't inferred once a type argument is given, so nothing could check the map's names or
    // requirements, a literal's included.
    expect(Panel<PageMsg>(h, { key: "p" })).type.toBe<View.Child<PageMsg, never>>()
    expect(Panel<PageMsg>).type.not.toBeCallableWith(h, { key: "p", slots: { body: h.p("x") } })
    expect(Panel<PageMsg>).type.not.toBeCallableWith(h, { key: "p", slots: extra })
  })

  it("checks a slots map given as a type argument", () => {
    expect(Panel<PageMsg, never, SlotMap>(h, { key: "p", slots: interfaceSlots })).type.toBe<
      View.Child<PageMsg, Clock>
    >()
    expect(Panel<PageMsg, never, { readonly body: string; readonly header: string }>).type.not
      .toBeCallableWith(h, { key: "p", slots: extra })
    expect(Panel<PageMsg, never, { readonly body: View.Child<typeof OtherMsg.Type, never> }>).type.not
      .toBeCallableWith(h, { key: "p", slots: { body: other.button.onClick(OtherMsg.make({ _tag: "Other" })) } })
  })

  it("rejects slots on headless and feature calls, from a variable too", () => {
    const Headless = Component.define({ name: "Headless", model: Schema.Null, message: Schema.Never, elements: Html })
      .make({ init: () => null, update: (model) => model, parts: () => ({}) })
    class Badge extends Feature.Service<Badge>()("typetest/slots/Badge", { props: Schema.Struct({}) }) {}
    const options = { key: "p", slots: { body: "x" }, view: () => h.p("x"), fallback: () => h.p("wait") }
    expect(Headless).type.not.toBeCallableWith(h, options)
    expect(Badge.render).type.not.toBeCallableWith(h, options)
  })

  it("rejects parts on a definition with slots", () => {
    expect(PanelDef.make).type.not.toBeCallableWith({
      init: () => true,
      update: (open: boolean) => open,
      parts: () => ({})
    })
  })
})

void Effect
