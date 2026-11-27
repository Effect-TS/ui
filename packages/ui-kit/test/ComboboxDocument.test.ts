// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Combobox, Dialog, Field } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import {
  byId,
  click,
  container,
  holdExits,
  inIframe,
  popovers,
  press,
  tick
} from "./utils/document.ts"

type Rect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const rects = new Map<string, Rect>([["group", {
  x: 100,
  y: 300,
  width: 160,
  height: 30
}]])

class StillResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const geometry = Effect.acquireRelease(
  Effect.sync(() => {
    const element = window.Element.prototype as any
    const root = document.documentElement as any
    const saved = {
      rect: element.getBoundingClientRect,
      ResizeObserver: (window as any).ResizeObserver
    }
    ;(window as any).ResizeObserver = StillResizeObserver
    element.getBoundingClientRect = function(this: Element) {
      const { height, width, x, y } = rects.get(this.id) ??
        { x: 0, y: 0, width: 0, height: 0 }
      return {
        x,
        y,
        width,
        height,
        left: x,
        top: y,
        right: x + width,
        bottom: y + height
      }
    }
    Object.defineProperty(root, "clientWidth", {
      configurable: true,
      value: 1000
    })
    Object.defineProperty(root, "clientHeight", {
      configurable: true,
      value: 800
    })
    return () => {
      element.getBoundingClientRect = saved.rect
      ;(window as any).ResizeObserver = saved.ResizeObserver
      delete root.clientWidth
      delete root.clientHeight
    }
  }),
  (restore) => Effect.sync(restore)
)

const items = [
  { value: "apple", label: "Apple" },
  { value: "apricot", label: "Apricot" },
  { value: "banana", label: "Banana" },
  { value: "grape", label: "Grape" }
]

const Config = Schema.Struct({
  multiple: Schema.Boolean,
  inputInPopup: Schema.Boolean,
  required: Schema.Boolean,
  dialog: Schema.Boolean,
  rtlPopup: Schema.Boolean,
  grid: Schema.Boolean,
  modal: Schema.Boolean
})
type Config = typeof Config.Type

const Message = UiSchema.TaggedEnum({
  RequestedOpen: { reason: Schema.String },
  RequestedClose: { reason: Schema.String },
  Picked: { value: Schema.Array(Schema.String) },
  RequestedInputValue: { inputValue: Schema.String, reason: Schema.String },
  RequestedCloseDialog: { reason: Schema.String }
})

const Page = Html.component({
  name: "Page",
  props: Config,
  model: Schema.Struct({
    open: Schema.Boolean,
    value: Schema.Array(Schema.String),
    inputValue: Schema.String,
    log: Schema.Array(Schema.String)
  }),
  message: Message
}).make({
  init: () => ({ open: false, value: [], inputValue: "", log: [] }),
  update: {
    RequestedOpen: ($, { reason }) => ({
      ...$.model,
      open: true,
      log: [...$.model.log, "RequestedOpen " + reason]
    }),
    RequestedClose: ($, { reason }) => ({
      ...$.model,
      open: false,
      log: [...$.model.log, "RequestedClose " + reason]
    }),
    Picked: ($, { value }) => ({
      ...$.model,
      value,
      log: [...$.model.log, "Picked " + value.join(",")]
    }),
    RequestedInputValue: ($, { inputValue, reason }) => ({
      ...$.model,
      inputValue,
      log: [
        ...$.model.log,
        "RequestedInputValue " + JSON.stringify(inputValue) + " " + reason
      ]
    }),
    RequestedCloseDialog: ($, { reason }) => ({
      ...$.model,
      log: [...$.model.log, "RequestedCloseDialog " + reason]
    })
  },
  view: (h, model) => {
    const multiple = h.props.multiple
    const inPopup = h.props.inputInPopup
    const combobox = Field(h, {
      props: {},
      view: (field) =>
        Combobox(h, {
          props: {
            open: model.open,
            inputValue: model.inputValue,
            value: multiple ? model.value : model.value[0] ?? null,
            items,
            multiple,
            inputInPopup: inPopup,
            name: "fruit",
            required: h.props.required,
            grid: h.props.grid,
            ...(h.props.modal ? { modal: true } : {})
          },
          onEmit: {
            RequestedOpen: ({ reason }) => Message.RequestedOpen({ reason }),
            RequestedClose: ({ reason }) => Message.RequestedClose({ reason }),
            Picked: ({ reason, value }) =>
              reason === "none" && value === null ? undefined : Message.Picked({
                value: value === null
                  ? []
                  : typeof value === "string"
                  ? [value]
                  : value
              }),
            RequestedInputValue: ({ inputValue, reason }) =>
              Message.RequestedInputValue({ inputValue, reason }),
            Highlighted: () => undefined,
            Settled: () => undefined
          },
          view: (combobox) => {
            const input = combobox.input(
              inPopup
                ? h.input.class("input")
                : field.control(h.input.class("input"))
            )
            const list = combobox.list(h.div.attr("id", "list")).children(
              ...combobox.items.map(({ label, value }) =>
                combobox.item({
                  element: h.div.attr("data-testid", value),
                  value
                }).children(label)
              )
            )
            return field.root(h.div.attr("id", "field")).children(
              inPopup
                ? combobox.label(h.div.class("label")).children("Fruit")
                : field.label(h.label.attr("id", "label")).children("Fruit"),
              inPopup
                ? combobox.trigger(h.button.attr("id", "trigger")).children(
                  combobox.value(h.span)
                )
                : multiple
                ? combobox.chips(h.div.attr("id", "group")).children(
                  ...combobox.selectedItems.map(({ label, value }) =>
                    combobox.chip({
                      element: h.div.attr("data-testid", "chip-" + value),
                      value
                    }).children(label)
                  ),
                  input
                )
                : combobox.inputGroup(h.div.attr("id", "group")).children(
                  input,
                  combobox.trigger(h.button.attr("id", "trigger")).children("▾")
                ),
              combobox.positioner(
                h.div.attrs({
                  id: "positioner",
                  style: h.props.rtlPopup ? "direction:rtl" : undefined
                })
              ).children(
                combobox.popup(h.div.attr("id", "popup")).children(
                  ...(inPopup ? [input] : []),
                  ...(h.props.modal
                    ? [
                      h.button.attrs({
                        id: "shown",
                        type: "button",
                        tabindex: "1"
                      }),
                      h.button.attrs({
                        id: "unseen",
                        type: "button",
                        style: "visibility:hidden"
                      }),
                      h.div.attrs({ id: "notes", contenteditable: "TRUE" }),
                      h.div.attrs({
                        id: "skipped",
                        contenteditable: "true",
                        tabindex: "-1"
                      })
                    ]
                    : []),
                  list
                )
              )
            )
          }
        })
    })
    const form = h.form.attr("id", "form").children(
      h.button.attrs({ id: "before", type: "button" }).children("Before"),
      combobox,
      h.button.attrs({ id: "after", type: "button" }).children("After")
    )
    return h.props.dialog
      ? Dialog(h, {
        props: { open: true },
        onEmit: {
          RequestedOpen: () => undefined,
          RequestedClose: ({ reason }) =>
            Message.RequestedCloseDialog({ reason }),
          Settled: () => undefined
        },
        view: (dialog) =>
          h.div(
            dialog.portal(h.dialog)?.children(
              dialog.popup(h.div).children(form)
            )
          )
      })
      : form
  }
})

const mountPage = Effect.fnUntraced(function*(
  config: Partial<Config> = {},
  into: typeof container = container
) {
  yield* popovers
  yield* geometry
  const app = yield* into
  const root = yield* BrowserHost.mountEffect(
    Page,
    {
      multiple: false,
      inputInPopup: false,
      required: false,
      dialog: false,
      rtlPopup: false,
      grid: false,
      modal: false,
      ...config
    },
    app
  )
  yield* tick
  return { app, root, log: () => root.model()?.log ?? [] }
})

const input = () => document.querySelector<HTMLInputElement>(".input")!
const item = (value: string) =>
  document.querySelector<HTMLElement>("[data-testid=" + value + "]")!
const shown = () => byId("positioner").matches(":popover-open")
const drawn = () =>
  Array.from(document.querySelectorAll("[role=option]")).map((option) =>
    option.textContent
  )
const keyEvent = (type: "keydown" | "keyup") =>
(
  target: Element,
  key: string,
  init: KeyboardEventInit = {}
) => {
  const event = new KeyboardEvent(type, {
    key,
    bubbles: true,
    cancelable: true,
    ...init
  })
  target.dispatchEvent(event)
  return event
}
const keydown = keyEvent("keydown")
const keyup = keyEvent("keyup")
const mousedown = (target: Element) => {
  const event = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0
  })
  target.dispatchEvent(event)
  return event
}
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

describe("Combobox in a document", { concurrent: false }, () => {
  it.effect("typing filters below the input, and Enter or clicking an item picks while keeping focus in the input", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      type("ap")
      yield* tick
      assert.isTrue(shown())
      assert.deepStrictEqual(drawn(), ["Apple", "Apricot", "Grape"])
      assert.strictEqual(
        byId("positioner").style.getPropertyValue("top"),
        "330px"
      )
      assert.strictEqual(byId("positioner").getAttribute("data-side"), "bottom")
      assert.strictEqual(document.activeElement, input())
      keydown(input(), "ArrowDown")
      keydown(input(), "ArrowDown")
      yield* tick
      assert.strictEqual(
        input().getAttribute("aria-activedescendant"),
        item("apricot").id
      )
      assert.strictEqual(document.activeElement, input())
      keydown(input(), "Enter")
      yield* tick
      assert.isFalse(shown())
      assert.strictEqual(input().value, "Apricot")
      assert.strictEqual(document.activeElement, input())
      assert.deepStrictEqual(drawn(), ["Apple", "Apricot", "Banana", "Grape"])
      mousedown(byId("trigger"))
      yield* tick
      assert.isTrue(shown())
      assert.strictEqual(document.activeElement, input())
      assert.isTrue(mousedown(item("banana")).defaultPrevented)
      item("banana").dispatchEvent(
        new PointerEvent("click", {
          bubbles: true,
          detail: 1,
          pointerType: "mouse"
        })
      )
      yield* tick
      assert.isFalse(shown())
      assert.strictEqual(input().value, "Banana")
      assert.strictEqual(document.activeElement, input())
      assert.deepStrictEqual(log(), [
        "RequestedInputValue \"ap\" input-change",
        "RequestedOpen input-change",
        "Picked apricot",
        "RequestedInputValue \"Apricot\" item-press",
        "RequestedClose item-press",
        "RequestedOpen trigger-press",
        "Picked banana",
        "RequestedInputValue \"Banana\" item-press",
        "RequestedClose item-press"
      ])
    }).pipe(Effect.scoped))

  it.effect("the Enter that commits an IME composition keeps the text and the list, and a later Enter still closes it", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage()
      const target = input()
      target.focus()
      target.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true })
      )
      for (const value of ["きょうと", "京都"]) {
        target.value = value
        target.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            isComposing: true,
            inputType: "insertCompositionText",
            data: value
          })
        )
        yield* tick
      }
      // UI Events order: the key that commits is a composing keydown, then
      // compositionend, then a keyup that alone looks like a plain Enter.
      keydown(target, "Enter", {
        code: "Enter",
        isComposing: true,
        keyCode: 229
      })
      yield* tick
      target.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true, data: "京都" })
      )
      yield* tick
      keyup(target, "Enter", { code: "Enter", keyCode: 13 })
      yield* tick
      assert.strictEqual(target.value, "京都")
      assert.isTrue(shown())
      keydown(target, "Enter", { code: "Enter", keyCode: 13 })
      yield* tick
      keyup(target, "Enter", { code: "Enter", keyCode: 13 })
      yield* tick
      assert.isFalse(shown())
      assert.deepStrictEqual(log(), [
        "RequestedOpen input-change",
        "RequestedInputValue \"京都\" input-change",
        "RequestedClose none",
        "RequestedInputValue \"\" input-clear"
      ])
    }).pipe(Effect.scoped))

  it.effect("a press outside closes it and puts the selected label back, and focus leaving closes it", () =>
    Effect.gen(function*() {
      const { log, root } = yield* mountPage()
      root.send(Message.Picked({ value: ["banana"] }))
      root.send(
        Message.RequestedInputValue({ inputValue: "Banana", reason: "test" })
      )
      type("gr")
      yield* tick
      assert.deepStrictEqual(drawn(), ["Grape"])
      assert.strictEqual(byId("after").getAttribute("aria-hidden"), "true")
      assert.isNull(byId("group").getAttribute("aria-hidden"))
      press(document.body)
      yield* tick
      assert.isFalse(shown())
      assert.strictEqual(input().value, "Banana")
      assert.isNull(byId("after").getAttribute("aria-hidden"))
      mousedown(input())
      yield* tick
      assert.isTrue(shown())
      assert.deepStrictEqual(drawn(), ["Apple", "Apricot", "Banana", "Grape"])
      byId("after").focus()
      yield* tick
      assert.isFalse(shown())
      assert.deepStrictEqual(
        log().filter((line) =>
          !line.startsWith("RequestedInputValue") && !line.startsWith("Picked")
        ),
        [
          "RequestedOpen input-change",
          "RequestedClose outside-press",
          "RequestedOpen input-press",
          "RequestedClose focus-out"
        ]
      )
    }).pipe(Effect.scoped))

  it.effect("the field's label names the input, and a required combobox blocks its form until it has a value", () =>
    Effect.gen(function*() {
      const { root } = yield* mountPage({ required: true })
      assert.strictEqual(byId("label").getAttribute("for"), input().id)
      const form = byId("form") as HTMLFormElement
      assert.isFalse(form.checkValidity())
      root.send(Message.Picked({ value: ["grape"] }))
      yield* tick
      assert.isTrue(form.checkValidity())
      assert.strictEqual(new FormData(form).get("fruit"), "grape")
    }).pipe(Effect.scoped))

  it.effect("chips: ArrowLeft at the start of the input reaches the chips, and Backspace removes one, whatever the popup's direction", () =>
    Effect.gen(function*() {
      const { log, root } = yield* mountPage({ multiple: true, rtlPopup: true })
      root.send(Message.Picked({ value: ["apple", "banana", "grape"] }))
      yield* tick
      assert.deepStrictEqual(
        Array.from(
          new FormData(byId("form") as HTMLFormElement).getAll("fruit")
        ),
        ["apple", "banana", "grape"]
      )
      input().focus()
      // The popup is right-to-left, the chips are not.
      keydown(input(), "ArrowDown")
      yield* tick
      assert.isTrue(shown())
      input().setSelectionRange(0, 0)
      keydown(input(), "ArrowLeft")
      yield* tick
      assert.strictEqual(document.activeElement, item("chip-grape"))
      keydown(item("chip-grape"), "ArrowLeft")
      assert.strictEqual(document.activeElement, item("chip-banana"))
      // A stylesheet alone turning the chips right-to-left applies at once.
      const sheet = document.head.appendChild(document.createElement("style"))
      sheet.textContent = "#group { direction: rtl }"
      keydown(item("chip-banana"), "ArrowLeft")
      assert.strictEqual(document.activeElement, item("chip-grape"))
      sheet.remove()
      keydown(item("chip-grape"), "ArrowLeft")
      assert.strictEqual(document.activeElement, item("chip-banana"))
      keydown(item("chip-banana"), "Backspace")
      yield* tick
      assert.strictEqual(document.activeElement, item("chip-grape"))
      assert.isNull(document.querySelector("[data-testid=chip-banana]"))
      keydown(item("chip-grape"), "ArrowRight")
      assert.strictEqual(document.activeElement, input())
      keydown(input(), "Backspace")
      yield* tick
      assert.deepStrictEqual(log(), [
        "Picked apple,banana,grape",
        "RequestedOpen list-navigation",
        "Picked apple,grape",
        "Picked apple"
      ])
    }).pipe(Effect.scoped))

  it.effect("a grid's Left and Right follow a direction change while focus stays in the input", () =>
    Effect.gen(function*() {
      yield* mountPage({ grid: true })
      input().focus()
      keydown(input(), "ArrowDown")
      yield* tick
      const highlighted = () =>
        document.getElementById(
          input().getAttribute("aria-activedescendant") ?? ""
        )?.dataset.testid
      assert.strictEqual(highlighted(), "apple")
      byId("field").style.direction = "rtl"
      yield* tick
      keydown(input(), "ArrowLeft")
      yield* tick
      assert.strictEqual(highlighted(), "apricot")
      // Reopened after a change while closed, it reads the direction again.
      keydown(input(), "Escape")
      yield* tick
      byId("field").style.direction = "ltr"
      keydown(input(), "ArrowDown")
      yield* tick
      assert.strictEqual(highlighted(), "apple")
      keydown(input(), "ArrowRight")
      yield* tick
      assert.strictEqual(highlighted(), "apricot")
    }).pipe(Effect.scoped))

  it.effect("with the input in the popup, opening moves focus into it and closing returns it to the trigger", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ inputInPopup: true })
      assert.strictEqual(
        byId("trigger").getAttribute("aria-labelledby"),
        document.querySelector(".label")!.id
      )
      byId("trigger").focus()
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      assert.isTrue(shown())
      assert.strictEqual(document.activeElement, input())
      type("ban")
      yield* tick
      assert.deepStrictEqual(drawn(), ["Banana"])
      keydown(input(), "ArrowDown")
      yield* tick
      keydown(input(), "Enter")
      yield* tick
      assert.isFalse(shown())
      assert.strictEqual(document.activeElement, byId("trigger"))
      assert.strictEqual(byId("trigger").textContent, "Banana")
      assert.strictEqual(input().value, "")
      assert.deepStrictEqual(log(), [
        "RequestedOpen list-navigation",
        "RequestedInputValue \"ban\" input-change",
        "Picked banana",
        "RequestedClose item-press",
        "RequestedInputValue \"\" input-clear"
      ])
    }).pipe(Effect.scoped))

  it.effect("with the input in the popup and modal, the popup is a modal dialog that Tab doesn't leave", () =>
    Effect.gen(function*() {
      yield* mountPage({ inputInPopup: true, modal: true })
      byId("trigger").focus()
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      assert.strictEqual(
        input().closest("[role=dialog]")?.getAttribute("aria-modal"),
        "true"
      )
      assert.strictEqual(document.activeElement, input())
      // Tab order: the button with tabindex="1", then the input and the
      // editing host. The hidden button and the editor with tabindex="-1"
      // are no stops.
      const order = [byId("shown"), input(), byId("notes")]
      for (const shiftKey of [false, false, false, true, true, true]) {
        const at = order.indexOf(document.activeElement as HTMLElement)
        assert.isTrue(keydown(order[at]!, "Tab", { shiftKey }).defaultPrevented)
        assert.strictEqual(
          document.activeElement,
          order.at((at + (shiftKey ? -1 : 1)) % order.length)
        )
      }
    }).pipe(Effect.scoped))

  it.effect("with the input in the popup, Escape gives focus back to the trigger as the close starts, and the popup is inert", () =>
    Effect.gen(function*() {
      yield* holdExits
      yield* mountPage({ inputInPopup: true })
      byId("trigger").focus()
      keydown(byId("trigger"), "ArrowDown")
      yield* tick
      assert.strictEqual(document.activeElement, input())
      assert.isNull(input().closest("[inert]"))
      keydown(input(), "Escape")
      yield* tick
      assert.isTrue(shown())
      assert.isNotNull(input().closest("[inert]"))
      assert.strictEqual(document.activeElement, byId("trigger"))
    }).pipe(Effect.scoped))

  it.effect("with the input in the popup, a touch opens with focus on the popup, and Escape there closes it", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ inputInPopup: true })
      click(byId("trigger"), "touch")
      yield* tick
      const popup = document.querySelector("[role=dialog]")!
      assert.strictEqual(document.activeElement, popup)
      const escape = keydown(popup, "Escape")
      assert.isTrue(escape.defaultPrevented)
      yield* tick
      assert.isFalse(shown())
      assert.deepStrictEqual(log(), [
        "RequestedOpen trigger-press",
        "RequestedClose escape-key"
      ])
    }).pipe(Effect.scoped))

  it.effect("driven from the parent window in an iframe, a mousedown on the modal backdrop is prevented, so the input keeps focus", () =>
    Effect.gen(function*() {
      const { app } = yield* mountPage({ modal: true }, inIframe)
      const doc = app.ownerDocument
      mousedown(doc.querySelector(".input")!)
      yield* tick
      const blocker = doc.querySelector("[data-combobox-blocker]")!
      assert.isTrue(mousedown(blocker).defaultPrevented)
    }).pipe(Effect.scoped))

  it.effect("in a modal dialog, Escape closes only the combobox", () =>
    Effect.gen(function*() {
      const { log } = yield* mountPage({ dialog: true })
      type("a")
      yield* tick
      assert.isTrue(shown())
      const escape = keydown(input(), "Escape")
      assert.isTrue(escape.defaultPrevented)
      yield* tick
      assert.isFalse(shown())
      assert.deepStrictEqual(log(), [
        "RequestedInputValue \"a\" input-change",
        "RequestedOpen input-change",
        "RequestedClose escape-key",
        "RequestedInputValue \"\" input-clear"
      ])
    }).pipe(Effect.scoped))
})
