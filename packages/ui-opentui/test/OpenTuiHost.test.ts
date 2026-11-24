import { Command, Component, Head, Mount, UiSchema } from "@effect/ui"
import {
  OpenTui,
  OpenTuiCommand,
  OpenTuiSubscription
} from "@effect/ui-opentui"
import { OpenTuiTest } from "@effect/ui-opentui/testing"
import { describe, expect, it } from "@effect/vitest"
import * as OT from "@opentui/core"
import { Deferred, Effect, Option, Schema } from "effect"

describe("OpenTuiHost", () => {
  it.effect("renders layout, text modifiers, mouse clicks, controlled input, and head title", () =>
    Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({
        ClickedIncrement: {},
        UpdatedName: { value: Schema.String }
      })

      const Counter = OpenTui.component({
        name: "Counter",
        model: Schema.Struct({ count: Schema.Number, name: Schema.String }),
        message: Message
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

      const App = OpenTui.component({
        name: "ShortcutPreventDefault",

        model: Schema.Struct({
          value: Schema.String,
          shortcuts: Schema.Array(Schema.String),
          blockX: Schema.Boolean
        }),

        message: Message
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
      const Target = Schema.Literals(["input", "textarea", "select"])
      const Message = UiSchema.TaggedEnum({
        UpdatedInput: { value: Schema.String },
        UpdatedArea: { value: Schema.String },
        ChangedSelect: { index: Schema.Number },
        PickedItem: { index: Schema.Number },
        Focused: { target: Target },
        BumpedTick: {}
      })

      const Form = OpenTui.component({
        name: "ControlledForm",

        model: Schema.Struct({
          digits: Schema.String,
          notes: Schema.String,
          index: Schema.Number,
          picked: Schema.Array(Schema.Number),
          focusTarget: Target,
          tick: Schema.Number
        }),

        message: Message
      }).make({
        init: () => ({
          digits: "12",
          notes: "ok",
          index: 1,
          picked: [],
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
          PickedItem: ($, { index }) =>
            $.evolve({ picked: (items) => [...items, index] }),
          Focused: ($, { target }) => $.evolve({ focusTarget: target }),
          BumpedTick: ($) => $.evolve({ tick: (n) => n + 1 })
        },
        view: (h, model) =>
          h.box.style({ flexDirection: "column", width: 30, height: 12 })
            .children(
              h.input.style({ width: 20 }).value(model.digits)
                .focused(model.focusTarget === "input").onInput(({ value }) =>
                  Message.UpdatedInput({ value })
                ),
              h.textarea.style({ width: 20, height: 3 }).value(model.notes)
                .focused(model.focusTarget === "textarea")
                .onInput(({ value }) => Message.UpdatedArea({ value })),
              h.select.style({ width: 20, height: 6 }).options([
                { name: "One", description: "first" },
                { name: "Two", description: "second" },
                { name: "Locked", description: "rejected" }
              ]).selectedIndex(model.index)
                .focused(model.focusTarget === "select")
                .onSelectionChanged(({ index }) =>
                  Message.ChangedSelect({ index })
                )
                .onItemSelected(({ index }) => Message.PickedItem({ index })),
              h.text(`tick=${model.tick}`)
            )
      })

      const app = yield* OpenTuiTest.mount(Form, {}, { width: 34, height: 14 })
      yield* app.typeText("a3")
      expect(app.root.model()?.digits).toBe("123")
      expect(app.captureFrame()).toContain("123")
      expect(app.captureFrame()).not.toContain("12a")

      app.root.send(Message.Focused({ target: "textarea" }))
      yield* app.settle
      yield* app.typeText("!z")
      expect(app.root.model()?.notes).toBe("okz")
      expect(app.captureFrame()).toContain("okz")
      expect(app.captureFrame()).not.toContain("!")

      app.root.send(Message.Focused({ target: "select" }))
      yield* app.settle
      yield* app.pressArrow("down")
      yield* app.pressEnter
      expect(app.root.model()?.index).toBe(1)
      expect(app.root.model()?.picked).toEqual([1])

      app.root.send(Message.BumpedTick())
      yield* app.settle
      yield* app.pressEnter
      expect(app.root.model()?.picked).toEqual([1, 1])
    }))

  it.effect("applies focus transitions in commit order and supports OpenTuiCommand ref actions and quit", () =>
    Effect.gen(function*() {
      const First = OpenTui.ref("First", "input")
      const Scroll = OpenTui.ref("Scroll", "scrollbox")

      const Message = UiSchema.TaggedEnum({
        UpdatedFirst: { value: Schema.String },
        UpdatedSecond: { value: Schema.String },
        SwitchedFocus: {},
        RequestedMeasure: {},
        Measured: { width: Schema.Number },
        RequestedScroll: {},
        Scrolled: { found: Schema.Boolean },
        RequestedQuit: {}
      })

      const App = OpenTui.component({
        name: "FocusAndCommands",

        model: Schema.Struct({
          active: Schema.Literals(["first", "second"]),
          firstText: Schema.String,
          secondText: Schema.String,
          measuredWidth: Schema.Number,
          scrolled: Schema.Boolean
        }),

        message: Message
      }).make({
        init: () => ({
          active: "first" as const,
          firstText: "",
          secondText: "",
          measuredWidth: 0,
          scrolled: false
        }),
        update: {
          UpdatedFirst: ($, { value }) => $.evolve({ firstText: value }),
          UpdatedSecond: ($, { value }) => $.evolve({ secondText: value }),
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
              h.input.ref(First).style({ width: 16 }).value(model.firstText)
                .focused(model.active === "first")
                .onInput(({ value }) => Message.UpdatedFirst({ value })),
              h.input.style({ width: 16 }).value(model.secondText)
                .focused(model.active === "second")
                .onInput(({ value }) => Message.UpdatedSecond({ value })),
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
      yield* app.typeText("a")
      expect(app.root.model()?.firstText).toBe("a")
      expect(app.root.model()?.secondText).toBe("")

      app.root.send(Message.SwitchedFocus())
      yield* app.settle
      yield* app.typeText("b")
      expect(app.root.model()?.firstText).toBe("a")
      expect(app.root.model()?.secondText).toBe("b")

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

  it.effect("reuses keepAlive children across hide/show and destroys parked nodes on expiry, owner teardown, lazy fallback, and error fallback disposal", () =>
    Effect.gen(function*() {
      const boxes: Array<OT.BoxRenderable> = []
      class TrackedBox extends OT.BoxRenderable {
        constructor(ctx: OT.RenderContext, options: OT.BoxOptions) {
          super(ctx, options)
          boxes.push(this)
        }
      }

      const TabMsg = UiSchema.TaggedEnum({ Incremented: {} })
      const Tab = OpenTui.component({
        name: "Tab",
        model: Schema.Number,
        message: TabMsg
      }).make({
        init: () => 0,
        update: { Incremented: ($) => $.model + 1 },
        view: (h, count) =>
          h.el("tracked-box").prop("width", 20).prop("height", 3)
            .on("mousedown", TabMsg.Incremented()).children(
              h.text(`tab-count=${count}`)
            )
      })

      const PendingLazy = Component.lazy(
        "PendingLazy",
        () => new Promise<typeof Tab>(() => {})
      )

      const gates = [
        yield* Deferred.make<void>(),
        yield* Deferred.make<void>(),
        yield* Deferred.make<void>()
      ]
      let nextGate = 0
      const Boom = Command.make(
        "Boom",
        { args: {} },
        () => {
          const gate = gates[nextGate++]!
          return Deferred.await(gate).pipe(Effect.andThen(Effect.die("boom")))
        }
      )
      const Fragile = OpenTui.component({
        name: "Fragile",
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: ($) => $.set(null).run(Boom.make()),
        update: ($) => $.model,
        view: (h) =>
          h.el("tracked-box").prop("width", 20).prop("height", 2)
            .children(h.text("fragile-ok"))
      })

      let fallbackActive = 0
      let fallbackReleases = 0
      const TrackFallback = Mount.make(
        "TrackFallback",
        { args: {} },
        () =>
          Effect.acquireRelease(
            Effect.sync(() => {
              fallbackActive++
            }),
            () =>
              Effect.sync(() => {
                fallbackActive--
                fallbackReleases++
              })
          ).pipe(Effect.as(Component.noop))
      )

      const OwnerProps = Schema.Struct({
        showTab: Schema.Boolean,
        keepTab: Schema.Boolean,
        showLazy: Schema.Boolean,
        keepLazy: Schema.Boolean,
        showFragile: Schema.Boolean,
        keepFragile: Schema.Boolean
      })

      const Owner = OpenTui.component({
        name: "Owner",
        props: OwnerProps,
        model: Schema.Void,
        message: Schema.Never
      }).make({
        init: () => undefined,
        update: () => undefined,
        view: (h) =>
          h.box.style({ flexDirection: "column", width: 24, height: 10 })
            .children(
              h.keepAlive(
                ({ props }) => props.keepTab,
                (s) =>
                  h.props.showTab
                    ? Tab(s, { key: "a" })
                    : h.text("hidden-tab")
              ),
              h.keepAlive(
                ({ props }) => props.keepLazy,
                (s) =>
                  h.props.showLazy
                    ? PendingLazy(s, {
                      key: "lazy",
                      fallback: () =>
                        h.el("tracked-box").prop("width", 20).prop("height", 2)
                          .children(h.text("loading-lazy"))
                    })
                    : h.text("hidden-lazy")
              ),
              h.keepAlive(
                ({ props }) => props.keepFragile,
                (s) =>
                  h.props.showFragile
                    ? Fragile(s, {
                      key: "f",
                      fallback: () =>
                        h.el("tracked-box").prop("width", 20).prop("height", 2)
                          .onMount(TrackFallback())
                          .children(h.text("fragile-down"))
                    })
                    : h.text("hidden-fragile")
              )
            )
      })

      const RootMsg = UiSchema.TaggedEnum({
        Set: {
          mounted: Schema.optional(Schema.Boolean),
          showTab: Schema.optional(Schema.Boolean),
          keepTab: Schema.optional(Schema.Boolean),
          showLazy: Schema.optional(Schema.Boolean),
          keepLazy: Schema.optional(Schema.Boolean),
          showFragile: Schema.optional(Schema.Boolean),
          keepFragile: Schema.optional(Schema.Boolean)
        }
      })

      const Root = OpenTui.component({
        name: "Root",

        model: Schema.Struct({
          mounted: Schema.Boolean,
          showTab: Schema.Boolean,
          keepTab: Schema.Boolean,
          showLazy: Schema.Boolean,
          keepLazy: Schema.Boolean,
          showFragile: Schema.Boolean,
          keepFragile: Schema.Boolean
        }),

        message: RootMsg
      }).make({
        init: () => ({
          mounted: true,
          showTab: true,
          keepTab: true,
          showLazy: true,
          keepLazy: true,
          showFragile: true,
          keepFragile: true
        }),
        update: {
          Set: ($, patch) =>
            $.set({
              mounted: patch.mounted ?? $.model.mounted,
              showTab: patch.showTab ?? $.model.showTab,
              keepTab: patch.keepTab ?? $.model.keepTab,
              showLazy: patch.showLazy ?? $.model.showLazy,
              keepLazy: patch.keepLazy ?? $.model.keepLazy,
              showFragile: patch.showFragile ?? $.model.showFragile,
              keepFragile: patch.keepFragile ?? $.model.keepFragile
            })
        },
        view: (h, model) =>
          model.mounted
            ? Owner(h, {
              props: {
                showTab: model.showTab,
                keepTab: model.keepTab,
                showLazy: model.showLazy,
                keepLazy: model.keepLazy,
                showFragile: model.showFragile,
                keepFragile: model.keepFragile
              }
            })
            : h.text("unmounted")
      })

      const app = yield* OpenTuiTest.mount(Root, {}, {
        width: 28,
        height: 12,
        renderables: { "tracked-box": TrackedBox }
      })
      expect(boxes).toHaveLength(3)
      const [firstTabBox, lazyFallbackBox, firstFragileBox] = boxes
      expect(app.captureFrame()).toContain("tab-count=0")
      expect(app.captureFrame()).toContain("loading-lazy")
      expect(app.captureFrame()).toContain("fragile-ok")

      yield* app.click(2, 0)
      expect(app.captureFrame()).toContain("tab-count=1")

      app.root.send(RootMsg.Set({
        showTab: false,
        showLazy: false,
        showFragile: false
      }))
      yield* app.settle
      expect(app.captureFrame()).toContain("hidden-tab")
      expect(app.captureFrame()).toContain("hidden-lazy")
      expect(firstTabBox!.isDestroyed).toBe(false)
      expect(lazyFallbackBox!.isDestroyed).toBe(false)
      expect(firstFragileBox!.isDestroyed).toBe(false)

      yield* Deferred.succeed(gates[0]!, undefined)
      yield* app.settle
      expect(boxes).toHaveLength(4)
      const expiredErrorFallbackBox = boxes[3]!
      expect(expiredErrorFallbackBox.isDestroyed).toBe(false)
      expect(fallbackActive).toBe(1)
      expect(fallbackReleases).toBe(0)

      app.root.send(RootMsg.Set({ showTab: true }))
      yield* app.settle
      expect(app.captureFrame()).toContain("tab-count=1")
      expect(firstFragileBox!.isDestroyed).toBe(true)
      expect(boxes).toHaveLength(4)

      app.root.send(RootMsg.Set({ showTab: false }))
      yield* app.settle
      expect(firstTabBox!.isDestroyed).toBe(false)

      app.root.send(RootMsg.Set({
        keepTab: false,
        keepLazy: false,
        keepFragile: false
      }))
      yield* app.settle
      expect(firstTabBox!.isDestroyed).toBe(true)
      expect(lazyFallbackBox!.isDestroyed).toBe(true)
      expect(expiredErrorFallbackBox.isDestroyed).toBe(true)
      expect(fallbackActive).toBe(0)
      expect(fallbackReleases).toBe(1)

      app.root.send(RootMsg.Set({ showFragile: true, keepFragile: true }))
      yield* app.settle
      expect(boxes).toHaveLength(5)
      app.root.send(RootMsg.Set({ showFragile: false }))
      yield* app.settle
      yield* Deferred.succeed(gates[1]!, undefined)
      yield* app.settle
      expect(boxes).toHaveLength(6)
      const reshowParkedFallbackBox = boxes[5]!
      expect(reshowParkedFallbackBox.isDestroyed).toBe(false)
      expect(fallbackActive).toBe(1)
      expect(fallbackReleases).toBe(1)

      app.root.send(RootMsg.Set({ showFragile: true }))
      yield* app.settle
      expect(app.captureFrame()).toContain("fragile-down")
      expect(reshowParkedFallbackBox.isDestroyed).toBe(true)
      expect(boxes).toHaveLength(7)
      const reshowLiveFallbackBox = boxes[6]!
      expect(reshowLiveFallbackBox.isDestroyed).toBe(false)
      expect(fallbackActive).toBe(1)
      expect(fallbackReleases).toBe(2)

      app.root.send(RootMsg.Set({ showFragile: false, keepFragile: false }))
      yield* app.settle
      expect(reshowLiveFallbackBox.isDestroyed).toBe(true)
      expect(fallbackActive).toBe(0)
      expect(fallbackReleases).toBe(3)

      app.root.send(RootMsg.Set({
        showTab: true,
        keepTab: true,
        showLazy: true,
        keepLazy: true,
        showFragile: true,
        keepFragile: true
      }))
      yield* app.settle
      expect(boxes).toHaveLength(10)
      const teardownTabBox = boxes[7]!
      const teardownLazyBox = boxes[8]!
      const teardownFragileBox = boxes[9]!
      expect(teardownTabBox.isDestroyed).toBe(false)
      expect(teardownLazyBox.isDestroyed).toBe(false)
      expect(teardownFragileBox.isDestroyed).toBe(false)

      app.root.send(RootMsg.Set({
        showTab: false,
        showLazy: false,
        showFragile: false
      }))
      yield* app.settle
      yield* Deferred.succeed(gates[2]!, undefined)
      yield* app.settle
      expect(teardownTabBox.isDestroyed).toBe(false)
      expect(teardownLazyBox.isDestroyed).toBe(false)
      expect(boxes).toHaveLength(11)
      const teardownErrorFallbackBox = boxes[10]!
      expect(teardownErrorFallbackBox.isDestroyed).toBe(false)
      expect(fallbackActive).toBe(1)
      expect(fallbackReleases).toBe(3)

      app.root.send(RootMsg.Set({ mounted: false }))
      yield* app.settle
      expect(app.captureFrame()).toContain("unmounted")
      expect(teardownTabBox.isDestroyed).toBe(true)
      expect(teardownLazyBox.isDestroyed).toBe(true)
      expect(teardownFragileBox.isDestroyed).toBe(true)
      expect(teardownErrorFallbackBox.isDestroyed).toBe(true)
      expect(fallbackActive).toBe(0)
      expect(fallbackReleases).toBe(4)
    }))

  it.effect("stops mouse propagation on innermost handler even when returning undefined, and resets removed style props", () =>
    Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({
        OuterClicked: {},
        ToggledBorder: {}
      })

      const App = OpenTui.component({
        name: "PropagationAndStyleReset",

        model: Schema.Struct({
          outerClicks: Schema.Number,
          bordered: Schema.Boolean
        }),

        message: Message
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
      class CustomBox extends OT.BoxRenderable {
        constructor(ctx: OT.RenderContext, options: OT.BoxOptions) {
          super(ctx, { ...options, title: "CustomTag" })
        }
      }

      const App = OpenTui.component({
        name: "CustomEl",
        model: Schema.Void,
        message: Schema.Never
      }).make({
        init: () => undefined,
        update: () => undefined,
        view: (h) =>
          h.el("custom-box").prop("border", true).prop("width", 18).children(
            h.text("custom!")
          )
      })

      const app = yield* OpenTuiTest.mount(App, {}, {
        width: 22,
        height: 5,
        renderables: { "custom-box": CustomBox }
      })
      const frame = app.captureFrame()
      expect(frame).toContain("CustomTag")
      expect(frame).toContain("custom!")
    }))
})
