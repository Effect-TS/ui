// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { AlertDialog, Dialog } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 60)))

const container = Effect.acquireRelease(
  Effect.sync(() => document.body.appendChild(document.createElement("div"))),
  (element) => Effect.sync(() => element.remove())
)

const Message = UiSchema.TaggedEnum({
  Opened: { which: Schema.String },
  Dismissed: { which: Schema.String, reason: Schema.String }
})

const Config = Schema.Struct({
  // The alert dialog drawn inside an open dialog's popup.
  nested: Schema.Boolean,
  // The consumer keeps it open whatever it asks.
  refuse: Schema.Boolean
})

// A page with an alert dialog open, whose consumer sets a role and a
// `closedby` of its own on the portal, before the part and after it.
const Page = Component.define({
  name: "Page",
  props: Config,
  model: Schema.Struct({ config: Config, log: Schema.Array(Schema.String) }),
  message: Message,
  elements: Html
}).make({
  init: ($) => ({ config: $.props, log: [] }),
  update: {
    Opened: (model, { which }) => ({ ...model, log: [...model.log, `Opened ${which}`] }),
    Dismissed: (model, { reason, which }) => ({ ...model, log: [...model.log, `Dismissed ${which} ${reason}`] })
  },
  view: (model, h) => {
    const on = (which: string) => ({
      Opened: () => Message.Opened({ which }),
      Dismissed: ({ reason }: { readonly reason: string }) => Message.Dismissed({ which, reason }),
      Settled: () => undefined
    })
    const alert = AlertDialog(h, {
      key: "alert",
      props: { open: true },
      onEmit: on("alert"),
      view: (s) =>
        h.div(
          s.trigger(h.button.attr("id", "trigger")).children("Discard draft"),
          s.portal(h.dialog.class("alert").attr("role", "dialog").attr("closedby", "any"))?.attr("role", "region")
            .children(
              s.backdrop(h.div.attr("id", "backdrop")),
              s.viewport(h.div.attr("id", "viewport")).children(
                s.popup(h.div).children(
                  s.title(h.h2).children("Discard draft?"),
                  s.description(h.p).children("You can't undo this."),
                  s.close(h.button.attr("id", "cancel")).children("Cancel")
                )
              )
            )
        )
    })
    return h.div(
      h.button.attr("id", "page").children("Page"),
      model.config.nested
        ? Dialog(h, {
          key: "editor",
          props: { open: true },
          onEmit: on("editor"),
          view: (s) => h.div(s.portal(h.dialog)?.children(s.popup(h.div.class("editor")).children(alert)))
        })
        : alert
    )
  }
})

const mountPage = Effect.fnUntraced(function*(config: typeof Config.Type) {
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(Page, config, app)
  yield* tick
  return { app, log: () => root.model()!.log }
})

const byId = (id: string) => document.getElementById(id)!
const press = (target: Element) =>
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, composed: true, isPrimary: true, pointerType: "mouse", button: 0 })
  )
const alertPortal = (app: Element) => app.querySelector<HTMLDialogElement>("dialog.alert")!

// The tests share one document, and move focus.
describe("AlertDialog", { concurrent: false }, () => {
  it.effect("is a modal alertdialog labelled by its title, whose role and closedby win over the consumer's", () =>
    Effect.gen(function*() {
      const { app } = yield* mountPage({ nested: false, refuse: true })
      const dialog = alertPortal(app)
      assert.isTrue(dialog.open)
      assert.isNull(dialog.getAttribute("popover"))
      assert.strictEqual(dialog.getAttribute("role"), "alertdialog")
      assert.strictEqual(dialog.getAttribute("closedby"), "closerequest")
      assert.strictEqual(dialog.getAttribute("aria-labelledby"), app.querySelector("h2")!.id)
      assert.strictEqual(dialog.getAttribute("aria-describedby"), app.querySelector("p")!.id)
      // Focus moved inside, to the first button.
      assert.strictEqual(document.activeElement?.id, "cancel")
    }))

  it.effect("a press outside asks nothing, and Escape, the close part and the trigger ask to close", () =>
    Effect.gen(function*() {
      const { app, log } = yield* mountPage({ nested: false, refuse: true })
      press(byId("page"))
      press(byId("backdrop"))
      yield* tick
      assert.deepStrictEqual(log(), [])
      alertPortal(app).dispatchEvent(new Event("cancel", { cancelable: true }))
      byId("cancel").click()
      byId("trigger").click()
      yield* tick
      assert.deepStrictEqual(log(), [
        "Dismissed alert escape-key",
        "Dismissed alert close-press",
        "Dismissed alert trigger-press"
      ])
    }))

  it.effect("drawn inside a dialog, it is nested in it, and only it hears Escape", () =>
    Effect.gen(function*() {
      const { app, log } = yield* mountPage({ nested: true, refuse: true })
      yield* tick
      assert.isTrue(app.querySelector(".editor")!.hasAttribute("data-nested-dialog-open"))
      assert.isTrue(byId("viewport").hasAttribute("data-nested"))
      assert.isNull(document.getElementById("backdrop"))
      press(byId("page"))
      yield* tick
      assert.deepStrictEqual(log(), [])
      alertPortal(app).dispatchEvent(new Event("cancel", { cancelable: true }))
      yield* tick
      assert.deepStrictEqual(log(), ["Dismissed alert escape-key"])
    }))
})
