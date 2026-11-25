import { UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlSubscription } from "@effect/ui/html"
import { Effect, Schema } from "effect"

const Message = UiSchema.TaggedEnum({
  ClickedCount: {},
  HeardClick: {},
  Opened: {},
  Closed: {},
  ClickedMenu: {},
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

const Scene = Html.component({
  name: "Scene",
  model: Model,
  message: Message
}).make({
  init: () => initial,
  update: {
    ClickedCount: ($) => $.evolve({ count: $.model.count + 1 }),
    HeardClick: ($) => $.evolve({ heard: $.model.heard + 1 }),
    Opened: ($) => $.evolve({ dialog: true }),
    Closed: ($) => $.evolve({ dialog: false }),
    ClickedMenu: ($) => $.evolve({ menu: true }),
    ToggledMenu: ($, { open }) =>
      $.evolve({ menu: open, toggles: $.model.toggles + 1 }),
    ToggledDialog: ($, { open }) =>
      $.evolve({ dialog: open, dialogToggles: $.model.dialogToggles + 1 }),
    ClickedSub: ($) => $.evolve({ sub: true }),
    ClosedSub: ($) => $.evolve({ sub: false }),
    ToggledSub: ($, { open }) =>
      $.evolve({ sub: open, subToggles: $.model.subToggles + 1 })
  },
  view: (h, model) =>
    h.main(
      h.button.class("count").on("click", Message.ClickedCount()).children(
        `Count ${model.count}`
      ),
      h.p.class("heard").children(`Heard ${model.heard}`),
      h.button.class("open-menu").on("click", Message.ClickedMenu()).children(
        "Open menu"
      ),
      h.div.class("menu").popover("auto", model.menu).on("toggle", ({ open }) =>
        Message.ToggledMenu({ open }))
        .children(
          h.p("Menu"),
          h.button.class("open-sub").on("click", Message.ClickedSub()).children(
            "Open submenu"
          ),
          h.div.class("sub").popover("auto", model.sub).on(
            "toggle",
            ({ open }) =>
              Message.ToggledSub({ open })
          )
            .children("Submenu")
        ),
      h.dialog.modal(model.dialog).on("cancel", Message.Closed()).on("toggle", (
        { open }
      ) => Message.ToggledDialog({ open }))
        .children(
          h.button.class("close").on("click", Message.Closed()).children(
            "Close"
          )
        )
    ),
  subscriptions:
    () => [HtmlSubscription.onDocument("click", Message.HeardClick())]
})

Effect.runFork(
  Effect.gen(function*() {
    const roots: Array<BrowserHost.Controllable> = []
    const root = yield* BrowserHost.mountEffect(
      Scene,
      {},
      document.getElementById("root")!
    ).pipe(
      Effect.provideService(BrowserHost.Controllables, {
        register: (root) => (roots.push(root), () => {})
      })
    )
    const [pausable] = roots
    document.getElementById("resume")!.addEventListener("click", (event) => {
      event.stopPropagation()
      Effect.runSync(pausable.resume)
    })
    Object.assign(globalThis, {
      check: {
        model: () => root.model(),
        dialog: (open: boolean) =>
          root.send(open ? Message.Opened() : Message.Closed()),
        sub: (open: boolean) =>
          root.send(open ? Message.ClickedSub() : Message.ClosedSub()),
        resume: () => Effect.runSync(pausable.resume),
        pause: () =>
          Effect.runSync(
            pausable.pause((path) =>
              path === "/Scene"
                ? { model: { ...initial, count: 5 } }
                : undefined
            )
          )
      }
    })
    document.body.setAttribute("data-ready", "")
    return yield* Effect.never
  }).pipe(Effect.scoped)
)
