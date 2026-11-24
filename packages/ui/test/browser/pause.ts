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
  ToggledMenu: { open: Schema.Boolean },
  ToggledDialog: { open: Schema.Boolean },
  ClickedSub: {},
  ClosedSub: {},
  ToggledSub: { open: Schema.Boolean }
})

const Model = Schema.Struct({
  count: Schema.Number,
  heard: Schema.Number,
  dialog: Schema.Boolean,
  menu: Schema.Boolean,
  toggles: Schema.Number,
  dialogToggles: Schema.Number,
  sub: Schema.Boolean,
  subToggles: Schema.Number
})

const initial: typeof Model.Type = {
  count: 0,
  heard: 0,
  dialog: false,
  menu: false,
  toggles: 0,
  dialogToggles: 0,
  sub: false,
  subToggles: 0
}

const Scene = Component.define({
  name: "Scene",
  scoped: false,
  model: Model,
  message: Message,
  elements: Html
}).make({
  init: () => initial,
  update: {
    ClickedCount: ($) => $.evolve({ count: $.model.count + 1 }),
    HeardClick: ($) => $.evolve({ heard: $.model.heard + 1 }),
    Opened: ($) => $.evolve({ dialog: true }),
    Closed: ($) => $.evolve({ dialog: false }),
    ClickedMenu: ($) => $.evolve({ menu: true }),
    ClosedMenu: ($) => $.evolve({ menu: false }),
    ToggledMenu: ($, { open }) => $.evolve({ menu: open, toggles: $.model.toggles + 1 }),
    ToggledDialog: ($, { open }) => $.evolve({ dialog: open, dialogToggles: $.model.dialogToggles + 1 }),
    ClickedSub: ($) => $.evolve({ sub: true }),
    ClosedSub: ($) => $.evolve({ sub: false }),
    ToggledSub: ($, { open }) => $.evolve({ sub: open, subToggles: $.model.subToggles + 1 })
  },
  view: (h, model) =>
    h.main(
      h.button.class("count").onClick(Message.ClickedCount()).children(`Count ${model.count}`),
      h.p.class("heard").children(`Heard ${model.heard}`),
      h.button.class("open-menu").onClick(Message.ClickedMenu()).children("Open menu"),
      h.div.class("menu").popover("auto", model.menu).onToggle(({ open }) => Message.ToggledMenu({ open }))
        .children(
          h.p("Menu"),
          h.button.class("open-sub").onClick(Message.ClickedSub()).children("Open submenu"),
          h.div.class("sub").popover("auto", model.sub).onToggle(({ open }) => Message.ToggledSub({ open }))
            .children("Submenu")
        ),
      h.dialog.modal(model.dialog).onCancel(Message.Closed()).onToggle(({ open }) => Message.ToggledDialog({ open }))
        .children(
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
        dialog: (open: boolean) => root.send(open ? Message.Opened() : Message.Closed()),
        menu: (open: boolean) => root.send(open ? Message.ClickedMenu() : Message.ClosedMenu()),
        sub: (open: boolean) => root.send(open ? Message.ClickedSub() : Message.ClosedSub()),
        pause: () =>
          Effect.runSync(pausable.pause((path) => path === "/Scene" ? { model: { ...initial, count: 5 } } : undefined))
      }
    })
    document.body.setAttribute("data-ready", "")
    return yield* Effect.never
  }).pipe(Effect.scoped)
)
