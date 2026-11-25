// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Autocomplete, Combobox, Field } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, popovers, press, tick } from "./utils/document.ts"

const items = [
  { value: "apple", label: "Apple" },
  { value: "apricot", label: "Apricot" },
  { value: "banana", label: "Banana" }
]

const Message = UiSchema.TaggedEnum({
  RequestedOpen: { reason: Schema.String },
  RequestedClose: { reason: Schema.String },
  Updated: { value: Schema.String, reason: Schema.String },
  Submitted: { query: Schema.String }
})

const FormModel = Schema.Struct({
  open: Schema.Boolean,
  value: Schema.String,
  log: Schema.Array(Schema.String)
})
type FormModel = typeof FormModel.Type

const formUpdate = {
  RequestedOpen: (
    { model }: { readonly model: FormModel },
    { reason }: { readonly reason: string }
  ) => ({
    ...model,
    open: true,
    log: [...model.log, "RequestedOpen " + reason]
  }),
  RequestedClose: (
    { model }: { readonly model: FormModel },
    { reason }: { readonly reason: string }
  ) => ({
    ...model,
    open: false,
    log: [...model.log, "RequestedClose " + reason]
  }),
  Updated: (
    { model }: { readonly model: FormModel },
    { reason, value }: { readonly reason: string; readonly value: string }
  ) => ({
    ...model,
    value,
    log: [...model.log, "Updated " + JSON.stringify(value) + " " + reason]
  }),
  Submitted: (
    { model }: { readonly model: FormModel },
    { query }: { readonly query: string }
  ) => ({
    ...model,
    log: [...model.log, "Submitted " + JSON.stringify(query)]
  })
}

const Page = Html.component({
  name: "Page",
  model: FormModel,
  message: Message
}).make({
  init: () => ({ open: false, value: "", log: [] }),
  update: formUpdate,
  view: (h, model) =>
    h.form.on(
      "submit",
      ({ fields }) => Message.Submitted({ query: fields.q ?? "" })
    ).children(
      Field(h, {
        props: { filled: model.value !== "" },
        view: (field) =>
          Autocomplete(h, {
            props: {
              open: model.open,
              value: model.value,
              items,
              name: "q",
              submitOnItemClick: true
            },
            onEmit: {
              RequestedOpen: ({ reason }) => Message.RequestedOpen({ reason }),
              RequestedClose: ({ reason }) =>
                Message.RequestedClose({ reason }),
              Updated: ({ reason, value }) =>
                Message.Updated({ value, reason }),
              Highlighted: () => undefined,
              Settled: () => undefined
            },
            view: (autocomplete) =>
              field.root(h.div).children(
                field.label(h.label).children("Fruit"),
                autocomplete.input(field.control(h.input.class("input"))),
                autocomplete.positioner(h.div.attr("id", "positioner"))
                  .children(
                    autocomplete.popup(h.div).children(
                      autocomplete.list(h.div).children(
                        ...autocomplete.items.map(({ label, value }) =>
                          autocomplete.item({
                            element: h.div.attr("data-testid", value),
                            value
                          }).children(label)
                        )
                      )
                    )
                  )
              )
          })
      })
    )
})

const InPopup = Html.component({
  name: "InPopup",
  model: FormModel,
  message: Message
}).make({
  init: () => ({ open: false, value: "", log: [] }),
  update: formUpdate,
  view: (h, model) =>
    h.div(
      h.form.attr("id", "search").on("submit", ({ fields }) =>
        Message.Submitted({ query: fields.q ?? "" })),
      Autocomplete(h, {
        props: {
          open: model.open,
          value: model.value,
          items,
          name: "q",
          form: "search",
          inputInPopup: true,
          submitOnItemClick: true
        },
        onEmit: {
          RequestedOpen: ({ reason }) =>
            Message.RequestedOpen({ reason }),
          RequestedClose: ({ reason }) => Message.RequestedClose({ reason }),
          Updated: ({ reason, value }) => Message.Updated({ value, reason }),
          Highlighted: () => undefined,
          Settled: () => undefined
        },
        view: (autocomplete) =>
          h.div(
            autocomplete.trigger(h.button.attr("id", "trigger")).children(
              autocomplete.value(h.span)
            ),
            autocomplete.positioner(h.div).children(
              autocomplete.popup(h.div).children(
                autocomplete.input(h.input.class("input")),
                autocomplete.list(h.div).children(
                  ...autocomplete.items.map(({ label, value }) =>
                    autocomplete.item({
                      element: h.div.attr("data-testid", value),
                      value
                    }).children(label)
                  )
                )
              )
            )
          )
      })
    )
})

const NestedMessage = UiSchema.TaggedEnum({
  Toggled: {
    which: Schema.Literals(["outer", "inner", "picker"]),
    open: Schema.Boolean,
    reason: Schema.String
  }
})

const Nested = Html.component({
  name: "Nested",
  model: Schema.Struct({
    outer: Schema.Boolean,
    inner: Schema.Boolean,
    picker: Schema.Boolean,
    log: Schema.Array(Schema.String)
  }),
  message: NestedMessage
}).make({
  init: () => ({ outer: true, inner: true, picker: false, log: [] }),
  update: {
    Toggled: ($, { open, reason, which }) => ({
      ...$.model,
      [which]: open,
      log: [
        ...$.model.log,
        which + (open ? " RequestedOpen " : " RequestedClose ") + reason
      ]
    })
  },
  view: (h, model) =>
    Combobox(h, {
      props: { open: model.outer, value: null, inputValue: "", items },
      onEmit: {
        RequestedOpen: ({ reason }) =>
          NestedMessage.Toggled({ which: "outer", open: true, reason }),
        RequestedClose: ({ reason }) =>
          NestedMessage.Toggled({ which: "outer", open: false, reason }),
        Picked: () => undefined,
        RequestedInputValue: () => undefined,
        Highlighted: () => undefined,
        Settled: () => undefined
      },
      view: (combobox) =>
        h.div(
          combobox.input(h.input.class("outer")),
          combobox.positioner(h.div).children(
            combobox.popup(h.div).children(
              combobox.list(h.div).children(
                Autocomplete(h, {
                  key: "inner",
                  props: { open: model.inner, value: "", items, modal: true },
                  onEmit: {
                    RequestedOpen: ({ reason }) =>
                      NestedMessage.Toggled({
                        which: "inner",
                        open: true,
                        reason
                      }),
                    RequestedClose: ({ reason }) =>
                      NestedMessage.Toggled({
                        which: "inner",
                        open: false,
                        reason
                      }),
                    Updated: () => undefined,
                    Highlighted: () => undefined,
                    Settled: () => undefined
                  },
                  view: (autocomplete) =>
                    h.div(
                      autocomplete.input(h.input.class("inner")),
                      autocomplete.positioner(h.div.attr("id", "inner"))
                        .children(
                          autocomplete.popup(h.div).children(
                            autocomplete.list(h.div).children(
                              ...autocomplete.items.map(({ label, value }) =>
                                autocomplete.item({ element: h.div, value })
                                  .children(label)
                              )
                            )
                          )
                        )
                    )
                }),
                Autocomplete(h, {
                  key: "picker",
                  props: {
                    open: model.picker,
                    value: "",
                    items,
                    inputInPopup: true
                  },
                  onEmit: {
                    RequestedOpen: ({ reason }) =>
                      NestedMessage.Toggled({
                        which: "picker",
                        open: true,
                        reason
                      }),
                    RequestedClose: ({ reason }) =>
                      NestedMessage.Toggled({
                        which: "picker",
                        open: false,
                        reason
                      }),
                    Updated: () => undefined,
                    Highlighted: () => undefined,
                    Settled: () => undefined
                  },
                  view: (autocomplete) =>
                    h.div(
                      autocomplete.trigger(h.button.class("picker")),
                      autocomplete.positioner(h.div.attr("id", "picker"))
                        .children(
                          autocomplete.popup(h.div).children(
                            autocomplete.input(h.input.class("picker-input")),
                            autocomplete.list(h.div)
                          )
                        )
                    )
                }),
                ...combobox.items.map(({ label, value }) =>
                  combobox.item({ element: h.div, value }).children(label)
                )
              )
            )
          )
        )
    })
})

const input = () => document.querySelector<HTMLInputElement>(".input")!
const item = (value: string) =>
  document.querySelector<HTMLElement>("[data-testid=" + value + "]")!
const type = (value: string) => {
  const target = input()
  target.focus()
  target.value = value
  target.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: value
    })
  )
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
      input().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true
        })
      )
      yield* tick
      input().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true
        })
      )
      yield* tick
      assert.strictEqual(input().value, "Apple")
      assert.strictEqual(document.activeElement, input())
      type("ba")
      yield* tick
      item("banana").dispatchEvent(
        new PointerEvent("click", {
          bubbles: true,
          detail: 1,
          pointerType: "mouse"
        })
      )
      yield* tick
      assert.strictEqual(input().value, "Banana")
      assert.deepStrictEqual(root.model()?.log, [
        "Updated \"ap\" input-change",
        "RequestedOpen input-change",
        "Updated \"Apple\" item-press",
        "RequestedClose item-press",
        "Submitted \"Apple\"",
        "Updated \"ba\" input-change",
        "RequestedOpen input-change",
        "Updated \"Banana\" item-press",
        "RequestedClose item-press",
        "Submitted \"Banana\""
      ])
    }).pipe(Effect.scoped))

  it.effect("with inputInPopup, picking submits a form named by form once, with the picked label", () =>
    Effect.gen(function*() {
      yield* popovers
      const root = yield* BrowserHost.mountEffect(InPopup, {}, yield* container)
      yield* tick
      const trigger = document.getElementById("trigger")!
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true
        })
      )
      yield* tick
      type("ba")
      yield* tick
      item("banana").dispatchEvent(
        new PointerEvent("click", {
          bubbles: true,
          detail: 1,
          pointerType: "mouse"
        })
      )
      yield* tick
      assert.strictEqual(trigger.textContent, "Banana")
      const named = document.querySelectorAll<HTMLInputElement>("[name=q]")
      assert.strictEqual(named.length, 1)
      assert.strictEqual(named[0].value, "Banana")
      assert.strictEqual(named[0].form, document.getElementById("search"))
      assert.deepStrictEqual(root.model()?.log, [
        "RequestedOpen list-navigation",
        "Updated \"ba\" input-change",
        "Updated \"Banana\" item-press",
        "RequestedClose item-press",
        "Submitted \"Banana\""
      ])
    }).pipe(Effect.scoped))

  it.effect("an autocomplete in another's popup keeps its blocker and its controls' focus to itself", () =>
    Effect.gen(function*() {
      yield* popovers
      const root = yield* BrowserHost.mountEffect(Nested, {}, yield* container)
      yield* tick
      const inner = document.querySelector<HTMLInputElement>(".inner")!
      inner.focus()
      yield* tick
      assert.strictEqual(document.activeElement, inner)
      press(document.querySelector("#inner > [data-combobox-blocker]")!)
      yield* tick
      assert.deepStrictEqual(root.model()?.log, [
        "inner RequestedClose outside-press"
      ])
      const picker = document.querySelector<HTMLButtonElement>(".picker")!
      picker.focus()
      yield* tick
      assert.strictEqual(document.activeElement, picker)
      picker.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true
        })
      )
      yield* tick
      assert.deepStrictEqual(root.model()?.log, [
        "inner RequestedClose outside-press",
        "picker RequestedOpen list-navigation"
      ])
      assert.isTrue(document.getElementById("picker")!.matches(":popover-open"))
      assert.strictEqual(
        document.activeElement,
        document.querySelector(".picker-input")
      )
    }).pipe(Effect.scoped))
})
