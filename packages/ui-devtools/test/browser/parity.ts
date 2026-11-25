import { UiSchema } from "@effect/ui"
import { DevTools } from "@effect/ui-devtools"
import { BrowserHost, Html } from "@effect/ui/html"
import { Effect, Layer, Schema } from "effect"

const CounterMessage = UiSchema.TaggedEnum({
  Moved: {},
  Clicked: {}
})

const Counter = Html.component({
  name: "Counter",
  model: Schema.Struct({
    moves: Schema.Number,
    count: Schema.Number
  }),
  message: CounterMessage
}).make({
  init: () => ({ moves: 0, count: 0 }),
  update: {
    Moved: ($) => $.evolve({ moves: $.model.moves + 1 }),
    Clicked: ($) => $.evolve({ count: $.model.count + 1 })
  },
  view: (h, model) =>
    h.section(
      h.output.attr("id", "state").children(`${model.moves}:${model.count}`),
      h.button.on("click", CounterMessage.Moved()).children("Move"),
      h.button.on("click", CounterMessage.Clicked()).children("Count")
    )
})

const SideMessage = UiSchema.TaggedEnum({ Toggled: {} })

const Side = Html.component({
  name: "Side",
  model: Schema.Struct({ on: Schema.Boolean }),
  message: SideMessage
}).make({
  init: () => ({ on: false }),
  update: { Toggled: ($) => $.evolve({ on: !$.model.on }) },
  view: (h, model) =>
    h.section(
      h.span.attr("id", "side").children(model.on ? "on" : "off"),
      h.button.on("click", SideMessage.Toggled()).children("Toggle")
    )
})

const App = Html.component({
  name: "App",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.main(
      Counter(h, { key: "counter", props: {} }),
      Side(h, { key: "side", props: {} })
    )
})

const Main = BrowserHost.mount(App, {}, document.getElementById("root")!).pipe(
  Layer.provide(
    DevTools.layer({ position: "BottomRight", size: 50, exclude: ["Moved"] })
  )
)

Layer.launch(Main).pipe(Effect.runFork)
document.body.setAttribute("data-ready", "")
