import { Effect, Layer, Schema } from "effect"

// Same model and tagged message as counter.ts, without the @effect/ui constructor helpers.
const Model = Schema.Number
const Message = Schema.TaggedUnion({ Increment: {}, Decrement: {} })

Layer.launch(Layer.effectDiscard(Effect.sync(() => {
  const app = document.getElementById("app")!
  const model = Schema.decodeUnknownSync(Model)(JSON.parse(app.dataset.model!))
  const message = Schema.decodeUnknownSync(Message)(
    JSON.parse(app.dataset.message!)
  )
  app.textContent = String(message._tag === "Increment" ? model + 1 : model - 1)
}))).pipe(Effect.runFork)
