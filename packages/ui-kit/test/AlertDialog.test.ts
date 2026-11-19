// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { AlertDialog } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, press, tick } from "./utils/document.ts"

const Message = UiSchema.TaggedEnum({ Dismissed: {} })

const Page = Component.define({
  name: "Page",
  props: Schema.Struct({}),
  model: Schema.Struct({ open: Schema.Boolean }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ open: true }),
  update: { Dismissed: () => ({ open: false }) },
  view: (model, h) =>
    AlertDialog(h, {
      props: { open: model.open },
      onEmit: { Opened: () => undefined, Dismissed: () => Message.Dismissed(), Settled: () => undefined },
      view: (s) =>
        h.div(
          s.portal(h.dialog.attr("role", "dialog").attr("closedby", "any"))
            ?.attr("role", "region").attr("closedby", "any").children(s.popup(h.div))
        )
    })
})

it.effect("opens as a modal alertdialog and ignores an outside press despite consumer attributes", () =>
  Effect.gen(function*() {
    const app = yield* container
    const root = yield* BrowserHost.mountEffect(Page, {}, app)
    yield* tick
    const dialog = app.querySelector("dialog")!
    assert.isTrue(dialog.open)
    assert.isFalse(dialog.hasAttribute("popover"))
    assert.strictEqual(dialog.getAttribute("role"), "alertdialog")
    assert.strictEqual(dialog.getAttribute("closedby"), "closerequest")
    press(app)
    yield* tick
    assert.isTrue(root.model()!.open)
  }))
