// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { Autocomplete, Field } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, popovers, tick } from "./utils/document.ts"

const items = [
  { value: "apple", label: "Apple" },
  { value: "apricot", label: "Apricot" },
  { value: "banana", label: "Banana" }
]

const Message = UiSchema.TaggedEnum({
  Opened: { reason: Schema.String },
  Dismissed: { reason: Schema.String },
  Updated: { value: Schema.String, reason: Schema.String },
  Submitted: { query: Schema.String }
})

const Page = Component.define({
  name: "Page",
  scoped: false,
  model: Schema.Struct({ open: Schema.Boolean, value: Schema.String, log: Schema.Array(Schema.String) }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ open: false, value: "", log: [] }),
  update: {
    Opened: (model, { reason }) => ({ ...model, open: true, log: [...model.log, "Opened " + reason] }),
    Dismissed: (model, { reason }) => ({ ...model, open: false, log: [...model.log, "Dismissed " + reason] }),
    Updated: (model, { reason, value }) => ({
      ...model,
      value,
      log: [...model.log, "Updated " + JSON.stringify(value) + " " + reason]
    }),
    Submitted: (model, { query }) => ({ ...model, log: [...model.log, "Submitted " + JSON.stringify(query)] })
  },
  view: (model, h) =>
    h.form.onSubmit(({ fields }) => Message.Submitted({ query: fields.q ?? "" })).children(
      Field(h, {
        props: { filled: model.value !== "" },
        view: (field) =>
          Autocomplete(h, {
            props: { open: model.open, value: model.value, items, name: "q", submitOnItemClick: true },
            onEmit: {
              Opened: ({ reason }) => Message.Opened({ reason }),
              Dismissed: ({ reason }) => Message.Dismissed({ reason }),
              Updated: ({ reason, value }) => Message.Updated({ value, reason }),
              Highlighted: () => undefined,
              Settled: () => undefined
            },
            view: (autocomplete) =>
              field.root(h.div).children(
                field.label(h.label).children("Fruit"),
                autocomplete.input(field.control(h.input.class("input"))),
                autocomplete.positioner(h.div.attr("id", "positioner")).children(
                  autocomplete.popup(h.div).children(
                    autocomplete.list(h.div).children(
                      ...autocomplete.items.map(({ label, value }) =>
                        autocomplete.item(h.div.attr("data-testid", value), value).children(label)
                      )
                    )
                  )
                )
              )
          })
      })
    )
})

const input = () => document.querySelector<HTMLInputElement>(".input")!
const item = (value: string) => document.querySelector<HTMLElement>("[data-testid=" + value + "]")!
const type = (value: string) => {
  const target = input()
  target.focus()
  target.value = value
  target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }))
}

describe("Autocomplete in a document", { concurrent: false }, () => {
  it.effect("with submitOnItemClick, Enter or a click on an item submits the form with the picked label", () =>
    Effect.gen(function*() {
      yield* popovers
      const root = yield* BrowserHost.mountEffect(Page, {}, yield* container)
      yield* tick
      assert.strictEqual(input().name, "q")
      type("ap")
      yield* tick
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }))
      yield* tick
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
      yield* tick
      assert.strictEqual(input().value, "Apple")
      assert.strictEqual(document.activeElement, input())
      type("ba")
      yield* tick
      item("banana").dispatchEvent(new PointerEvent("click", { bubbles: true, detail: 1, pointerType: "mouse" }))
      yield* tick
      assert.strictEqual(input().value, "Banana")
      assert.deepStrictEqual(root.model()?.log, [
        "Updated \"ap\" input-change",
        "Opened input-change",
        "Updated \"Apple\" item-press",
        "Dismissed item-press",
        "Submitted \"Apple\"",
        "Updated \"ba\" input-change",
        "Opened input-change",
        "Updated \"Banana\" item-press",
        "Dismissed item-press",
        "Submitted \"Banana\""
      ])
    }).pipe(Effect.scoped))
})
