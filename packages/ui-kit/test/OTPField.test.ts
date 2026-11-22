import type { Mount } from "@effect/ui"
import { Component, View } from "@effect/ui"
import {
  DirectionProvider,
  OTPField,
  type OTPFieldEntryReason,
  OTPFieldEvents,
  type OTPFieldProps,
  type OTPFieldUpdateReason
} from "@effect/ui-kit"
import { DomCommand, Html, HtmlServer } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Redacted, Schema } from "effect"

type Parts = Component.Headless.Parts<typeof OTPField>
type H = View.Helper<never, OTPFieldProps> & View.Tags<Html.Elements, never>

const standIn = {
  elements: Html,
  view: (otpField: Parts, h: H) =>
    otpField.root(h.div.class("otp")).children(
      Array.from({ length: otpField.length }, (_, index) =>
        otpField.input({ element: h.input.attr("aria-label", "Digit " + (index + 1)), index }))
    )
}

const root = Locator.attr("class", "otp")
const slot = (index: number) => Locator.attr("aria-label", "Digit " + (index + 1))
const hidden = Locator.attr("aria-hidden", "true")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const idle = {
  focused: false,
  focusedIndex: 0,
  target: null,
  moving: 0,
  composing: null,
  composed: null,
  edit: null,
  edits: 0,
  label: null,
  android: false
}
type Props = Omit<OTPFieldProps, "value"> & { readonly value: string }
const redact = ({ value, ...rest }: Props): OTPFieldProps => ({ ...rest, value: Redacted.make(value) })
const parts = (props: Props) => Story.parts(OTPField, { model: idle, props: redact(props) })

type Issued = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const mountOf = (s: Rendered, locator: Locator.Locator): Issued =>
  (s.get(locator) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as Issued
const scene = (props: Props, android = false) =>
  HtmlScene.make(OTPField, redact(props), standIn).pipe(
    Effect.map((s) => s.mounted(mountOf(s, slot(0)), { label: null, android }))
  )
type Scene = Effect.Success<ReturnType<typeof scene>>

const settle = (s: Scene) =>
  s.subscription(s.subscriptions.find((key) => key.startsWith("settled"))!, { _tag: "Settled" })
const store = (s: Scene, value: string) => settle(s.props((props) => ({ ...props, value: Redacted.make(value) })))

const commands = (s: Scene): ReadonlyArray<string> =>
  s.current.pending.map(({ command }) => {
    s.resolve(command as never, { found: true, submitted: true } as never)
    return command.name + " " + (command.args as { readonly ref: { readonly key: string } }).ref.key
  })
const inFlight = (s: Scene) => s.keepPending(DomCommand.Focus).keepPending(DomCommand.Select)
const focusOn = (index: number) => [
  "DomCommand.focus OTPFieldSlot[" + index + "]",
  "DomCommand.select OTPFieldSlot[" + index + "]"
]
const submitted = "DomCommand.requestSubmit OTPFieldHiddenInput"

const updated = (value: string, reason: OTPFieldUpdateReason = "input-change") =>
  OTPFieldEvents.Updated({ value: Redacted.make(value), reason })
const completed = (value: string, reason: OTPFieldEntryReason = "input-change") =>
  OTPFieldEvents.Completed({ value: Redacted.make(value), reason })
const rejected = (value: string, reason: OTPFieldEntryReason = "input-change") =>
  OTPFieldEvents.Rejected({ value: Redacted.make(value), reason })
const quiet = (s: Scene) => assert.deepStrictEqual(s.current.emitted, [])

describe("OTPField", () => {
  it.effect("the slots show the code one character each, and a hidden input holds all of it", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: "1 2a3456", length: 4, id: "code", name: "otp", required: true })
      assert.deepStrictEqual([0, 1, 2, 3].map((index) => s.get(slot(index)).props?.value), ["1", "2", "3", "4"])
      assert.deepInclude(s.get(root).attrs, {
        role: "group",
        "data-complete": "",
        "data-filled": "",
        "data-required": ""
      })
      assert.deepInclude(s.get(slot(0)).attrs, {
        id: "code",
        type: "text",
        inputmode: "numeric",
        pattern: "\\d{1}",
        autocomplete: "one-time-code",
        autocorrect: "off",
        spellcheck: "false",
        enterkeyhint: "next",
        maxlength: "4",
        tabindex: "-1",
        required: "",
        "data-filled": "",
        "data-complete": ""
      })
      assert.deepInclude(s.get(slot(3)).attrs, {
        id: "code-4",
        autocomplete: "off",
        enterkeyhint: "done",
        tabindex: "0"
      })
      assert.isUndefined(s.get(slot(3)).attrs?.maxlength)
      assert.deepInclude(s.get(hidden).attrs, {
        type: "text",
        name: "otp",
        autocomplete: "one-time-code",
        inputmode: "numeric",
        minlength: "4",
        maxlength: "4",
        pattern: "\\d{4}",
        required: "",
        tabindex: "-1"
      })
      assert.strictEqual(s.get(hidden).props?.value, "1234")
      assert.strictEqual(s.get(root).children?.at(-1), s.get(hidden))

      s.props(
        redact({ value: "a1", length: 4, validationType: "none", readOnly: true, disabled: true, form: "login" })
      )
      assert.deepStrictEqual([0, 1, 2].map((index) => s.get(slot(index)).props?.value), ["a", "1", ""])
      for (const part of [root, slot(0), slot(2)]) {
        assert.deepInclude(s.get(part).attrs, { "data-disabled": "", "data-readonly": "" })
        assert.isUndefined(s.get(part).attrs?.["data-complete"])
      }
      assert.deepInclude(s.get(slot(2)).attrs, { disabled: "", readonly: "", form: "login", tabindex: "0" })
      for (const name of ["pattern", "inputmode", "data-filled", "required"]) {
        assert.isUndefined(s.get(slot(2)).attrs?.[name])
      }
      assert.deepInclude(s.get(hidden).attrs, { disabled: "", readonly: "", form: "login" })
      assert.isUndefined(s.get(hidden).attrs?.pattern)
      s.parts((otpField) => {
        assert.strictEqual(Redacted.value(otpField.value), "a1")
        assert.deepInclude(otpField, {
          length: 4,
          complete: false,
          filled: true,
          focused: false,
          disabled: true,
          readOnly: true,
          required: false
        })
      })
    }))

  it.effect("typing reports the code and moves focus on, and the stored code completes it", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: "", length: 4 })
      s.type(slot(0), "1").emitted(updated("1"))
      assert.deepStrictEqual(commands(s), focusOn(1))
      assert.deepStrictEqual(commands(store(s, "1")), [])
      s.type(slot(0), "1")
      quiet(s)
      assert.deepStrictEqual(commands(s), focusOn(1))
      s.type(slot(1), "x").emitted(rejected("x"))
      assert.deepStrictEqual(commands(s), ["DomCommand.select OTPFieldSlot[1]"])
      s.type(slot(1), "23").emitted(updated("123"))
      assert.deepStrictEqual(commands(s), focusOn(3))
      store(s, "123")
      s.type(slot(3), "45678").emitted(rejected("45678"), updated("1234"))
      assert.deepStrictEqual(commands(s), focusOn(3))
      quiet(s)
      store(s, "1234").emitted(completed("1234"))
      s.type(slot(3), "5").emitted(updated("1235"))
      commands(s)
      store(s, "1235")
      quiet(s)
      s.type(slot(1), "").emitted(updated("135", "input-clear"))
      assert.deepStrictEqual(commands(s), [])
    }))

  it.effect("edits made before focus moves or the consumer stores the last one follow the pending slot and code", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: "", length: 4 })
      s.focus(slot(0))
      commands(s)
      inFlight(s.type(slot(0), "1").emitted(updated("1")))
      store(s, "1")
      // Focus is still on the first slot, which shows its own character and then the one typed.
      inFlight(s.type(slot(0), "12").emitted(updated("12")))
      inFlight(s.keydown(slot(0), "Backspace").emitted(updated("1", "keyboard")))
      inFlight(s.type(slot(0), "13").emitted(updated("13")))
      inFlight(s.fire(slot(0), "paste", { text: "45" }).emitted(updated("1345", "input-paste")))
      store(s, "1345").emitted(completed("1345", "input-paste"))
      assert.deepStrictEqual(commands(s), [1, 2, 1, 2, 3].flatMap(focusOn))
      s.type(slot(0), "56").emitted(updated("5645"))
      assert.deepStrictEqual(commands(s), focusOn(2))
    }))

  it.effect("only the consumer's answer to an edit completes the code, whatever it stores", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: "", length: 4, autoSubmit: true })
      inFlight(s.fire(slot(0), "paste", { text: "1234" }).emitted(updated("1234", "input-paste")))
      assert.deepStrictEqual(commands(settle(s)), [...focusOn(3), ...focusOn(0)])
      quiet(s)
      assert.deepStrictEqual(commands(store(s, "9876")), [])
      quiet(s)

      const upper = yield* scene({ value: "", length: 2, validationType: "none" })
      upper.type(slot(0), "ß").emitted(updated("ß"))
      commands(upper)
      store(upper, "SS").emitted(completed("SS"))
      store(upper, "S")
      upper.type(slot(1), "-").emitted(updated("S-"))
      commands(upper)
      store(upper, "")
      quiet(upper)
    }))

  it.effect("the keys move between slots and remove characters", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: "123", length: 5 })
      const press = (index: number, key: string, modifiers?: { readonly ctrl?: boolean; readonly meta?: boolean }) =>
        commands(s.keydown(slot(index), key, modifiers).expectDefaultPrevented())
      assert.deepStrictEqual(press(2, "ArrowLeft"), focusOn(1))
      assert.deepStrictEqual(press(2, "ArrowRight"), focusOn(3))
      assert.deepStrictEqual(press(3, "ArrowRight"), focusOn(3))
      assert.deepStrictEqual(press(0, "ArrowLeft"), focusOn(0))
      assert.deepStrictEqual(press(2, "ArrowLeft", { ctrl: true }), focusOn(0))
      assert.deepStrictEqual(press(0, "ArrowRight", { meta: true }), focusOn(3))
      assert.deepStrictEqual(press(2, "Home"), focusOn(0))
      assert.deepStrictEqual(press(2, "ArrowUp"), focusOn(0))
      assert.deepStrictEqual(press(0, "End"), focusOn(3))
      assert.deepStrictEqual(press(0, "ArrowDown"), focusOn(3))
      s.keydown(slot(0), "Tab").expectIgnored().expectDefaultPrevented(false)
      s.keydown(slot(0), "7").expectIgnored().expectDefaultPrevented(false)

      s.keydown(slot(1), "Backspace").expectDefaultPrevented().emitted(updated("13", "keyboard"))
      assert.deepStrictEqual(commands(s), focusOn(0))
      store(s, "13")
      s.keydown(slot(2), "Backspace").emitted(updated("1", "keyboard"))
      assert.deepStrictEqual(commands(s), focusOn(1))
      store(s, "123")
      s.keydown(slot(0), "Delete").expectDefaultPrevented().emitted(updated("23", "keyboard"))
      assert.deepStrictEqual(commands(s), focusOn(0))
      store(s, "23")
      s.keydown(slot(1), "Backspace", { ctrl: true }).emitted(updated("", "keyboard"))
      assert.deepStrictEqual(commands(s), focusOn(0))
      store(s, "")
      assert.deepStrictEqual(commands(s.keydown(slot(0), "Backspace").expectDefaultPrevented()), [])
      quiet(s)

      store(s, "123").shared(DirectionProvider, { direction: "rtl" })
      assert.deepStrictEqual(press(1, "ArrowLeft"), focusOn(2))
      assert.deepStrictEqual(press(1, "ArrowRight"), focusOn(0))
    }))

  it.effect("pasted text and hidden-input autofill fill the slots and can submit the form", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: "12", length: 4, autoSubmit: true })
      s.fire(slot(2), "paste", { text: " 3-4 9" }).expectDefaultPrevented().emitted(
        rejected(" 3-4 9", "input-paste"),
        updated("1234", "input-paste")
      )
      assert.deepStrictEqual(commands(s), focusOn(3))
      store(s, "1234").emitted(completed("1234", "input-paste"))
      assert.deepStrictEqual(commands(s), [submitted])
      s.fire(slot(0), "paste", { text: "1234" }).emitted(completed("1234", "input-paste"))
      assert.deepStrictEqual(commands(s), [...focusOn(3), submitted])
      s.fire(slot(0), "paste", { text: "ab" }).expectDefaultPrevented().emitted(rejected("ab", "input-paste"))
      assert.deepStrictEqual(commands(s), [])

      store(s, "12")
      s.type(hidden, "98 76x").emitted(rejected("98 76x"), updated("9876"))
      assert.deepStrictEqual(commands(s), focusOn(3))
      assert.deepStrictEqual(commands(store(s, "9876").emitted(completed("9876"))), [submitted])
    }))

  it.effect("text an input method composes is entered once, when the composition ends", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: "", length: 4, validationType: "none" })
      const composing = (value: string) => s.fire(slot(0), "input", { value, checked: false, composing: true })
      composing("k")
      quiet(s)
      s.keydown(slot(0), "Backspace").expectIgnored().expectDefaultPrevented(false)
      composing("か")
      s.fire(slot(0), "compositionend", { value: "か" }).emitted(updated("か"))
      assert.deepStrictEqual(commands(s), focusOn(1))
      // Some browsers send the last `input` after the composition ended.
      s.type(slot(0), "か")
      quiet(s)
      assert.deepStrictEqual(commands(store(s, "か")), [])
      s.type(slot(0), "き").emitted(updated("き"))
      commands(s)

      // An Android keyboard composes all the time, so each `input` is entered as it comes.
      const android = yield* scene({ value: "", length: 4 }, true)
      android.fire(slot(0), "input", { value: "1", checked: false, composing: true }).emitted(updated("1"))
      commands(android)
      android.fire(slot(0), "compositionend", { value: "1" })
      quiet(android)
    }))

  it.effect("focus shows on every part, selects the slot's text, and never rests past the first empty slot", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: "12", length: 4 })
      assert.deepStrictEqual(commands(s.focus(slot(0))), ["DomCommand.select OTPFieldSlot[0]"])
      for (const part of [root, slot(0), slot(3)]) assert.strictEqual(s.get(part).attrs?.["data-focused"], "")
      assert.deepStrictEqual([0, 2].map((index) => s.get(slot(index)).attrs?.tabindex), ["0", "-1"])
      assert.deepStrictEqual(commands(s.fire(slot(0), "mousedown", {}).expectDefaultPrevented()), [
        "DomCommand.select OTPFieldSlot[0]"
      ])
      s.fire(slot(1), "mousedown", {}).expectIgnored().expectDefaultPrevented(false)
      s.blur(slot(0))
      assert.isUndefined(s.get(root).attrs?.["data-focused"])
      assert.deepStrictEqual([0, 2].map((index) => s.get(slot(index)).attrs?.tabindex), ["-1", "0"])
      assert.deepStrictEqual(commands(s.focus(slot(3))), focusOn(2))
      assert.deepStrictEqual(commands(s.focus(hidden)), focusOn(0))
      s.focus(slot(2))
      commands(s)
      assert.deepStrictEqual(commands(store(s, "")), focusOn(0))
      s.props((props) => ({ ...props, disabled: true }))
      assert.isUndefined(s.get(root).attrs?.["data-focused"])
      assert.include(s.subscriptions, "disabledWhileFocused")
      s.subscription("disabledWhileFocused", { _tag: "DisabledWhileFocused" }).props((props) => ({
        ...props,
        disabled: false
      }))
      assert.isUndefined(s.get(root).attrs?.["data-focused"])
    }))

  it.effect("a disabled field reports nothing, and a read-only one keeps only the navigation keys", () =>
    Effect.gen(function*() {
      const s = yield* scene({ value: "12", length: 4, disabled: true })
      const edits = () => {
        s.type(slot(0), "5")
        s.fire(slot(0), "paste", { text: "56" })
        s.fire(slot(0), "compositionend", { value: "5" })
        s.type(hidden, "5678")
        quiet(s)
        assert.deepStrictEqual(commands(s), [])
      }
      edits()
      for (const step of [() => s.keydown(slot(1), "ArrowLeft"), () => s.focus(slot(0)), () => s.focus(hidden)]) {
        assert.deepStrictEqual(commands(step()), [])
      }
      s.keydown(slot(1), "Backspace")
      quiet(s)

      s.props(redact({ value: "12", length: 4, readOnly: true }))
      edits()
      s.keydown(slot(1), "Backspace").expectIgnored().expectDefaultPrevented(false)
      s.keydown(slot(1), "Delete").expectIgnored().expectDefaultPrevented(false)
      assert.deepStrictEqual(commands(s.keydown(slot(1), "ArrowLeft")), focusOn(0))
    }))

  it("a slot keeps the consumer's class, name and type, but the field's own attributes win, present or absent", () => {
    const element = h.input.class("slot").attrs({
      "aria-label": "Second",
      type: "tel",
      "data-filled": "yes",
      "data-complete": "yes",
      "data-focused": "yes",
      tabindex: "5",
      maxlength: "9",
      pattern: "x",
      inputmode: "url",
      autocomplete: "name",
      disabled: "",
      "aria-disabled": "true",
      readonly: "",
      required: "",
      id: "own"
    })
    const built = View.build(parts({ value: "1", length: 2, validationType: "none" }).input({ element, index: 1 }), [])
    assert.deepStrictEqual(built.attrs, {
      class: "slot",
      "aria-label": "Second",
      type: "tel",
      id: "own",
      tabindex: "0",
      autocomplete: "off",
      autocorrect: "off",
      spellcheck: "false",
      enterkeyhint: "done"
    })
    const typeOf = (props: Partial<Props>, input: typeof h.input = h.input) =>
      View.build(parts({ value: "", length: 2, ...props }).input({ element: input, index: 0 }), []).attrs.type
    assert.strictEqual(typeOf({ mask: true }), "password")
    assert.strictEqual(typeOf({ mask: true }, h.input.attr("type", "tel") as never), "tel")
    assert.strictEqual(
      View.build(parts({ value: "", length: 2, id: "code" }).input({ element, index: 1 }), []).attrs.id,
      "code-2"
    )

    const group = View.build(
      parts({ value: "", length: 2 }).root(
        h.div.class("otp").attrs({ role: "list", "data-focused": "yes", "data-filled": "yes" })
      ),
      []
    )
    assert.deepStrictEqual(group.attrs, { class: "otp", role: "group" })
  })

  it("a slot is an input at an index of its own inside the length, which is a positive whole number", () => {
    const otpField = parts({ value: "", length: 2 })
    assert.throws(() => otpField.input({ element: h.input, index: 2 }), /no slot at index 2 in a field of 2 slots/)
    assert.throws(() => otpField.input({ element: h.input, index: 0.5 }), /no slot at index 0.5/)
    const twice = otpField.root(h.div).children(
      otpField.input({ element: h.input, index: 1 }),
      h.div(otpField.input({ element: h.input, index: 1 }))
    )
    assert.throws(() => View.build(twice, []), /the slot at index 1 was drawn twice/)
    assert.throws(() => otpField.input({ element: h.div as never, index: 0 }), /a part for <input> was given <div>/)
    assert.throws(() => parts({ value: "", length: 0 }), /length is the number of slots/)
    assert.throws(() => parts({ value: "", length: 2.5 }), /length is the number of slots/)
  })

  it.effect("server-rendered page state and non-input markup do not leak the verification code", () =>
    Effect.gen(function*() {
      const secret = "847291"
      const Page = Component.define({
        name: "VerifyPage",
        scoped: false,
        model: Schema.Struct({}),
        message: Schema.Never,
        elements: Html
      }).make({
        init: () => ({}),
        update: (model) => model,
        view: (_model, h) =>
          OTPField(h, {
            key: "otp",
            props: { value: Redacted.make(secret), length: 6, name: "code" },
            view: (otpField) =>
              otpField.root(h.div.class("otp")).children(
                Array.from({ length: otpField.length }, (_, index) => otpField.input({ element: h.input, index }))
              )
          })
      })
      const { html, state } = yield* HtmlServer.renderToHtml(Page, {})
      assert.deepStrictEqual(state["/VerifyPage"], {})
      assert.deepStrictEqual(state["~deferred"], ["/VerifyPage/OTPField[otp]"])
      assert.notInclude(JSON.stringify(state), secret)
      assert.include(html, `value="${secret}"`)
      const withoutInputValues = html.replace(/<input\b[^>]*>/g, (tag) => tag.replace(/\svalue="[^"]*"/g, ""))
      assert.notInclude(withoutInputValues, secret)
    }))
})
