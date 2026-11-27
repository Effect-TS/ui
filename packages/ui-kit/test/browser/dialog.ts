import { UiSchema } from "@effect/ui"
import { Dialog } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { Effect, Layer, Schema } from "effect"

const Message = UiSchema.TaggedEnum({ RequestedClose: {} })

const Page = Html.component({
  name: "Page",
  props: Schema.Struct({}),
  model: Schema.Struct({ open: Schema.Boolean }),
  message: Message
}).make({
  init: () => ({ open: true }),
  update: { RequestedClose: () => ({ open: false }) },
  view: (h, model) =>
    Dialog(h, {
      props: { open: model.open },
      onEmit: {
        RequestedOpen: () => undefined,
        RequestedClose: () => Message.RequestedClose(),
        Settled: () => undefined
      },
      view: (dialog) =>
        h.div(
          dialog.portal(h.dialog)?.children(
            dialog.popup(h.div).children(h.input)
          )
        )
    })
})

const root = document.getElementById("root")!
const mode = new URLSearchParams(location.search).get("shadow")
// The check reaches a closed root through this global.
const shadow = mode === null ? undefined : root.attachShadow({
  mode: mode === "closed" ? "closed" : "open"
})
Object.assign(globalThis, { shadow })

BrowserHost.mount(
  Page,
  {},
  shadow?.appendChild(document.createElement("div")) ?? root
).pipe(Layer.launch, Effect.runFork)
