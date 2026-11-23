import { Component, Mount, UiSchema, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Scene } from "@effect/ui/testing"
import { Context, type Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"
import { Dialog, DialogEvents, type Item, Menu, type MenuEvents } from "../../test/html/fixtures/headless.ts"

class Clock extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()("Clock") {}
class Tracker extends Context.Service<Tracker, { readonly seen: Effect.Effect<void> }>()("Tracker") {}

const Tick = Mount.make("Tick", { args: {} }, () => Clock.use((clock) => clock.now))
const MarkSeen = Mount.make("MarkSeen", { args: {} }, () => Tracker.use((tracker) => tracker.seen))

const Timed = Component.define({
  name: "Timed",
  scoped: false,
  model: Schema.Number,
  message: Schema.Number,
  elements: Html
}).make({
  init: () => 0,
  update: (_, now) => now,
  parts: (p, now) => ({ now, clock: p.part("time", (b) => b.onMount(Tick())) })
})

const Msg = UiSchema.TaggedEnum({ Picked: { id: Schema.String }, Closed: {} })
const AppMsg = UiSchema.TaggedEnum({ Clicked: {} })
type AppMsg = typeof AppMsg.Type

const define = () =>
  Component.define({
    name: "Combo",
    scoped: false,
    props: Schema.Struct({ items: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String })) }),
    model: Schema.Number,
    message: Msg,
    elements: Html
  })

declare const h: View.Helper<AppMsg, unknown> & View.Tags<Html.Elements, AppMsg>
type Button = Html.Element<AppMsg, never, Html.EventsOf<"button">, HTMLButtonElement, "button">

describe("p.child", () => {
  it("infers the consumer's parts from the merge, with no annotations", () => {
    const Combo = define().make({
      init: () => 0,
      update: ($) => $.model,
      parts: (p, count) => {
        const badge = p.part("output", (b) => b.attr("data-count", String(count)))
        return p.child(Dialog, {
          props: { label: "Confirm" },
          onEmit: (event) => {
            expect(event).type.toBe<typeof DialogEvents.Type>()
            return Msg.Closed()
          },
          parts: (dialog) => ({
            ...dialog,
            count,
            badge,
            trigger: <B extends View.PartTarget<"button">>(element: B) => dialog.trigger(element)
          })
        })
      }
    })
    type Parts = Component.Headless.Parts<typeof Combo>
    expect<Parts["count"]>().type.toBe<number>()
    expect<Parts["open"]>().type.toBe<boolean>()
    expect<Parts["badge"]>().type.toBe<View.Part<"output", [], never>>()
    expect<Component.Headless.Requirements<typeof Combo>>().type.toBe<never>()
    Combo(h, {
      props: { items: [] },
      view: (combo) => {
        expect(combo.trigger(h.button.class("btn"))).type.toBe<Button>()
        return h.div(combo.popup(h.dialog), combo.badge(h.output))
      }
    })
  })

  it("two levels deep, the innermost merge is what the consumer gets", () => {
    const Combo = define().make({
      init: () => 0,
      update: ($) => $.model,
      parts: (p) =>
        p.child(Dialog, {
          props: { label: "Confirm" },
          parts: (dialog) =>
            p.child(Menu, {
              props: { items: p.props.items },
              onEmit: (event) => {
                expect(event).type.toBe<typeof MenuEvents.Type>()
                return Msg.Picked({ id: event.id })
              },
              parts: (menu) => ({ dialog, menu })
            })
        })
    })
    type Parts = Component.Headless.Parts<typeof Combo>
    expect<Parts["menu"]["visible"]>().type.toBe<ReadonlyArray<Item>>()
    expect<Parts["dialog"]["open"]>().type.toBe<boolean>()
  })

  it("the child's requirements, and the own parts', are the component's", () => {
    const Combo = define().make({
      init: () => 0,
      update: ($) => $.model,
      parts: (p) => {
        const seen = p.part("div", (b) => b.onMount(MarkSeen().pipe(Mount.map(() => Component.noop))))
        return p.child(Timed, { parts: (timed) => ({ timed, seen }) })
      }
    })
    expect<Component.Headless.Requirements<typeof Combo>>().type.toBe<Clock | Tracker>()
  })

  it("a reader of the child's shared state in the consumer's closure leaves no requirement", () => {
    const Tips = Component.define({
      name: "Tips",
      scoped: false,
      model: Schema.Null,
      message: Msg,
      shares: () => ({ open: true })
    })
      .make({ init: () => null, update: ($) => $.model, parts: () => ({}) })
    const Tip = Component.define({
      name: "Tip",
      scoped: false,
      model: Schema.Null,
      message: Msg,
      shared: { tips: Tips }
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => h.el("p")
    })
    const Bar = define().make({
      init: () => 0,
      update: ($) => $.model,
      parts: (p) => p.child(Tips, { parts: (tips) => tips })
    })
    const App = Component.define({ name: "App", scoped: false, model: Schema.Null, message: Msg, elements: Html }).make(
      {
        init: () => null,
        update: ($) => $.model,
        view: (h) => Bar(h, { props: { items: [] }, view: () => Tip(h, {}) })
      }
    )
    expect<Component.Requirements<typeof Tip>>().type.toBe<Component.Shared<"Tips">>()
    expect<Component.Requirements<typeof App>>().type.toBe<never>()
  })

  it("checks the child's props, that its events map to this component's messages, and refuses view and fallback", () => {
    define().make({
      init: () => 0,
      update: ($) => $.model,
      parts: (p) => {
        expect(p.child).type.not.toBeCallableWith(Dialog, { parts: (dialog: unknown) => ({ dialog }) })
        expect(p.child).type.not.toBeCallableWith(Dialog, {
          props: { label: "Confirm" },
          fallback: () => "down",
          parts: (dialog: unknown) => ({ dialog })
        })
        expect(p.child).type.not.toBeCallableWith(Dialog, {
          props: { label: "Confirm" },
          view: () => "inside",
          parts: (dialog: unknown) => ({ dialog })
        })
        expect(p.child).type.not.toBeCallableWith(Dialog, {
          props: { label: "Confirm" },
          onEmit: () => AppMsg.Clicked(),
          parts: (dialog: unknown) => ({ dialog })
        })
        return {}
      }
    })
  })
})

describe("Scene.childEmit", () => {
  it("takes the events of a headless child", () => {
    const Page = Component.define({ name: "Page", scoped: false, model: Schema.Null, message: Msg, elements: Html })
      .make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          Dialog(h, {
            props: { label: "Confirm" },
            onEmit: () => Msg.Closed(),
            view: (dialog) => dialog.popup(h.dialog)
          })
      })
    const scene = Scene.start(Page, {})
    expect(scene.childEmit).type.toBeCallableWith(Dialog, DialogEvents.Closed())
    expect(scene.childEmit).type.not.toBeCallableWith(Dialog, { _tag: "Missing" })
  })
})
