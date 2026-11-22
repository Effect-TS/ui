// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { DirectionProvider, Field, OTPField } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, tick } from "./utils/document.ts"

const Message = UiSchema.TaggedEnum({
  Updated: { value: Schema.String },
  Logged: { entry: Schema.String }
})

const Page = Component.define({
  name: "Page",
  props: Schema.Struct({ autoSubmit: Schema.Boolean, upper: Schema.Boolean }),
  model: Schema.Struct({ code: Schema.String, log: Schema.Array(Schema.String) }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ code: "", log: [] }),
  update: {
    Updated: (model, { value }, $) => ({ ...model, code: $.props.upper ? value.toUpperCase() : value }),
    Logged: (model, { entry }) => ({ ...model, log: [...model.log, entry] })
  },
  view: (model, h) =>
    h.form.onSubmit(({ fields }) => Message.Logged({ entry: "submitted " + fields.code })).children(
      DirectionProvider(h, {
        props: { direction: "rtl" },
        view: () =>
          Field(h, {
            props: { described: true, filled: model.code !== "" },
            view: (field) =>
              field.root(h.div.id("field")).children(
                field.legend(h.div).children("Verification code"),
                OTPField(h, {
                  props: {
                    value: model.code,
                    length: 4,
                    name: "code",
                    validationType: "alphanumeric",
                    autoSubmit: h.props.autoSubmit,
                    disabled: field.disabled
                  },
                  onEmit: {
                    Updated: ({ value }) => Message.Updated({ value }),
                    Completed: ({ value }) => Message.Logged({ entry: "completed " + value }),
                    Rejected: ({ value }) => Message.Logged({ entry: "rejected " + value })
                  },
                  view: (otpField) =>
                    otpField.root(field.group(h.div.id("otp"))).children(
                      Array.from(
                        { length: otpField.length },
                        (_, index) => otpField.input({ element: field.member(h.input.class("slot")), index })
                      )
                    )
                }),
                field.description(h.p).children("Sent to your phone")
              )
          })
      }),
      h.button.attr("type", "button").children("After")
    )
})

const mountPage = Effect.fnUntraced(function*(props: { readonly autoSubmit?: boolean; readonly upper?: boolean } = {}) {
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(Page, { autoSubmit: false, upper: false, ...props }, app)
  yield* tick
  const slots = Array.from(app.querySelectorAll<HTMLInputElement>(".slot"))
  const enter = (index: number, text: string) => {
    slots[index]!.value = text
    slots[index]!.dispatchEvent(new InputEvent("input", { bubbles: true }))
  }
  return { app, slots, enter, log: () => root.model()?.log ?? [] }
})

const focusedSlot = (slots: ReadonlyArray<HTMLInputElement>) =>
  slots.indexOf(document.activeElement as HTMLInputElement)

describe("OTPField in a document", { concurrent: false }, () => {
  it.effect("typing moves focus on, and the complete code submits its form", () =>
    Effect.gen(function*() {
      const { app, enter, log, slots } = yield* mountPage({ autoSubmit: true, upper: true })
      const hidden = app.querySelector<HTMLInputElement>("input[name=code]")!
      slots[0]!.focus()
      yield* tick
      enter(0, "a")
      yield* tick
      assert.strictEqual(slots[0]!.value, "A")
      assert.strictEqual(focusedSlot(slots), 1)
      enter(1, "!")
      yield* tick
      assert.strictEqual(slots[1]!.value, "")
      assert.strictEqual(focusedSlot(slots), 1)
      enter(1, "b2")
      yield* tick
      assert.strictEqual(focusedSlot(slots), 3)
      assert.deepStrictEqual(log(), ["rejected !"])
      enter(3, "c")
      yield* tick
      assert.deepStrictEqual(slots.map((slot) => slot.value), ["A", "B", "2", "C"])
      assert.strictEqual(hidden.value, "AB2C")
      assert.deepStrictEqual(log(), ["rejected !", "completed AB2C", "submitted AB2C"])
      // Right to left, Right moves back a slot. The slot's text is selected, so the next key replaces it.
      slots[3]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }))
      yield* tick
      assert.strictEqual(focusedSlot(slots), 2)
      assert.deepStrictEqual([slots[2]!.selectionStart, slots[2]!.selectionEnd], [0, 1])
    }).pipe(Effect.scoped))

  it.effect("in a field, the legend names the group and each slot, and the slots are focused and touched as one", () =>
    Effect.gen(function*() {
      const { app, enter, slots } = yield* mountPage()
      const field = app.querySelector("#field")!
      const group = app.querySelector("#otp")!
      const label = group.getAttribute("aria-labelledby")
      assert.strictEqual(app.querySelector("#" + label)?.textContent, "Verification code")
      for (const slot of slots) {
        assert.strictEqual(slot.getAttribute("aria-labelledby"), label)
        assert.strictEqual(slot.getAttribute("aria-describedby"), app.querySelector("p")!.id)
      }
      assert.isFalse(app.querySelector("input[name=code]")!.hasAttribute("aria-labelledby"))
      slots[0]!.focus()
      yield* tick
      enter(0, "7")
      yield* tick
      assert.strictEqual(focusedSlot(slots), 1)
      for (const part of [field, group, ...slots]) {
        assert.isTrue(part.hasAttribute("data-focused"))
        assert.isFalse(part.hasAttribute("data-touched"))
      }
      // The field as a whole is filled, and each slot says whether it holds a character.
      assert.deepStrictEqual(
        [field, group, ...slots].map((part) => part.hasAttribute("data-filled")),
        [true, true, true, false, false, false]
      )
      app.querySelector("button")!.focus()
      yield* tick
      for (const part of [field, group, ...slots]) {
        assert.isFalse(part.hasAttribute("data-focused"))
        assert.isTrue(part.hasAttribute("data-touched"))
      }
    }).pipe(Effect.scoped))
})
