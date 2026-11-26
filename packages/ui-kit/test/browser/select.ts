import { UiSchema } from "@effect/ui"
import { Select } from "@effect/ui-kit"
import { BrowserHost, Html, HtmlScheduler } from "@effect/ui/html"
import { Effect, Layer, Schema } from "effect"

const items = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" }
]

const Message = UiSchema.TaggedEnum({
  RequestedOpen: {},
  RequestedClose: {}
})

const Page = Html.component({
  name: "Page",
  props: Schema.Struct({ decline: Schema.Boolean }),
  model: Schema.Struct({ open: Schema.Boolean }),
  message: Message
}).make({
  init: () => ({ open: false }),
  update: {
    RequestedOpen: ($) => ({ open: !$.props.decline }),
    RequestedClose: () => ({ open: false })
  },
  view: (h, model) =>
    Select(h, {
      props: {
        open: model.open,
        items,
        id: "trigger"
      },
      onEmit: {
        RequestedOpen: () => Message.RequestedOpen(),
        RequestedClose: () => Message.RequestedClose(),
        Picked: () => undefined,
        Settled: () => undefined
      },
      view: (select) =>
        h.div(
          h.input.attr("id", "field"),
          select.trigger(h.button).children(select.value(h.span)),
          select.positioner(h.div).children(
            select.popup(h.div.class("popup")).children(
              ...items.map(({ label, value }) =>
                select.item({ element: h.div, value }).children(
                  select.itemText(h.div).children(label)
                )
              )
            )
          )
        )
    })
})

BrowserHost.mount(
  Page,
  { decline: new URLSearchParams(location.search).has("decline") },
  document.getElementById("root")!
).pipe(
  // An unbundled dev build can outrun the default 5ms budget and defer the
  // open past the press. A long budget opens it within the mousedown, as a
  // production build does.
  Layer.provide(HtmlScheduler.layer({ budget: "1 second" })),
  Layer.launch,
  Effect.runFork
)
