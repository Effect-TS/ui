import { UiSchema, View } from "@effect/ui"
import {
  OpenTui,
  OpenTuiCommand,
  OpenTuiSubscription
} from "@effect/ui-opentui"
import { TestOpenTuiEvents } from "@effect/ui-opentui/testing"
import { TestHost } from "@effect/ui/testing"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema } from "effect"

const testLayer = Layer.merge(TestHost.layer(), TestOpenTuiEvents.layer)

describe("OpenTui FFI-free testing", () => {
  it.effect("drives global key, paste, resize subscriptions and records OpenTuiCommand calls", () =>
    Effect.gen(function*() {
      const BoxRef = OpenTui.ref("Box", "box")
      const ScrollRef = OpenTui.ref("Scroll", "scrollbox")

      const Message = UiSchema.TaggedEnum({
        PressedUp: {},
        Pasted: { text: Schema.String },
        Resized: { width: Schema.Number, height: Schema.Number },
        RunCommands: {},
        Measured: { width: Schema.Number },
        Done: {}
      })

      const App = OpenTui.component({
        name: "UnitApp",
        model: Schema.Struct({
          ups: Schema.Number,
          pasted: Schema.String,
          size: Schema.String,
          measured: Schema.Number
        }),
        message: Message
      }).make({
        init: () => ({ ups: 0, pasted: "", size: "", measured: 0 }),
        update: {
          PressedUp: ($) => $.evolve({ ups: (n) => n + 1 }),
          Pasted: ($, { text }) => $.evolve({ pasted: text }),
          Resized: ($, { height, width }) =>
            $.evolve({ size: `${width}x${height}` }),
          RunCommands: ($) =>
            $.run(
              OpenTuiCommand.focus(BoxRef, () => Message.Done()),
              OpenTuiCommand.scrollTo(ScrollRef, 5, () => Message.Done()),
              OpenTuiCommand.measure(BoxRef, (rect) =>
                Message.Measured({
                  width: Option.isSome(rect) ? rect.value.width : -1
                })),
              OpenTuiCommand.quit()
            ),
          Measured: ($, { width }) => $.evolve({ measured: width }),
          Done: ($) => $.model
        },
        subscriptions: () => [
          OpenTuiSubscription.shortcuts([
            { key: "up", message: Message.PressedUp() }
          ]),
          OpenTuiSubscription.onPaste(
            ({ text }) => Message.Pasted({ text }),
            { preventDefault: true }
          ),
          OpenTuiSubscription.onResize(({ height, width }) =>
            Message.Resized({ width, height })
          )
        ],
        view: (h, model) =>
          h.box.ref(BoxRef).style({ border: true }).children(
            h.scrollbox.ref(ScrollRef).children(
              h.text(
                `ups=${model.ups} pasted=${model.pasted} size=${model.size}`
              )
            )
          )
      })

      const root = yield* TestHost.mount(App, {})
      yield* TestHost.settle

      const ignoredWhileTyping = yield* TestOpenTuiEvents.pressKey("up", {
        editable: true
      })
      expect(ignoredWhileTyping).toBe(false)

      const handled = yield* TestOpenTuiEvents.pressKey("up")
      expect(handled).toBe(true)

      const pasted = yield* TestOpenTuiEvents.paste("hello")
      expect(pasted).toBe(true)

      yield* TestOpenTuiEvents.resize(120, 40)
      yield* TestHost.settle

      expect(root.text()).toBe("ups=1 pasted=hello size=120x40")

      const recorder = yield* TestOpenTuiEvents.TestOpenTuiHost
      recorder.rect({ x: 0, y: 0, width: 42, height: 10 })
      root.send(Message.RunCommands())
      yield* TestHost.settle

      expect(root.model()?.measured).toBe(42)
      expect(recorder.actions.map((a) => a._tag).sort()).toEqual([
        "Focus",
        "Measure",
        "Quit",
        "ScrollTo"
      ])
    }).pipe(Effect.provide(testLayer)))

  it.effect("rejects stray text in h.el and in box slots via Outlet", () =>
    Effect.gen(function*() {
      const h = View.makeHelper<never, {}, OpenTui.Elements>({}, OpenTui)
      expect(() => h.el("box", "stray")).toThrow(/can't hold text/)

      const Frame = OpenTui.component({
        name: "Frame",
        model: Schema.Void,
        message: Schema.Never,
        slots: ["body"]
      }).make({
        init: () => undefined,
        update: () => undefined,
        view: (h) => h.box.children(h.slots.body)
      })

      const BadParent = OpenTui.component({
        name: "BadParent",
        model: Schema.Void,
        message: Schema.Never
      }).make({
        init: () => undefined,
        update: () => undefined,
        view: (h) => Frame(h, { slots: { body: "stray text" } })
      })

      const Root = OpenTui.component({
        name: "Root",
        model: Schema.Void,
        message: Schema.Never
      }).make({
        init: () => undefined,
        update: () => undefined,
        view: (h) =>
          BadParent(h, {
            fallback: () => h.text("caught")
          })
      })

      const root = yield* TestHost.mount(Root, {})
      yield* TestHost.settle
      expect(root.text()).toBe("caught")
    }).pipe(Effect.provide(testLayer)))
})
