import { Component, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlSubscription } from "@effect/ui/html"
import { Effect, Schema } from "effect"

const Message = UiSchema.TaggedEnum({ ClickedCount: {}, HeardClick: {}, Opened: {}, Closed: {} })

const Scene = Component.define({
  name: "Scene",
  scoped: false,
  model: Schema.Struct({ count: Schema.Number, heard: Schema.Number, dialog: Schema.Boolean }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ count: 0, heard: 0, dialog: false }),
  update: {
    ClickedCount: ($) => $.evolve({ count: $.model.count + 1 }),
    HeardClick: ($) => $.evolve({ heard: $.model.heard + 1 }),
    Opened: ($) => $.evolve({ dialog: true }),
    Closed: ($) => $.evolve({ dialog: false })
  },
  view: (h, model) =>
    h.main(
      h.button.class("count").onClick(Message.ClickedCount()).children(`Count ${model.count}`),
      h.p.class("heard").children(`Heard ${model.heard}`),
      h.dialog.modal(model.dialog).onCancel(Message.Closed()).children(
        h.button.class("close").onClick(Message.Closed()).children("Close")
      )
    ),
  subscriptions: () => [HtmlSubscription.onDocument("click", Message.HeardClick())]
})

Effect.runFork(
  Effect.gen(function*() {
    const roots: Array<BrowserHost.Pausable> = []
    const root = yield* BrowserHost.mountEffect(Scene, {}, document.getElementById("root")!).pipe(
      Effect.provideService(BrowserHost.Pausables, { register: (root) => (roots.push(root), () => {}) })
    )
    const [pausable] = roots
    document.getElementById("resume")!.addEventListener("click", (event) => {
      event.stopPropagation()
      Effect.runSync(pausable.resume)
    })
    Object.assign(globalThis, {
      check: {
        model: () => root.model(),
        open: () => root.send(Message.Opened()),
        pause: (model: { readonly count: number; readonly heard: number; readonly dialog: boolean }) =>
          Effect.runSync(pausable.pause((path) => path === "/Scene" ? { model } : undefined))
      }
    })
    document.body.setAttribute("data-ready", "")
    return yield* Effect.never
  }).pipe(Effect.scoped)
)
