import { Component, Feature, UiSchema } from "@effect/ui"
import { BrowserHost, Html } from "@effect/ui/html"
import { Effect, Layer, Schema } from "effect"

const define = <const Name extends string>(name: Name) =>
  Component.define({
    name,
    model: Schema.Null,
    message: Schema.Never,
    elements: Html
  })

class Badge
  extends Feature.Service<Badge>()("Badge", { props: Schema.Struct({}) })
{}
const BadgeView = define("BadgeView").make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.b(["badge"])
})

const Frame = Component.define({
  name: "Frame",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html,
  slots: ["body"]
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.section([h.slots.body])
})

const BreakerMessage = UiSchema.TaggedEnum({ Break: {} })
const Breaker = Component.define({
  name: "Breaker",
  model: Schema.Null,
  message: BreakerMessage,
  elements: Html
}).make({
  init: () => null,
  update: () => {
    throw new Error("broke")
  },
  view: (h) => h.button.onClick(BreakerMessage.Break()).children(["break"])
})

const AppMessage = UiSchema.TaggedEnum({ Failed: {} })
const App = Component.define({
  name: "App",
  model: Schema.Number,
  message: AppMessage,
  elements: Html
}).make({
  init: () => 0,
  update: ($) => $.model + 1,
  view: (h, failures) =>
    Frame(h, {
      slots: {
        body: [
          Badge.render(h, {
            key: "badge",
            props: {},
            fallback: () => h.i(["loading"])
          }),
          Breaker(h, {
            onFailure: () => AppMessage.Failed(),
            fallback: () => h.i(["down"])
          }),
          h.output([String(failures)])
        ]
      }
    })
})

const badge = Badge.toLayer(BadgeView).pipe(
  Layer.provide(Layer.effectDiscard(Effect.yieldNow))
)
const Provided = Component.provide(App, badge)

Layer.launch(BrowserHost.mount(Provided, {}, document.getElementById("app")!))
  .pipe(Effect.runFork)
