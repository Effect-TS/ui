import { type Component, type Mount, View } from "@effect/ui"
import {
  DirectionProvider,
  OTPField,
  type OTPFieldEntryReason,
  OTPFieldEvents,
  type OTPFieldProps,
  type OTPFieldUpdateReason
} from "@effect/ui-kit"
import { Html, HtmlCommand, HtmlServer } from "@effect/ui/html"
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
        otpField.input({
          element: h.input.attr("aria-label", "Digit " + (index + 1)),
          index
        }))
    )
}

const root = Locator.attr("class", "otp")
const slot = (index: number) =>
  Locator.attr("aria-label", "Digit " + (index + 1))
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
  android: false,
  rtl: false
}
type Props = Omit<OTPFieldProps, "value"> & { readonly value: string }
const redact = ({ value, ...rest }: Props): OTPFieldProps => ({
  ...rest,
  value: Redacted.make(value)
})
const parts = (props: Props) =>
  Story.parts(OTPField, { model: idle, props: redact(props) })

type Issued = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const mountOf = (scene: Rendered, locator: Locator.Locator): Issued =>
  (scene.get(locator) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)
    ?.mount as unknown as Issued
const makeScene = (props: Props, android = false) =>
  HtmlScene.make(OTPField, redact(props), standIn).pipe(
    Effect.map((scene) =>
      scene.mounted(mountOf(scene, slot(0)), { label: null, android })
        .expectMount(mountOf(scene, root))
    )
  )
type Scene = Effect.Success<ReturnType<typeof makeScene>>

const settle = (scene: Scene) =>
  scene.subscription(
    scene.subscriptions.find((key) => key.startsWith("settled"))!,
    {
      _tag: "Settled"
    }
  )
const store = (scene: Scene, value: string) =>
  settle(scene.props((props) => ({ ...props, value: Redacted.make(value) })))

const commands = (scene: Scene): ReadonlyArray<string> =>
  scene.current.pending.map(({ command }) => {
    scene.resolve(command as never, { found: true, submitted: true } as never)
    return command.name + " " +
      (command.args as { readonly ref: { readonly key: string } }).ref.key
  })
const inFlight = (scene: Scene) =>
  scene.keepPending(HtmlCommand.Focus).keepPending(HtmlCommand.Select)
const focusOn = (index: number) => [
  "HtmlCommand.focus OTPFieldSlot[" + index + "]",
  "HtmlCommand.select OTPFieldSlot[" + index + "]"
]
const submitted = "HtmlCommand.requestSubmit OTPFieldHiddenInput"

const updated = (
  value: string,
  reason: OTPFieldUpdateReason = "input-change"
) => OTPFieldEvents.Updated({ value: Redacted.make(value), reason })
const completed = (
  value: string,
  reason: OTPFieldEntryReason = "input-change"
) => OTPFieldEvents.Completed({ value: Redacted.make(value), reason })
const rejected = (
  value: string,
  reason: OTPFieldEntryReason = "input-change"
) => OTPFieldEvents.Rejected({ value: Redacted.make(value), reason })
const quiet = (scene: Scene) =>
  assert.deepStrictEqual(scene.current.emitted, [])

describe("OTPField", () => {
  it.effect("the slots show the code one character each, and a hidden input holds all of it", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({
        value: "1 2a3456",
        length: 4,
        id: "code",
        name: "otp",
        required: true
      })
      assert.deepStrictEqual(
        [0, 1, 2, 3].map((index) => scene.get(slot(index)).props?.value),
        ["1", "2", "3", "4"]
      )
      assert.deepInclude(scene.get(root).attrs, {
        role: "group",
        "data-complete": "",
        "data-filled": "",
        "data-required": ""
      })
      assert.deepInclude(scene.get(slot(0)).attrs, {
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
      assert.deepInclude(scene.get(slot(3)).attrs, {
        id: "code-4",
        autocomplete: "off",
        enterkeyhint: "done",
        tabindex: "0"
      })
      assert.isUndefined(scene.get(slot(3)).attrs?.maxlength)
      assert.deepInclude(scene.get(hidden).attrs, {
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
      assert.strictEqual(scene.get(hidden).props?.value, "1234")
      assert.strictEqual(scene.get(root).children?.at(-1), scene.get(hidden))

      scene.props(
        redact({
          value: "a1",
          length: 4,
          validationType: "none",
          readOnly: true,
          disabled: true,
          form: "login"
        })
      )
      assert.deepStrictEqual(
        [0, 1, 2].map((index) => scene.get(slot(index)).props?.value),
        ["a", "1", ""]
      )
      for (const part of [root, slot(0), slot(2)]) {
        assert.deepInclude(scene.get(part).attrs, {
          "data-disabled": "",
          "data-readonly": ""
        })
        assert.isUndefined(scene.get(part).attrs?.["data-complete"])
      }
      assert.deepInclude(scene.get(slot(2)).attrs, {
        disabled: "",
        readonly: "",
        form: "login",
        tabindex: "0"
      })
      for (const name of ["pattern", "inputmode", "data-filled", "required"]) {
        assert.isUndefined(scene.get(slot(2)).attrs?.[name])
      }
      assert.deepInclude(scene.get(hidden).attrs, {
        disabled: "",
        readonly: "",
        form: "login"
      })
      assert.isUndefined(scene.get(hidden).attrs?.pattern)
      scene.parts((otpField) => {
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
      const scene = yield* makeScene({ value: "", length: 4 })
      scene.type(slot(0), "1").emitted(updated("1"))
      assert.deepStrictEqual(commands(scene), focusOn(1))
      assert.deepStrictEqual(commands(store(scene, "1")), [])
      scene.type(slot(0), "1")
      quiet(scene)
      assert.deepStrictEqual(commands(scene), focusOn(1))
      scene.type(slot(1), "x").emitted(rejected("x"))
      assert.deepStrictEqual(commands(scene), [
        "HtmlCommand.select OTPFieldSlot[1]"
      ])
      scene.type(slot(1), "23").emitted(updated("123"))
      assert.deepStrictEqual(commands(scene), focusOn(3))
      store(scene, "123")
      scene.type(slot(3), "45678").emitted(rejected("45678"), updated("1234"))
      assert.deepStrictEqual(commands(scene), focusOn(3))
      quiet(scene)
      store(scene, "1234").emitted(completed("1234"))
      scene.type(slot(3), "5").emitted(updated("1235"))
      commands(scene)
      store(scene, "1235")
      quiet(scene)
      scene.type(slot(1), "").emitted(updated("135", "input-clear"))
      assert.deepStrictEqual(commands(scene), [])
    }))

  it.effect("edits made before focus moves or the consumer stores the last one follow the pending slot and code", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ value: "", length: 4 })
      scene.focus(slot(0))
      commands(scene)
      inFlight(scene.type(slot(0), "1").emitted(updated("1")))
      store(scene, "1")
      // Focus is still on the first slot, which shows its own character and then the one typed.
      inFlight(scene.type(slot(0), "12").emitted(updated("12")))
      inFlight(
        scene.keydown(slot(0), "Backspace").emitted(updated("1", "keyboard"))
      )
      inFlight(scene.type(slot(0), "13").emitted(updated("13")))
      inFlight(
        scene.fire(slot(0), "paste", { text: "45" }).emitted(
          updated("1345", "input-paste")
        )
      )
      store(scene, "1345").emitted(completed("1345", "input-paste"))
      assert.deepStrictEqual(commands(scene), [1, 2, 1, 2, 3].flatMap(focusOn))
      scene.type(slot(0), "56").emitted(updated("5645"))
      assert.deepStrictEqual(commands(scene), focusOn(2))
    }))

  it.effect("only the consumer's answer to an edit completes the code, whatever it stores", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ value: "", length: 4, autoSubmit: true })
      inFlight(
        scene.fire(slot(0), "paste", { text: "1234" }).emitted(
          updated("1234", "input-paste")
        )
      )
      assert.deepStrictEqual(commands(settle(scene)), [
        ...focusOn(3),
        ...focusOn(0)
      ])
      quiet(scene)
      assert.deepStrictEqual(commands(store(scene, "9876")), [])
      quiet(scene)

      const upper = yield* makeScene({
        value: "",
        length: 2,
        validationType: "none"
      })
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
      const scene = yield* makeScene({ value: "123", length: 5 })
      const press = (
        index: number,
        key: string,
        modifiers?: { readonly ctrl?: boolean; readonly meta?: boolean }
      ) =>
        commands(
          scene.keydown(slot(index), key, modifiers).expectDefaultPrevented()
        )
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
      scene.keydown(slot(0), "Tab").expectIgnored().expectDefaultPrevented(
        false
      )
      scene.keydown(slot(0), "7").expectIgnored().expectDefaultPrevented(false)
      // Alt keeps the browser's shortcuts, and Shift selects text.
      for (
        const [key, modifiers] of [
          ["ArrowLeft", { alt: true }],
          ["Backspace", { alt: true }],
          ["ArrowLeft", { shift: true }]
        ] as const
      ) {
        scene.keydown(slot(2), key, modifiers).expectIgnored()
          .expectDefaultPrevented(false)
      }

      scene.keydown(slot(1), "Backspace").expectDefaultPrevented().emitted(
        updated("13", "keyboard")
      )
      assert.deepStrictEqual(commands(scene), focusOn(0))
      store(scene, "13")
      scene.keydown(slot(2), "Backspace").emitted(updated("1", "keyboard"))
      assert.deepStrictEqual(commands(scene), focusOn(1))
      store(scene, "123")
      scene.keydown(slot(0), "Delete").expectDefaultPrevented().emitted(
        updated("23", "keyboard")
      )
      assert.deepStrictEqual(commands(scene), focusOn(0))
      store(scene, "23")
      scene.keydown(slot(1), "Backspace", { ctrl: true }).emitted(
        updated("", "keyboard")
      )
      assert.deepStrictEqual(commands(scene), focusOn(0))
      store(scene, "")
      assert.deepStrictEqual(
        commands(scene.keydown(slot(0), "Backspace").expectDefaultPrevented()),
        []
      )
      quiet(scene)

      store(scene, "123").shared(DirectionProvider, { direction: "rtl" })
      assert.deepStrictEqual(press(1, "ArrowLeft"), focusOn(2))
      assert.deepStrictEqual(press(1, "ArrowRight"), focusOn(0))

      // Without a provider, the root's CSS direction decides.
      const css = yield* makeScene({ value: "123", length: 5 })
      css.mounted(mountOf(css, root), true as never)
      assert.deepStrictEqual(
        commands(css.keydown(slot(1), "ArrowLeft").expectDefaultPrevented()),
        focusOn(2)
      )
      css.shared(DirectionProvider, { direction: "ltr" })
      assert.deepStrictEqual(
        commands(css.keydown(slot(1), "ArrowLeft")),
        focusOn(0)
      )
    }))

  it.effect("pasted text and hidden-input autofill fill the slots and can submit the form, unless it was locked as the code completed", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({
        value: "12",
        length: 4,
        autoSubmit: true
      })
      scene.fire(slot(2), "paste", { text: " 3-4 9" }).expectDefaultPrevented()
        .emitted(
          rejected(" 3-4 9", "input-paste"),
          updated("1234", "input-paste")
        )
      assert.deepStrictEqual(commands(scene), focusOn(3))
      store(scene, "1234").emitted(completed("1234", "input-paste"))
      assert.deepStrictEqual(commands(scene), [submitted])
      scene.fire(slot(0), "paste", { text: "1234" }).emitted(
        completed("1234", "input-paste")
      )
      assert.deepStrictEqual(commands(scene), [...focusOn(3), submitted])
      scene.fire(slot(0), "paste", { text: "ab" }).expectDefaultPrevented()
        .emitted(rejected("ab", "input-paste"))
      assert.deepStrictEqual(commands(scene), [])

      store(scene, "12")
      scene.type(hidden, "98 76x").emitted(rejected("98 76x"), updated("9876"))
      assert.deepStrictEqual(commands(scene), focusOn(3))
      assert.deepStrictEqual(
        commands(store(scene, "9876").emitted(completed("9876"))),
        [submitted]
      )

      for (
        const lock of [{ disabled: true, readOnly: false }, {
          disabled: false,
          readOnly: true
        }]
      ) {
        settle(
          scene.props((props) => ({
            ...props,
            value: Redacted.make("12"),
            disabled: false,
            readOnly: false
          }))
        )
        scene.type(hidden, "5555").emitted(updated("5555"))
        commands(scene)
        settle(
          scene.props((props) => ({
            ...props,
            value: Redacted.make("5555"),
            ...lock
          }))
        ).emitted(completed("5555"))
        assert.deepStrictEqual(commands(scene), [])
      }
    }))

  it.effect("text an input method composes is entered once, when the composition ends", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({
        value: "",
        length: 4,
        validationType: "none"
      })
      const composing = (value: string) =>
        scene.fire(slot(0), "input", { value, checked: false, composing: true })
      composing("k")
      quiet(scene)
      scene.keydown(slot(0), "Backspace").expectIgnored()
        .expectDefaultPrevented(false)
      composing("か")
      scene.fire(slot(0), "compositionend", { value: "か" }).emitted(
        updated("か")
      )
      assert.deepStrictEqual(commands(scene), focusOn(1))
      // Some browsers send the last `input` after the composition ended.
      scene.type(slot(0), "か")
      quiet(scene)
      assert.deepStrictEqual(commands(store(scene, "か")), [])
      scene.type(slot(0), "き").emitted(updated("き"))
      commands(scene)

      // An Android keyboard composes all the time, so each `input` is entered as it comes.
      const android = yield* makeScene({ value: "", length: 4 }, true)
      android.fire(slot(0), "input", {
        value: "1",
        checked: false,
        composing: true
      }).emitted(updated("1"))
      commands(android)
      android.fire(slot(0), "compositionend", { value: "1" })
      quiet(android)
    }))

  it.effect("focus shows on every part, selects the slot's text, and never rests past the first empty slot", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ value: "12", length: 4 })
      assert.deepStrictEqual(commands(scene.focus(slot(0))), [
        "HtmlCommand.select OTPFieldSlot[0]"
      ])
      for (const part of [root, slot(0), slot(3)]) {
        assert.strictEqual(scene.get(part).attrs?.["data-focused"], "")
      }
      assert.deepStrictEqual(
        [0, 2].map((index) => scene.get(slot(index)).attrs?.tabindex),
        ["0", "-1"]
      )
      assert.deepStrictEqual(
        commands(scene.fire(slot(0), "mousedown", {}).expectDefaultPrevented()),
        [
          "HtmlCommand.select OTPFieldSlot[0]"
        ]
      )
      scene.fire(slot(1), "mousedown", {}).expectIgnored()
        .expectDefaultPrevented(false)
      scene.blur(slot(0))
      assert.isUndefined(scene.get(root).attrs?.["data-focused"])
      assert.deepStrictEqual(
        [0, 2].map((index) => scene.get(slot(index)).attrs?.tabindex),
        ["-1", "0"]
      )
      assert.deepStrictEqual(commands(scene.focus(slot(3))), focusOn(2))
      assert.deepStrictEqual(commands(scene.focus(hidden)), focusOn(0))
      scene.focus(slot(2))
      commands(scene)
      assert.deepStrictEqual(commands(store(scene, "")), focusOn(0))
      scene.props((props) => ({ ...props, disabled: true }))
      assert.isUndefined(scene.get(root).attrs?.["data-focused"])
      assert.include(scene.subscriptions, "disabledWhileFocused")
      scene.subscription("disabledWhileFocused", {
        _tag: "DisabledWhileFocused"
      })
        .props((props) => ({
          ...props,
          disabled: false
        }))
      assert.isUndefined(scene.get(root).attrs?.["data-focused"])
    }))

  it.effect("a disabled field reports nothing, and a read-only one keeps only the navigation keys", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ value: "12", length: 4, disabled: true })
      const edits = () => {
        scene.type(slot(0), "5")
        scene.fire(slot(0), "paste", { text: "56" })
        scene.fire(slot(0), "compositionend", { value: "5" })
        scene.type(hidden, "5678")
        quiet(scene)
        assert.deepStrictEqual(commands(scene), [])
      }
      edits()
      for (
        const step of [
          () => scene.keydown(slot(1), "ArrowLeft"),
          () => scene.focus(slot(0)),
          () => scene.focus(hidden)
        ]
      ) {
        assert.deepStrictEqual(commands(step()), [])
      }
      scene.keydown(slot(1), "Backspace")
      quiet(scene)

      scene.props(redact({ value: "12", length: 4, readOnly: true }))
      edits()
      scene.keydown(slot(1), "Backspace").expectIgnored()
        .expectDefaultPrevented(false)
      scene.keydown(slot(1), "Delete").expectIgnored().expectDefaultPrevented(
        false
      )
      assert.deepStrictEqual(
        commands(scene.keydown(slot(1), "ArrowLeft")),
        focusOn(0)
      )
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
    const built = View.build(
      parts({ value: "1", length: 2, validationType: "none" }).input({
        element,
        index: 1
      }),
      []
    )
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
      View.build(
        parts({ value: "", length: 2, ...props }).input({
          element: input,
          index: 0
        }),
        []
      ).attrs.type
    assert.strictEqual(typeOf({ mask: true }), "password")
    assert.strictEqual(
      typeOf({ mask: true }, h.input.attr("type", "tel") as never),
      "tel"
    )
    assert.strictEqual(
      View.build(
        parts({ value: "", length: 2, id: "code" }).input({
          element,
          index: 1
        }),
        []
      ).attrs.id,
      "code-2"
    )

    const group = View.build(
      parts({ value: "", length: 2 }).root(
        h.div.class("otp").attrs({
          role: "list",
          "data-focused": "yes",
          "data-filled": "yes"
        })
      ),
      []
    )
    assert.deepStrictEqual(group.attrs, { class: "otp", role: "group" })
  })

  it("a slot is an input at an index of its own inside the length, which is a positive whole number", () => {
    const otpField = parts({ value: "", length: 2 })
    assert.throws(
      () => otpField.input({ element: h.input, index: 2 }),
      /no slot at index 2 in a field of 2 slots/
    )
    assert.throws(
      () => otpField.input({ element: h.input, index: 0.5 }),
      /no slot at index 0.5/
    )
    const twice = otpField.root(h.div).children(
      otpField.input({ element: h.input, index: 1 }),
      h.div(otpField.input({ element: h.input, index: 1 }))
    )
    assert.throws(
      () => View.build(twice, []),
      /the slot at index 1 was drawn twice/
    )
    assert.throws(
      () => otpField.input({ element: h.div as never, index: 0 }),
      /a part for <input> was given <div>/
    )
    assert.throws(
      () => parts({ value: "", length: 0 }),
      /length is the number of slots/
    )
    assert.throws(
      () => parts({ value: "", length: 2.5 }),
      /length is the number of slots/
    )
  })

  it.effect("server-rendered page state and non-input markup do not leak the verification code", () =>
    Effect.gen(function*() {
      const secret = "847291"
      const Page = Html.component({
        name: "VerifyPage",
        model: Schema.Struct({}),
        message: Schema.Never
      }).make({
        init: () => ({}),
        update: ($) => $.model,
        view: (h) =>
          OTPField(h, {
            key: "otp",
            props: { value: Redacted.make(secret), length: 6, name: "code" },
            view: (otpField) =>
              otpField.root(h.div.class("otp")).children(
                Array.from(
                  { length: otpField.length },
                  (_, index) => otpField.input({ element: h.input, index })
                )
              )
          })
      })
      const { html, state } = yield* HtmlServer.renderToHtml(Page, {})
      assert.deepStrictEqual(state["/VerifyPage"], {})
      assert.deepStrictEqual(state["~deferred"], ["/VerifyPage/OTPField[otp]"])
      assert.notInclude(JSON.stringify(state), secret)
      assert.include(html, `value="${secret}"`)
      const withoutInputValues = html.replace(
        /<input\b[^>]*>/g,
        (tag) => tag.replace(/\svalue="[^"]*"/g, "")
      )
      assert.notInclude(withoutInputValues, secret)
    }))
})
