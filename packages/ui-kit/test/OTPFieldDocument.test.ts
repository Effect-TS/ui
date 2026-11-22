// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { DirectionProvider, Field, OTPField } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { HtmlLocator } from "@effect/ui/html/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, tick } from "./utils/document.ts"

const Message = UiSchema.TaggedEnum({
  Updated: { value: Schema.String },
  Stored: { value: Schema.String },
  Logged: { entry: Schema.String }
})

const Page = Component.define({
  name: "Page",
  scoped: false,
  props: Schema.Struct({ autoSubmit: Schema.Boolean, upper: Schema.Boolean, locked: Schema.Boolean }),
  model: Schema.Struct({ code: Schema.String, log: Schema.Array(Schema.String) }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ code: "", log: [] }),
  update: {
    Updated: (model, { value }, $) =>
      $.props.locked ? model : { ...model, code: $.props.upper ? value.toUpperCase() : value },
    Stored: (model, { value }) => ({ ...model, code: value }),
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

const mountPage = Effect.fnUntraced(function*(
  props: { readonly autoSubmit?: boolean; readonly upper?: boolean; readonly locked?: boolean } = {}
) {
  const app = yield* container
  const root = yield* BrowserHost.mountEffect(Page, { autoSubmit: false, upper: false, locked: false, ...props }, app)
  yield* tick
  const slots = Array.from(app.querySelectorAll<HTMLInputElement>(".slot"))
  const enter = (index: number, text: string) => {
    slots[index]!.value = text
    slots[index]!.dispatchEvent(new InputEvent("input", { bubbles: true }))
  }
  return { app, root, slots, enter, log: () => root.model()?.log ?? [] }
})

const FrameMessage = UiSchema.TaggedEnum({ Pressed: {} })

const Frame = Component.define({
  name: "Frame",
  scoped: false,
  model: Schema.Number,
  message: FrameMessage,
  elements: Html
}).make({
  init: () => 0,
  update: { Pressed: (model) => model + 1 },
  parts: (model, p) => ({
    root: p.part((b) => b.attr("data-presses", String(model)).on("click", FrameMessage.Pressed()))
  })
})

const Labelled = Component.define({
  name: "Labelled",
  scoped: false,
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_model, h) =>
    h.div(
      h.label.attr("for", "otp").children("Verification code"),
      OTPField(h, {
        props: { value: "", length: 4, id: "otp" },
        onEmit: { Updated: () => undefined, Completed: () => undefined, Rejected: () => undefined },
        view: (otpField) =>
          otpField.root(h.div).children(
            otpField.input({ element: h.input, index: 0 }),
            otpField.input({ element: h.input.attr("aria-label", "Second digit"), index: 1 }),
            otpField.input({ element: h.input, index: 2 }),
            Frame(h, {
              view: (frame) => frame.root(h.span).children(otpField.input({ element: h.input, index: 3 }))
            })
          )
      })
    )
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

  it.effect("a code the consumer stores after it declined an edit completes nothing", () =>
    Effect.gen(function*() {
      const { log, root, slots } = yield* mountPage({ autoSubmit: true, locked: true })
      const paste = (text: string) =>
        slots[0]!.dispatchEvent(Object.assign(new Event("paste", { bubbles: true, cancelable: true }), {
          clipboardData: { getData: () => text }
        }))
      paste("1234")
      yield* tick
      root.send(Message.Stored({ value: "9876" }))
      yield* tick
      assert.deepStrictEqual(slots.map((slot) => slot.value), ["9", "8", "7", "6"])
      assert.deepStrictEqual(log(), [])
      root.send(Message.Stored({ value: "1234" }))
      yield* tick
      assert.deepStrictEqual(log(), [])
    }).pipe(Effect.scoped))

  it.effect("a delayed exact match completes and submits once, unless another edit supersedes it", () =>
    Effect.gen(function*() {
      const { enter, log, root, slots } = yield* mountPage({ autoSubmit: true, locked: true })
      const paste = (text: string) =>
        slots[0]!.dispatchEvent(Object.assign(new Event("paste", { bubbles: true, cancelable: true }), {
          clipboardData: { getData: () => text }
        }))
      paste("1234")
      yield* tick
      assert.deepStrictEqual(log(), [])
      root.send(Message.Stored({ value: "1234" }))
      yield* tick
      assert.deepStrictEqual(slots.map((slot) => slot.value), ["1", "2", "3", "4"])
      assert.deepStrictEqual(log(), ["completed 1234", "submitted 1234"])
      yield* tick
      assert.deepStrictEqual(log(), ["completed 1234", "submitted 1234"])

      root.send(Message.Stored({ value: "" }))
      yield* tick
      paste("5678")
      yield* tick
      enter(0, "9")
      yield* tick
      root.send(Message.Stored({ value: "5678" }))
      yield* tick
      assert.deepStrictEqual(slots.map((slot) => slot.value), ["5", "6", "7", "8"])
      assert.deepStrictEqual(log(), ["completed 1234", "submitted 1234"])
    }).pipe(Effect.scoped))

  it.effect("a label for the first slot names the group and every slot with no name of its own", () =>
    Effect.gen(function*() {
      const app = yield* container
      yield* BrowserHost.mountEffect(Labelled, {}, app)
      yield* tick
      const names = () => HtmlLocator.queryAllByRole(app, "textbox").map((slot) => HtmlLocator.nameOf(app, slot))
      const expected = ["Verification code", "Second digit", "Verification code", "Verification code"]
      assert.deepStrictEqual(names(), expected)
      assert.strictEqual(HtmlLocator.nameOf(app, HtmlLocator.getByRole(app, "group")), "Verification code")
      app.querySelector("span")!.click()
      yield* tick
      assert.strictEqual(app.querySelector("span")!.getAttribute("data-presses"), "1")
      assert.deepStrictEqual(names(), expected)
    }).pipe(Effect.scoped))
})
