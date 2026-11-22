// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { NumberField, type NumberFieldProps } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, tick } from "./utils/document.ts"

const Value = Schema.NullOr(Schema.Number)
const Message = UiSchema.TaggedEnum({
  Updated: { value: Value, reason: Schema.String },
  Committed: { value: Value, reason: Schema.String }
})

const mount = Effect.fnUntraced(function*(props: Omit<NumberFieldProps, "value">, value: number | null = 5) {
  const log: Array<string> = []
  const Amount = Component.define({
    name: "Amount",
    model: Schema.Struct({ value: Value }),
    message: Message,
    elements: Html
  }).make({
    init: () => ({ value }),
    update: {
      Updated: (_, { reason, value }) => {
        log.push("updated " + value + " " + reason)
        return { value }
      },
      Committed: (model, { reason, value }) => {
        log.push("committed " + value + " " + reason)
        return model
      }
    },
    view: (model, h) =>
      NumberField(h, {
        props: { ...props, value: model.value },
        onEmit: {
          Updated: ({ reason, value }) => Message.Updated({ value, reason }),
          Committed: ({ reason, value }) => Message.Committed({ value, reason })
        },
        view: (numberField) =>
          numberField.root(h.div).children(
            numberField.scrubArea({ element: h.span.class("scrub") }).children(
              numberField.scrubAreaCursor(h.span.class("cursor"))
            ),
            numberField.decrement({ element: h.button.class("decrement") }),
            numberField.input(h.input.class("amount")),
            numberField.increment({ element: h.button.class("increment") })
          )
      })
  })
  const app = yield* container
  yield* BrowserHost.mountEffect(Amount, {}, app)
  yield* tick
  const input = app.querySelector<HTMLInputElement>(".amount")!
  const taken = () => log.splice(0)
  return { app, input, taken }
})

const wait = (ms: number) => Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))

const blocks = (input: HTMLInputElement, key: string, init: KeyboardEventInit = {}) =>
  !input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }))

const select = (input: HTMLInputElement, text: string, start: number, end = start) => {
  input.value = text
  input.setSelectionRange(start, end)
}

const paste = (input: HTMLInputElement, text: string) => {
  const clipboardData = new DataTransfer()
  clipboardData.setData("text/plain", text)
  return !input.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }))
}

// happy-dom's WheelEvent drops the modifier keys.
const turn = (target: HTMLInputElement, init: WheelEventInit) =>
  !target.dispatchEvent(
    Object.assign(new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init }), {
      shiftKey: init.shiftKey ?? false,
      altKey: init.altKey ?? false,
      ctrlKey: init.ctrlKey ?? false
    })
  )

const pointer = (target: EventTarget, type: string, init: PointerEventInit = {}) =>
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerType: "mouse", ...init })
  )

describe("NumberField in a document", { concurrent: false }, () => {
  it.effect("the input takes only the keys that can be part of a number in its locale", () =>
    Effect.gen(function*() {
      const { input } = yield* mount({ locale: "en-US", min: -100 })
      select(input, "12.5", 4)
      assert.isTrue(blocks(input, "a"))
      assert.isTrue(blocks(input, "."))
      assert.isTrue(blocks(input, "€"))
      assert.isFalse(blocks(input, "7"))
      assert.isFalse(blocks(input, ","))
      assert.isFalse(blocks(input, "Backspace"))
      assert.isFalse(blocks(input, "a", { ctrlKey: true }))
      assert.isFalse(blocks(input, "a", { isComposing: true }))
      select(input, "12.5", 0, 4)
      assert.isFalse(blocks(input, "."))
    }))

  it.effect("a sign is taken once, or in place of the one selected, and a minus only when the range goes below zero", () =>
    Effect.gen(function*() {
      const { input } = yield* mount({ locale: "en-US", min: -100 })
      select(input, "12.5", 0)
      assert.isFalse(blocks(input, "-"))
      assert.isFalse(blocks(input, "+"))
      select(input, "-12.5", 5)
      assert.isTrue(blocks(input, "-"))
      assert.isTrue(blocks(input, "+"))
      select(input, "-12.5", 0, 1)
      assert.isFalse(blocks(input, "+"))
      assert.isFalse(blocks(input, "-"))
      const positive = yield* mount({ locale: "en-US", min: 0 })
      select(positive.input, "12.5", 0)
      assert.isTrue(blocks(positive.input, "-"))
    }))

  it.effect("a locale's own separators and one currency sign are taken", () =>
    Effect.gen(function*() {
      const { input } = yield* mount({ locale: "de-DE", format: { style: "currency", currency: "EUR" } })
      select(input, "2.345,75 ", 9)
      assert.isFalse(blocks(input, "€"))
      assert.isTrue(blocks(input, "$"))
      assert.isTrue(blocks(input, ","))
      assert.isFalse(blocks(input, "."))
      select(input, "2.345,75 €", 10)
      assert.isTrue(blocks(input, "€"))
    }))

  it.effect("pasted text goes in at the caret, keeps only what the locale can show, and is dropped unless it makes a number", () =>
    Effect.gen(function*() {
      const { input, taken } = yield* mount({ locale: "en-US" }, 0)
      select(input, "0", 1)
      assert.isTrue(paste(input, "1,234"))
      assert.strictEqual(input.value, "01,234")
      assert.deepStrictEqual([input.selectionStart, input.selectionEnd], [6, 6])
      yield* tick
      assert.deepStrictEqual(taken(), ["updated 1234 input-paste"])
      assert.strictEqual(input.value, "01,234")
      input.setSelectionRange(0, 6)
      assert.isTrue(paste(input, "USD 1,250.75 total"))
      assert.strictEqual(input.value, "1,250.75")
      yield* tick
      assert.deepStrictEqual(taken(), ["updated 1250.75 input-paste"])
      input.setSelectionRange(1, 1)
      assert.isTrue(paste(input, "abc"))
      assert.strictEqual(input.value, "1,250.75")
      input.setSelectionRange(0, 8)
      assert.isTrue(paste(input, "-"))
      assert.strictEqual(input.value, "1,250.75")
      yield* tick
      assert.deepStrictEqual(taken(), [])
    }))

  it.effect("a pressed button steps at once, repeats while it is held, and commits on the release", () =>
    Effect.gen(function*() {
      const { app, input, taken } = yield* mount({ locale: "en-US", max: 12 })
      const increment = app.querySelector<HTMLButtonElement>(".increment")!
      assert.isFalse(pointer(increment, "pointerdown"))
      yield* tick
      assert.deepStrictEqual(taken(), ["updated 6 increment-press"])
      assert.strictEqual(document.activeElement, input)
      assert.deepStrictEqual([input.selectionStart, input.selectionEnd], [1, 1])
      yield* wait(250)
      assert.deepStrictEqual(taken(), [])
      yield* wait(700)
      assert.deepStrictEqual(taken(), [7, 8, 9, 10, 11, 12].map((value) => "updated " + value + " increment-press"))
      assert.strictEqual(increment.getAttribute("aria-disabled"), "true")
      pointer(window, "pointerup")
      yield* tick
      assert.deepStrictEqual(taken(), ["committed 12 increment-press"])
      assert.strictEqual(input.value, "12")
      yield* wait(200)
      assert.deepStrictEqual(taken(), [])
    }))

  it.effect("a press with another button, and the click that follows a mouse press, step nothing", () =>
    Effect.gen(function*() {
      const { app, taken } = yield* mount({ locale: "en-US" })
      const decrement = app.querySelector<HTMLButtonElement>(".decrement")!
      pointer(decrement, "pointerdown", { button: 2 })
      decrement.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
      yield* tick
      assert.deepStrictEqual(taken(), [])
      decrement.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0, shiftKey: true }))
      yield* tick
      assert.deepStrictEqual(taken(), ["updated -5 decrement-press", "committed -5 decrement-press"])
    }))

  it.effect("the wheel steps a focused input only, and only when asked to", () =>
    Effect.gen(function*() {
      const { input, taken } = yield* mount({ locale: "en-US", allowWheelScrub: true })
      assert.isFalse(turn(input, { deltaY: 100 }))
      input.focus()
      assert.isTrue(turn(input, { deltaY: 100 }))
      assert.isTrue(turn(input, { deltaY: -100, shiftKey: true }))
      assert.isFalse(turn(input, { deltaX: 100 }))
      assert.isFalse(turn(input, { deltaY: 100, ctrlKey: true }))
      yield* tick
      assert.deepStrictEqual(taken(), [
        "updated 4 wheel",
        "committed 4 wheel",
        "updated 14 wheel",
        "committed 14 wheel"
      ])
      const still = yield* mount({ locale: "en-US" })
      still.input.focus()
      assert.isFalse(turn(still.input, { deltaY: 100 }))
      yield* tick
      assert.deepStrictEqual(still.taken(), [])
    }))

  it.effect("a drag on the scrub area changes the value by the distance, and commits on the release", () =>
    Effect.gen(function*() {
      const { app, input, taken } = yield* mount({ locale: "en-US" })
      const area = app.querySelector<HTMLElement>(".scrub")!
      const root = app.firstElementChild!
      assert.isFalse(pointer(area, "pointerdown", { clientX: 10, clientY: 10 }))
      yield* tick
      assert.isTrue(root.hasAttribute("data-scrubbing"))
      assert.strictEqual(document.activeElement, input)
      assert.isNull(app.querySelector(".cursor"))
      pointer(window, "pointermove", { movementX: 4 })
      pointer(window, "pointermove", { movementX: 1 })
      pointer(window, "pointermove", { movementX: -3, shiftKey: true })
      yield* tick
      assert.deepStrictEqual(taken(), ["updated 9 scrub", "updated -21 scrub"])
      pointer(window, "pointerup")
      yield* tick
      assert.deepStrictEqual(taken(), ["committed -21 scrub"])
      assert.isFalse(root.hasAttribute("data-scrubbing"))
      assert.strictEqual(input.value, "-21")
      pointer(window, "pointermove", { movementX: 9 })
      yield* tick
      assert.deepStrictEqual(taken(), [])
    }))

  it.effect("a disabled field takes no press, drag or wheel", () =>
    Effect.gen(function*() {
      const { app, input, taken } = yield* mount({ locale: "en-US", disabled: true, allowWheelScrub: true })
      assert.isTrue(pointer(app.querySelector(".increment")!, "pointerdown"))
      pointer(window, "pointerup")
      assert.isTrue(pointer(app.querySelector(".scrub")!, "pointerdown"))
      assert.isTrue(pointer(window, "pointermove", { movementX: 9 }))
      pointer(window, "pointerup")
      assert.isFalse(turn(input, { deltaY: 100 }))
      yield* wait(500)
      assert.deepStrictEqual(taken(), [])
    }))
})
