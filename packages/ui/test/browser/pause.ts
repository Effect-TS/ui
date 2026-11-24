import { Component, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlSubscription } from "@effect/ui/html"
import { Effect, Schema } from "effect"

const Message = UiSchema.TaggedEnum({
  ClickedCount: {},
  HeardClick: {},
  Opened: {},
  Closed: {},
  ClickedMenu: {},
  ClosedMenu: {},
  ToggledMenu: { open: Schema.Boolean }
})

const Model = Schema.Struct({
  count: Schema.Number,
  heard: Schema.Number,
  dialog: Schema.Boolean,
  menu: Schema.Boolean,
  toggles: Schema.Number
})

const Scene = Component.define({
  name: "Scene",
  scoped: false,
  model: Model,
  message: Message,
  elements: Html
}).make({
  init: () => ({ count: 0, heard: 0, dialog: false, menu: false, toggles: 0 }),
  update: {
    ClickedCount: ($) => $.evolve({ count: $.model.count + 1 }),
    HeardClick: ($) => $.evolve({ heard: $.model.heard + 1 }),
    Opened: ($) => $.evolve({ dialog: true }),
    Closed: ($) => $.evolve({ dialog: false }),
    ClickedMenu: ($) => $.evolve({ menu: true }),
    ClosedMenu: ($) => $.evolve({ menu: false }),
    ToggledMenu: ($, { open }) => $.evolve({ menu: open, toggles: $.model.toggles + 1 })
  },
  view: (h, model) =>
    h.main(
      h.button.class("count").onClick(Message.ClickedCount()).children(`Count ${model.count}`),
      h.p.class("heard").children(`Heard ${model.heard}`),
      h.button.class("open-menu").onClick(Message.ClickedMenu()).children("Open menu"),
      h.div.class("menu").popover("auto", model.menu).onToggle(({ open }) => Message.ToggledMenu({ open }))
        .children("Menu"),
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
        menu: (open: boolean) => root.send(open ? Message.ClickedMenu() : Message.ClosedMenu()),
        pause: (model: typeof Model.Type) =>
          Effect.runSync(pausable.pause((path) => path === "/Scene" ? { model } : undefined))
      }
    })
    document.body.setAttribute("data-ready", "")
    return yield* Effect.never
  }).pipe(Effect.scoped)
)
