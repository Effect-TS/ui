import { Component, Mount, UiSchema, type View } from "@effect/ui"
import { ContextMenu } from "@effect/ui-kit"
import type { Html } from "@effect/ui/html"
import { Context, Effect } from "effect"
import { expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make("NeedsClock", { args: {} }, () => Clock.use(() => Effect.succeed(Component.noop)))

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

type Div<R> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">

declare const h: View.Helper<Msg, unknown> & View.Tags<Html.Elements, Msg>

const items = [{ value: "copy", label: "Copy" }]

it("omits button, hover, submenu and filter props and requires no RequestedQuery", () => {
  const view = () => h.div
  const onEmit = {
    RequestedOpen: () => undefined,
    RequestedClose: () => undefined,
    Picked: () => undefined,
    Highlighted: () => undefined,
    Settled: () => undefined
  }
  expect(ContextMenu).type.toBeCallableWith(h, { props: { open: true, items }, onEmit, view })
  expect(ContextMenu).type.not.toBeCallableWith(h, { props: { open: true, items, modal: false }, view })
  expect(ContextMenu).type.not.toBeCallableWith(h, { props: { open: true, items, openOnHover: true }, view })
  expect(ContextMenu).type.not.toBeCallableWith(h, { props: { open: true, items, query: "" }, view })
})

it("draws its area with trigger and has no viewport or filter parts", () => {
  const child = ContextMenu(h, {
    props: { open: true, items },
    view: (contextMenu) => {
      const area = contextMenu.trigger(h.div.onMount(NeedsClock()))
      expect(area).type.toBe<Div<Clock>>()
      expect(contextMenu.trigger).type.not.toBeCallableWith(h.button)
      expect(contextMenu).type.not.toHaveProperty("contextTrigger")
      expect(contextMenu).type.not.toHaveProperty("submenuTrigger")
      expect(contextMenu).type.not.toHaveProperty("viewport")
      expect(contextMenu).type.not.toHaveProperty("list")
      expect(contextMenu).type.not.toHaveProperty("input")
      expect(contextMenu).type.not.toHaveProperty("clear")
      expect(contextMenu).type.not.toHaveProperty("empty")
      expect(contextMenu).type.not.toHaveProperty("nested")
      expect(contextMenu).type.not.toHaveProperty("nothingMatches")
      expect(contextMenu).type.not.toHaveProperty("transitioning")
      expect(contextMenu).type.not.toHaveProperty("activationDirection")
      return area
    }
  })
  expect<View.Requirements<typeof child>>().type.toBe<Clock>()
})
