import { Context, Effect, Layer } from "effect"

export class Drafts extends Context.Service<Drafts, {
  readonly save: (text: string) => Effect.Effect<void>
}>()("Drafts") {
  static readonly layer = Layer.sync(Drafts, () => ({
    save: (text) => Effect.sync(() => localStorage.setItem("draft", text))
  }))
}
