import { UiSchema } from "@effect/ui"
import { DevTools } from "@effect/ui-devtools"
import { BrowserHost, Html } from "@effect/ui/html"
import { Effect, Layer, Schema } from "effect"

const Label = Html.component({
  name: "Label",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.span("odd")
})

const CounterMessage = UiSchema.TaggedEnum({ ClickedCount: {} })

const Counter = Html.component({
  name: "Counter",
  model: Schema.Struct({ count: Schema.Number }),
  message: CounterMessage
}).make({
  init: () => ({ count: 0 }),
  update: { ClickedCount: ($) => $.evolve({ count: $.model.count + 1 }) },
  view: (h, model) =>
    h.div(
      h.button.on("click", CounterMessage.ClickedCount()).children(
        "Count " + model.count
      ),
      model.count % 2 === 1 ? Label(h, { key: "odd" }) : null
    )
})

const Scene = Html.component({
  name: "Scene",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.main(...["a", "b", "c"].map((key) => Counter(h, { key })))
})

const Main = BrowserHost.mount(Scene, {}, document.getElementById("root")!)
  .pipe(
    Layer.provide(DevTools.layer({ position: "BottomRight" }))
  )

Layer.launch(Main).pipe(Effect.runFork)
document.body.setAttribute("data-ready", "")
