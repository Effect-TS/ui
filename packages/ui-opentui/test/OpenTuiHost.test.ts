import { Component, Head, Subscription, UiSchema, View } from "@effect/ui"
import {
  OpenTui,
  OpenTuiCommand,
  OpenTuiSubscription
} from "@effect/ui-opentui"
import { OpenTuiTest } from "@effect/ui-opentui/testing"
import { describe, expect, it } from "@effect/vitest"
import * as OT from "@opentui/core"
import { Effect, Option, Schema } from "effect"

describe("OpenTuiHost", () => {
  it.effect("renders layout, text modifiers, mouse clicks, controlled input, and head title", () =>
    Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({
        ClickedIncrement: {},
        UpdatedName: { value: Schema.String }
      })

      const Counter = Component.define({
        name: "Counter",
        model: Schema.Struct({ count: Schema.Number, name: Schema.String }),
        message: Message,
        elements: OpenTui
      }).make({
        init: () => ({ count: 0, name: "" }),
        update: {
          ClickedIncrement: ($) => $.evolve({ count: (n) => n + 1 }),
          UpdatedName: ($, { value }) => $.evolve({ name: value.toUpperCase() })
        },
        head: ({ model }) => [Head.title(`Count ${model.count}`)],
        view: (h, model) =>
          h.box.style({
            border: true,
            flexDirection: "column",
            width: 36
          }).title("Counter").children(
            h.text(
              "Count: ",
              h.b(String(model.count)),
              h.br,
              h.i("hi "),
              h.u("u"),
              " ",
              h.a.href("https://effect.website").children("link")
            ),
            h.box.style({ border: true, width: 10 }).onMouseDown(
              Message.ClickedIncrement()
            ).children(h.text("[ + ]")),
            h.input.style({ width: 20 }).placeholder("name").value(model.name)
              .focused(true).onInput(({ value }) =>
                Message.UpdatedName({ value })
              ),
            model.count > 0
              ? h.text.key("positive").style({ fg: "#00ff00" }).children(
                "positive!"
              )
              : false
          )
      })

      const app = yield* OpenTuiTest.mount(Counter, {}, {
        width: 40,
        height: 12
      })
      expect(app.titles).toEqual(["Count 0"])
      expect(app.captureFrame()).toContain("Count: 0")

      yield* app.click(3, 4)
      expect(app.root.model()?.count).toBe(1)
      expect(app.titles).toEqual(["Count 0", "Count 1"])
      expect(app.captureFrame()).toContain("positive!")

      yield* app.typeText("tim")
      expect(app.root.model()?.name).toBe("TIM")
      expect(app.captureFrame()).toContain("TIM")
    }))

  it.effect("synchronously prevents default on global shortcuts before focused input consumes the key", () =>
    Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({
        UpdatedValue: { value: Schema.String },
        PressedShortcut: { key: Schema.String },
        ToggledBlock: {}
      })

      const App = Component.define({
        name: "ShortcutPreventDefault",
        model: Schema.Struct({
          value: Schema.String,
          shortcuts: Schema.Array(Schema.String),
          blockX: Schema.Boolean
        }),
        message: Message,
        elements: OpenTui
      }).make({
        init: () => ({ value: "", shortcuts: [], blockX: true }),
        update: {
          UpdatedValue: ($, { value }) => $.evolve({ value }),
          PressedShortcut: ($, { key }) =>
            $.evolve({ shortcuts: (list) => [...list, key] }),
          ToggledBlock: ($) => $.evolve({ blockX: (b) => !b })
        },
        subscriptions: ({ model }) => [
          OpenTuiSubscription.shortcuts([
            ...(model.blockX
              ? [{
                key: "x",
                message: Message.PressedShortcut({ key: "x" }),
                whileTyping: true
              }]
              : []),
            {
              key: "escape",
              message: Message.ToggledBlock(),
              whileTyping: true
            }
          ])
        ],
        view: (h, model) =>
          h.box.style({ flexDirection: "column", width: 30 }).children(
            h.input.style({ width: 20 }).value(model.value).focused(true)
              .onInput(({ value }) => Message.UpdatedValue({ value })),
            h.text(`val=${model.value}`)
          )
      })

      const app = yield* OpenTuiTest.mount(App, {}, { width: 34, height: 8 })
      yield* app.typeText("axb")
      expect(app.root.model()?.value).toBe("ab")
      expect(app.root.model()?.shortcuts).toEqual(["x"])

      yield* app.pressEscape
      yield* app.typeText("x")
      expect(app.root.model()?.value).toBe("abx")
    }))

  it.effect("reverts rejected controlled edits on input, textarea, and select, and preserves select options across inline arrays", () =>
    Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({
        UpdatedInput: { value: Schema.String },
        UpdatedArea: { value: Schema.String },
        ChangedSelect: { index: Schema.Number },
        BumpedTick: {}
      })

      const InputRef = OpenTui.ref("Input", "input")
      const AreaRef = OpenTui.ref("Area", "textarea")
      const SelectRef = OpenTui.ref("Select", "select")

      const Form = Component.define({
        name: "ControlledForm",
        model: Schema.Struct({
          digits: Schema.String,
          notes: Schema.String,
          index: Schema.Number,
          focusTarget: Schema.Literals(["input", "textarea", "select"]),
          tick: Schema.Number
        }),
        message: Message,
        elements: OpenTui
      }).make({
        init: () => ({
          digits: "12",
          notes: "ok",
          index: 1,
          focusTarget: "input" as const,
          tick: 0
        }),
        update: {
          UpdatedInput: ($, { value }) =>
            /^\d*$/.test(value) ? $.evolve({ digits: value }) : $.model,
          UpdatedArea: ($, { value }) =>
            value.includes("!") ? $.model : $.evolve({ notes: value }),
          ChangedSelect: ($, { index }) =>
            index === 2 ? $.model : $.evolve({ index }),
          BumpedTick: ($) => $.evolve({ tick: (n) => n + 1 })
        },
        view: (h, model) =>
          h.box.style({ flexDirection: "column", width: 30, height: 12 })
            .children(
              h.input.ref(InputRef).style({ width: 20 }).value(model.digits)
                .focused(model.focusTarget === "input").onInput(({ value }) =>
                  Message.UpdatedInput({ value })
                ),
              h.textarea.ref(AreaRef).style({ width: 20, height: 3 }).value(
                model.notes
              ).focused(model.focusTarget === "textarea").onInput(({ value }) =>
                Message.UpdatedArea({ value })
              ),
              h.select.ref(SelectRef).style({ width: 20, height: 6 }).options([
                { name: "One", description: "first" },
                { name: "Two", description: "second" },
                { name: "Locked", description: "rejected" }
              ]).selectedIndex(model.index).focused(
                model.focusTarget === "select"
              ).onSelectionChanged(({ index }) =>
                Message.ChangedSelect({ index })
              ),
              h.text(`tick=${model.tick}`)
            )
      })

      const app = yield* OpenTuiTest.mount(Form, {}, { width: 34, height: 14 })
      yield* app.typeText("a3")
      expect(app.root.model()?.digits).toBe("123")
      expect(app.captureFrame()).toContain("123")
      expect(app.captureFrame()).not.toContain("12a")

      const rootChildren = app.setup.renderer.root.getChildren()[0]!
        .getChildren()
      const textarea = rootChildren[1] as OT.TextareaRenderable
      const select = rootChildren[2] as OT.SelectRenderable

      textarea.focus()
      yield* app.typeText("!z")
      expect(app.root.model()?.notes).toBe("okz")
      expect(textarea.plainText).toBe("okz")

      select.focus()
      expect(select.getSelectedIndex()).toBe(1)
      yield* app.pressArrow("down")
      expect(app.root.model()?.index).toBe(1)
      expect(select.getSelectedIndex()).toBe(1)

      app.root.send(Message.BumpedTick())
      yield* app.settle
      expect(select.getSelectedIndex()).toBe(1)
    }))

  it.effect("applies focus transitions in commit order and supports OpenTuiCommand ref actions and quit", () =>
    Effect.gen(function*() {
      const First = OpenTui.ref("First", "input")
      const Second = OpenTui.ref("Second", "input")
      const Scroll = OpenTui.ref("Scroll", "scrollbox")

      const Message = UiSchema.TaggedEnum({
        SwitchedFocus: {},
        RequestedMeasure: {},
        Measured: { width: Schema.Number },
        RequestedScroll: {},
        Scrolled: { found: Schema.Boolean },
        RequestedQuit: {}
      })

      const App = Component.define({
        name: "FocusAndCommands",
        model: Schema.Struct({
          active: Schema.Literals(["first", "second"]),
          measuredWidth: Schema.Number,
          scrolled: Schema.Boolean
        }),
        message: Message,
        elements: OpenTui
      }).make({
        init: () => ({
          active: "first" as const,
          measuredWidth: 0,
          scrolled: false
        }),
        update: {
          SwitchedFocus: ($) =>
            $.evolve({
              active: (a) => (a === "first" ? "second" : "first")
            }),
          RequestedMeasure: ($) =>
            $.run(
              OpenTuiCommand.measure(First, (rect) =>
                Message.Measured({
                  width: Option.isSome(rect) ? rect.value.width : -1
                }))
            ),
          Measured: ($, { width }) => $.evolve({ measuredWidth: width }),
          RequestedScroll: ($) =>
            $.run(
              OpenTuiCommand.scrollTo(Scroll, 2, ({ found }) =>
                Message.Scrolled({ found }))
            ),
          Scrolled: ($, { found }) => $.evolve({ scrolled: found }),
          RequestedQuit: ($) => $.run(OpenTuiCommand.quit())
        },
        view: (h, model) =>
          h.box.style({ flexDirection: "column", width: 24, height: 10 })
            .children(
              h.input.ref(First).style({ width: 16 }).focused(
                model.active === "first"
              ),
              h.input.ref(Second).style({ width: 16 }).focused(
                model.active === "second"
              ),
              h.scrollbox.ref(Scroll).style({ width: 20, height: 4 }).children(
                h.text("line 1"),
                h.text("line 2"),
                h.text("line 3"),
                h.text("line 4"),
                h.text("line 5")
              )
            )
      })

      const app = yield* OpenTuiTest.mount(App, {}, { width: 30, height: 12 })
      const nodes = app.setup.renderer.root.getChildren()[0]!.getChildren()
      const first = nodes[0] as OT.InputRenderable
      const second = nodes[1] as OT.InputRenderable

      expect(first.focused).toBe(true)
      expect(second.focused).toBe(false)

      app.root.send(Message.SwitchedFocus())
      yield* app.settle
      expect(first.focused).toBe(false)
      expect(second.focused).toBe(true)

      app.root.send(Message.RequestedMeasure())
      yield* app.settle
      expect(app.root.model()?.measuredWidth).toBe(16)

      app.root.send(Message.RequestedScroll())
      yield* app.settle
      expect(app.root.model()?.scrolled).toBe(true)

      app.root.send(Message.RequestedQuit())
      yield* app.settle
      expect(app.setup.renderer.isDestroyed).toBe(true)
    }))

  it.effect("keeps keepAlive children alive across hide/show without leaking containers", () =>
    Effect.gen(function*() {
      const TabMsg = UiSchema.TaggedEnum({ Incremented: {} })
      const Tab = Component.define({
        name: "Tab",
        model: Schema.Number,
        message: TabMsg,
        elements: OpenTui
      }).make({
        init: () => 0,
        update: { Incremented: ($) => $.model + 1 },
        view: (h, count) =>
          h.box.style({ width: 20, height: 3 }).onMouseDown(
            TabMsg.Incremented()
          ).children(h.text(`tab-count=${count}`))
      })

      const HostMsg = UiSchema.TaggedEnum({ Toggled: {} })
      const Tabs = Component.define({
        name: "Tabs",
        model: Schema.Boolean,
        message: HostMsg,
        elements: OpenTui
      }).make({
        init: () => true,
        update: { Toggled: ($) => !$.model },
        view: (h, show) =>
          h.box.style({ flexDirection: "column", width: 24, height: 6 })
            .children(
              h.keepAlive((s) => show ? Tab(s, { key: "a" }) : h.text("hidden"))
            )
      })

      const app = yield* OpenTuiTest.mount(Tabs, {}, { width: 28, height: 8 })
      expect(app.captureFrame()).toContain("tab-count=0")

      yield* app.click(2, 0)
      expect(app.captureFrame()).toContain("tab-count=1")

      app.root.send(HostMsg.Toggled())
      yield* app.settle
      expect(app.captureFrame()).toContain("hidden")
      expect(app.captureFrame()).not.toContain("tab-count=1")

      app.root.send(HostMsg.Toggled())
      yield* app.settle
      expect(app.captureFrame()).toContain("tab-count=1")
    }))

  it.effect("stops mouse propagation on innermost handler even when returning undefined, and resets removed style props", () =>
    Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({
        OuterClicked: {},
        ToggledBorder: {}
      })

      const App = Component.define({
        name: "PropagationAndStyleReset",
        model: Schema.Struct({
          outerClicks: Schema.Number,
          bordered: Schema.Boolean
        }),
        message: Message,
        elements: OpenTui
      }).make({
        init: () => ({ outerClicks: 0, bordered: true }),
        update: {
          OuterClicked: ($) => $.evolve({ outerClicks: (n) => n + 1 }),
          ToggledBorder: ($) => $.evolve({ bordered: (b) => !b })
        },
        view: (h, model) =>
          h.box.style({
            width: 24,
            height: 6,
            ...(model.bordered ? { border: true } : {})
          }).onMouseDown(Message.OuterClicked()).children(
            h.box.style({ width: 12, height: 3 }).onMouseDown(() => undefined)
              .children(h.text("inner"))
          )
      })

      const app = yield* OpenTuiTest.mount(App, {}, { width: 28, height: 8 })
      expect(app.captureFrame()).toContain("┌")

      yield* app.click(3, 2)
      expect(app.root.model()?.outerClicks).toBe(0)

      app.root.send(Message.ToggledBorder())
      yield* app.settle
      expect(app.captureFrame()).not.toContain("┌")
    }))

  it.effect("supports custom renderables via renderables option and h.el", () =>
    Effect.gen(function*() {
      class CustomBox extends OT.BoxRenderable {}

      const App = Component.define({
        name: "CustomEl",
        model: Schema.Void,
        message: Schema.Never,
        elements: OpenTui
      }).make({
        init: () => undefined,
        update: () => undefined,
        view: (h) =>
          h.el("custom-box").prop("border", true).prop("width", 16).children(
            h.text("custom!")
          )
      })

      const app = yield* OpenTuiTest.mount(App, {}, {
        width: 20,
        height: 5,
        renderables: { "custom-box": CustomBox }
      })
      expect(app.setup.renderer.root.getChildren()[0]).toBeInstanceOf(CustomBox)
      expect(app.captureFrame()).toContain("custom!")
    }))

  it.effect("wires Subscription.direct latest state without stale closures", () =>
    Effect.gen(function*() {
      let fire: ((value: number) => void) | undefined
      const Message = UiSchema.TaggedEnum({ Got: { value: Schema.Number } })

      const Direct = Component.define({
        name: "DirectSub",
        model: Schema.Number,
        message: Message,
        elements: OpenTui
      }).make({
        init: () => 1,
        update: { Got: ($, { value }) => $.model + value },
        subscriptions: ({ model }) => [
          Subscription.direct<number, typeof Message.Type>(
            "custom",
            undefined,
            model,
            (_ctx, { emit, enter }) => {
              fire = (value) =>
                enter((latest) => emit(Message.Got({ value: value * latest })))
              return () => {
                fire = undefined
              }
            }
          )
        ],
        view: (h, model) => h.text(String(model))
      })

      const app = yield* OpenTuiTest.mount(Direct, {}, { width: 10, height: 3 })
      fire!(2)
      yield* app.settle
      expect(app.root.model()).toBe(3)
      fire!(2)
      yield* app.settle
      expect(app.root.model()).toBe(9)
    }))

  it("exposes textParents on OpenTui.vocabulary", () => {
    const h = View.makeHelper<never, {}, OpenTui.Elements>({}, OpenTui)
    expect(() => h.el("box", "stray")).toThrow(/can't hold text/)
  })
})
