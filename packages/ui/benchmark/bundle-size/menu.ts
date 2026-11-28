import { UiSchema } from "@effect/ui"
import { Menu } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { Effect, Layer, Schema } from "effect"

// One menu on its own: no Menubar or Toolbar above it, so neither belongs in the bundle.
const Message = UiSchema.TaggedEnum({ Opened: {}, Closed: {} })

const App = Html.component({
  name: "App",
  model: Schema.Boolean,
  message: Message
}).make({
  init: () => false,
  update: (_, message) => message._tag === "Opened",
  view: (h, open) =>
    Menu(h, {
      props: { open, items: [{ value: "copy", label: "Copy" }] },
      onEmit: {
        RequestedOpen: () => Message.Opened(),
        RequestedClose: () => Message.Closed(),
        Picked: () => undefined,
        Highlighted: () => undefined,
        RequestedQuery: () => undefined,
        Settled: () => undefined
      },
      view: (menu) =>
        h.div(
          menu.trigger({ element: h.button }).children("Edit"),
          menu.positioner(h.div).children(
            menu.popup(h.div).children(
              menu.item({ element: h.div, value: "copy" }).children("Copy")
            )
          )
        )
    })
})

Layer.launch(BrowserHost.mount(App, {}, document.getElementById("app")!))
  .pipe(Effect.runFork)
