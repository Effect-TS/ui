// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { DateField } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, tick } from "./utils/document.ts"

const Message = UiSchema.TaggedEnum({
  Named: { name: Schema.optional(Schema.String) },
  Committed: {}
})

const Page = Html.component({
  name: "Page",
  model: Schema.Struct({
    name: Schema.optional(Schema.String),
    commits: Schema.Number
  }),
  message: Message
}).make({
  init: () => ({ name: "due", commits: 0 }),
  update: {
    Named: ($, { name }) => ({ ...$.model, name }),
    Committed: ($) => ({ ...$.model, commits: $.model.commits + 1 })
  },
  view: (h, model) =>
    h.div(
      DateField(h, {
        props: { value: null, locale: "en-GB", name: model.name },
        onEmit: { Committed: () => Message.Committed() },
        view: (dateField) => dateField.input(h.input.class("input"))
      })
    )
})

describe("DateField in a document", () => {
  it.effect("keeps focus and the draft when name is added or removed while editing", () =>
    Effect.gen(function*() {
      const root = yield* BrowserHost.mountEffect(Page, {}, yield* container)
      yield* tick
      const input = document.querySelector<HTMLInputElement>(".input")!
      input.focus()
      input.value = "01/"
      input.dispatchEvent(new Event("input", { bubbles: true }))
      yield* tick

      for (const name of [undefined, "due"]) {
        root.send(Message.Named({ name }))
        yield* tick
        assert.strictEqual(document.activeElement, input)
        assert.strictEqual(input.value, "01/")
      }
      assert.strictEqual(root.model()?.commits, 0)
    }).pipe(Effect.scoped))
})
