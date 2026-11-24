import { Component, UiSchema } from "@effect/ui"
import { DevTools } from "@effect/ui-devtools"
import { BrowserHost, Html } from "@effect/ui/html"
import { Effect, Layer, Schema } from "effect"

const CounterMessage = UiSchema.TaggedEnum({
  Moved: {},
  Clicked: {}
})

const Counter = Component.define({
  name: "Counter",
  scoped: false,
  model: Schema.Struct({
    moves: Schema.Number,
    count: Schema.Number
  }),
  message: CounterMessage,
  elements: Html
}).make({
  init: () => ({ moves: 0, count: 0 }),
  update: {
    Moved: ($) => $.evolve({ moves: $.model.moves + 1 }),
    Clicked: ($) => $.evolve({ count: $.model.count + 1 })
  },
  view: (h, model) =>
    h.section(
      h.output.attr("id", "state").children(`${model.moves}:${model.count}`),
      h.button.onClick(CounterMessage.Moved()).children("Move"),
      h.button.onClick(CounterMessage.Clicked()).children("Count")
    )
})

const SideMessage = UiSchema.TaggedEnum({ Toggled: {} })

const Side = Component.define({
  name: "Side",
  scoped: false,
  model: Schema.Struct({ on: Schema.Boolean }),
  message: SideMessage,
  elements: Html
}).make({
  init: () => ({ on: false }),
  update: { Toggled: ($) => $.evolve({ on: !$.model.on }) },
  view: (h, model) =>
    h.section(
      h.span.attr("id", "side").children(model.on ? "on" : "off"),
      h.button.onClick(SideMessage.Toggled()).children("Toggle")
    )
})

const App = Component.define({
  name: "App",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
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
