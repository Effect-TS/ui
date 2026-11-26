import { UiSchema } from "@effect/ui"
import { Select } from "@effect/ui-kit"
import { BrowserHost, Html, HtmlScheduler } from "@effect/ui/html"
import { Effect, Schema } from "effect"

const items = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" }
]

const Message = UiSchema.TaggedEnum({
  RequestedOpen: { reason: Schema.String },
  RequestedClose: { reason: Schema.String },
  Picked: { value: Schema.NullOr(Schema.String) }
})

const Page = Html.component({
  name: "Page",
  props: Schema.Struct({ align: Schema.Boolean }),
  model: Schema.Struct({
    open: Schema.Boolean,
    value: Schema.NullOr(Schema.String),
    log: Schema.Array(Schema.String)
  }),
  message: Message
}).make({
  init: () => ({ open: false, value: null, log: [] }),
  update: {
    RequestedOpen: ($, { reason }) => ({
      ...$.model,
      open: true,
      log: [...$.model.log, "open " + reason]
    }),
    RequestedClose: ($, { reason }) => ({
      ...$.model,
      open: false,
      log: [...$.model.log, "close " + reason]
    }),
    Picked: ($, { value }) => ({ ...$.model, value })
  },
  view: (h, model) =>
    Select(h, {
      props: {
        open: model.open,
        value: model.value,
        items,
        id: "trigger",
        alignItemWithTrigger: h.props.align
      },
      onEmit: {
        RequestedOpen: ({ reason }) => Message.RequestedOpen({ reason }),
        RequestedClose: ({ reason }) => Message.RequestedClose({ reason }),
        Picked: ({ value }) =>
          Message.Picked({ value: typeof value === "string" ? value : null }),
        Settled: () => undefined
      },
      view: (select) =>
        h.div(
          select.trigger(h.button).children(
            select.value(h.span),
            " ▾"
          ),
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

Effect.runFork(
  Effect.gen(function*() {
    const root = yield* BrowserHost.mountEffect(
      Page,
      { align: new URLSearchParams(location.search).get("align") !== "false" },
      document.getElementById("root")!
    )
    Object.assign(globalThis, { check: { log: () => root.model()?.log } })
    document.body.setAttribute("data-ready", "")
    return yield* Effect.never
  }).pipe(
    Effect.scoped,
    // An unbundled dev build can outrun the default 5ms budget and defer the
    // open past the press. A long budget opens it within the mousedown, as a
    // production build does.
    Effect.provide(HtmlScheduler.layer({ budget: "1 second" }))
  )
)
