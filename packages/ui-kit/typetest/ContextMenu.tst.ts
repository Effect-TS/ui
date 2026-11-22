import { UiSchema, type View } from "@effect/ui"
import { ContextMenu } from "@effect/ui-kit"
import type { Html } from "@effect/ui/html"
import { expect, it } from "tstyche"

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

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
  ContextMenu(h, {
    props: { open: true, items },
    view: (contextMenu) => {
      expect(contextMenu.trigger).type.toBeCallableWith(h.div)
      expect(contextMenu).type.not.toHaveProperty("contextTrigger")
      expect(contextMenu).type.not.toHaveProperty("viewport")
      expect(contextMenu).type.not.toHaveProperty("input")
      expect(contextMenu).type.not.toHaveProperty("submenuTrigger")
      return h.div
    }
  })
})
