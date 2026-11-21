import { Effect, Schema } from "effect"

// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { AlertDialog } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, it } from "@effect/vitest"

import { click, container, popovers, tick } from "./utils/document.ts"

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
      view: (alertDialog) =>
        h.div(
          alertDialog.portal(h.dialog.attr("role", "dialog"))?.attr("role", "region").children(alertDialog.popup(h.div))
        )
    })
})

it.effect("opens as a modal alertdialog and ignores a press on its layer despite consumer attributes", () =>
  Effect.gen(function*() {
    yield* popovers
    const app = yield* container
    const root = yield* BrowserHost.mountEffect(Page, {}, app)
    yield* tick
    const dialog = app.querySelector("dialog")!
    assert.strictEqual(dialog.getAttribute("popover"), "manual")
    assert.strictEqual(dialog.getAttribute("role"), "alertdialog")
    assert.strictEqual(dialog.firstElementChild?.getAttribute("role"), "presentation")
    assert.strictEqual(document.body.style.overflowY, "hidden")
    click(dialog.firstElementChild!)
    yield* tick
    assert.isTrue(root.model()!.open)
  }))
