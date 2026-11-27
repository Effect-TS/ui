// @vitest-environment happy-dom
import { Query, Renderer, UiSchema } from "@effect/ui"
import {
  BrowserHost,
  Html,
  HtmlServer,
  HtmlSubscription
} from "@effect/ui/html"
import {
  HtmlScene,
  TestAnimationFrames,
  TestGlobalEvents,
  TestMediaQueries
} from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Layer, Schema } from "effect"

const Message = UiSchema.TaggedEnum({
  Pressed: { key: Schema.String },
  Renamed: { prefix: Schema.String },
  Stopped: {}
})

// Logs every key but Escape, each with the prefix the Model holds, and `!`
// when something cancelled it first.
const Keys = Html.component({
  name: "Keys",
  model: Schema.Struct({
    listening: Schema.Boolean,
    prefix: Schema.String,
    log: Schema.Array(Schema.String)
  }),
  message: Message
}).make({
  init: () => ({ listening: true, prefix: "a", log: [] }),
  update: {
    Pressed: ($, { key }) => ({ ...$.model, log: [...$.model.log, key] }),
    Renamed: ($, { prefix }) => ({ ...$.model, prefix }),
    Stopped: ($) => ({ ...$.model, listening: false })
  },
  view: (h, model) =>
    h.div(
      h.input.attr("id", "field").on("keydown", ({ key }) =>
        key === "Enter" ? Message.Renamed({ prefix: "field" }) : undefined, {
        preventDefault: true
      }),
      h.button.attr("id", "rename").on(
        "click",
        Message.Renamed({ prefix: "b" })
      ),
      h.button.attr("id", "stop").on("click", Message.Stopped()),
      h.output(model.log.join(","))
    ),
  subscriptions: ({ model }) => [
    model.listening && HtmlSubscription.onDocument(
      "keydown",
      ({ defaultPrevented, key }) =>
        key === "Escape"
          ? undefined
          : Message.Pressed({
            key: `${model.prefix}${key}${defaultPrevented ? "!" : ""}`
          }),
      { preventDefault: true }
    )
  ]
})

const PhaseMessage = UiSchema.TaggedEnum({ Heard: { what: Schema.String } })

// A press in each phase, and the window's focus. The capture listener
// cancels every press, and stops listening after the first.
const Phases = Html.component({
  name: "Phases",
  model: Schema.Array(Schema.String),
  message: PhaseMessage
}).make({
  init: (): ReadonlyArray<string> => [],
  update: ($, { what }) => [...$.model, what],
  view: (h, log) =>
    h.div(h.button.attr("id", "inner"), h.output(log.join(","))),
  subscriptions: ({ model: log }) => [
    !log.includes("capture") &&
    HtmlSubscription.onDocument(
      "mousedown",
      PhaseMessage.Heard({ what: "capture" }),
      {
        capture: true,
        preventDefault: "always"
      }
    ),
    log.length > 0 &&
    HtmlSubscription.onDocument(
      "mousedown",
      ({ defaultPrevented }) =>
        PhaseMessage.Heard({ what: `bubble ${defaultPrevented}` })
    ),
    HtmlSubscription.onWindow("focus", PhaseMessage.Heard({ what: "focus" })),
    HtmlSubscription.onDocument(
      "pointercancel",
      ({ button, pointerType }) =>
        PhaseMessage.Heard({ what: `cancel ${button} ${pointerType}` })
    )
  ]
})

const testLayer = Layer.merge(TestHost.layer(), TestGlobalEvents.layer)

describe("HtmlSubscription.onDocument and HtmlSubscription.onWindow", () => {
  it("are keyed by target, event and phase", () => {
    const handler = () => undefined
    assert.deepStrictEqual(
      [
        HtmlSubscription.onDocument("keydown", handler),
        HtmlSubscription.onDocument("mousedown", handler, { capture: true }),
        HtmlSubscription.onWindow("blur", handler)
      ].map(({ key }) => key),
      [
        `@effect/ui/html/document:"keydown"`,
        `@effect/ui/html/document:"mousedown","capture"`,
        `@effect/ui/html/window:"blur"`
      ]
    )
  })

  it.effect("on TestHost, a listener calls the handler of the latest subscriptions run, and stops with its entry", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Keys, {})
      yield* TestHost.settle
      const click = (id: string) =>
        Locator.fire(root.get(Locator.attr("id", id)), "click")
      // A message cancels the default, and no message leaves it.
      assert.isTrue(
        yield* TestGlobalEvents.fire("document", "keydown", { key: "x" })
      )
      assert.isFalse(
        yield* TestGlobalEvents.fire("document", "keydown", { key: "Escape" })
      )
      click("rename")
      yield* TestHost.settle
      yield* TestGlobalEvents.fire("document", "keydown", { key: "y" })
      yield* TestHost.settle
      assert.deepStrictEqual(root.model()?.log, ["ax", "by"])
      click("stop")
      yield* TestHost.settle
      assert.isFalse(
        yield* TestGlobalEvents.fire("document", "keydown", { key: "z" })
      )
      yield* TestHost.settle
      assert.deepStrictEqual(root.model()?.log, ["ax", "by"])
    }).pipe(Effect.provide(testLayer)))

  it.effect("on TestHost without a source, nothing listens and nothing fails", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Keys, {})
      yield* TestHost.settle
      assert.deepStrictEqual(root.model()?.log, [])
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("a handler that throws fails its instance", () =>
    Effect.gen(function*() {
      const Throws = Html.component({
        name: "Throws",
        model: Schema.Null,
        message: Message
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) => h.p("throws"),
        subscriptions: () => [
          HtmlSubscription.onDocument("keydown", (): typeof Message.Type => {
            throw new Error("boom")
          })
        ]
      })
      yield* TestHost.mount(Throws, {})
      yield* TestHost.settle
      yield* TestGlobalEvents.fire("document", "keydown")
      const exit = yield* Effect.exit(TestHost.settle)
      assert.isTrue(Exit.isFailure(exit))
      assert.include(String(Exit.isFailure(exit) ? exit.cause : ""), "boom")
    }).pipe(Effect.provide(testLayer)))
})

const PreventDefault = Schema.Literals(["always", true, false])
const ParentMessage = UiSchema.TaggedEnum({
  Set: { listen: Schema.NullOr(PreventDefault) }
})

// A child listens for keys with the `preventDefault` its parent picks, or not
// at all for `null`. Its handler emits a message for every key but Escape.
const Listener = Html.component({
  name: "Listener",
  props: Schema.Struct({ preventDefault: PreventDefault }),
  model: Schema.Null,
  message: Message
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.span(),
  subscriptions: ({ props: { preventDefault } }) => [
    HtmlSubscription.onDocument(
      "keydown",
      ({ key }) => key === "Escape" ? undefined : Message.Pressed({ key }),
      {
        preventDefault
      }
    )
  ]
})

const Parent = Html.component({
  name: "Parent",
  model: Schema.NullOr(PreventDefault),
  message: ParentMessage
}).make({
  init: () => "always" as const,
  update: { Set: (_, { listen }) => listen },
  view: (h, listen) =>
    h.div(
      listen === null
        ? undefined
        : Listener(h, { props: { preventDefault: listen } })
    )
})

describe("BrowserHost's GlobalEvents", { concurrent: false }, () => {
  const tick = Effect.promise(() =>
    new Promise<void>((resolve) => setTimeout(resolve, 30))
  )
  const container = Effect.acquireRelease(
    Effect.sync(() => document.body.appendChild(document.createElement("div"))),
    (element) => Effect.sync(() => element.remove())
  )
  const byId = (id: string) => document.querySelector<HTMLElement>("#" + id)!
  const press = (target: EventTarget, key: string) => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true
    })
    target.dispatchEvent(event)
    return event.defaultPrevented
  }

  it.effect("delivers the document's keys with plain payloads, and an element's cancel shows in defaultPrevented", () =>
    Effect.gen(function*() {
      const root = yield* BrowserHost.mountEffect(Keys, {}, yield* container)
      yield* tick
      assert.isTrue(press(document.body, "x"))
      assert.isFalse(press(document.body, "Escape"))
      // The field's handler cancels Enter before the document hears it.
      assert.isTrue(press(byId("field"), "Enter"))
      yield* tick
      assert.deepStrictEqual(root.model()?.log, ["ax", "fieldEnter!"])
    }).pipe(Effect.scoped))

  it.effect("a key pressed before the parent renders goes by the declaration that render gives", () =>
    Effect.gen(function*() {
      const root = yield* BrowserHost.mountEffect(Parent, {}, yield* container)
      const set = (listen: typeof PreventDefault.Type | null) =>
        root.send(ParentMessage.Set({ listen }))
      yield* tick
      // A current "always" listener cancels even when its handler emits nothing.
      assert.isTrue(press(document.body, "Escape"))
      // Each change is followed by a press before the scheduled render.
      set(true)
      assert.isFalse(press(document.body, "Escape"))
      set(false)
      assert.isFalse(press(document.body, "x"))
      set("always")
      yield* tick
      set(null)
      assert.isFalse(press(document.body, "Escape"))
    }).pipe(Effect.scoped))

  it.effect("stops listening when the tree unmounts", () =>
    Effect.gen(function*() {
      yield* Effect.gen(function*() {
        yield* BrowserHost.mountEffect(Keys, {}, yield* container)
        yield* tick
      }).pipe(Effect.scoped)
      assert.isFalse(press(document.body, "x"))
    }))

  it.effect("a capture listener hears a press an element stops, and the window's focus reaches onWindow", () =>
    Effect.gen(function*() {
      const root = yield* BrowserHost.mountEffect(Phases, {}, yield* container)
      yield* tick
      const inner = byId("inner")
      const press = () =>
        inner.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, cancelable: true })
        )
      inner.addEventListener("mousedown", (event) => event.stopPropagation(), {
        once: true
      })
      press()
      yield* tick
      press()
      window.dispatchEvent(new FocusEvent("focus"))
      inner.dispatchEvent(
        new PointerEvent("pointercancel", {
          bubbles: true,
          button: 2,
          pointerType: "pen"
        })
      )
      yield* tick
      // The stopped press reached capture; only the second press bubbled.
      assert.deepStrictEqual(root.model(), [
        "capture",
        "bubble false",
        "focus",
        "cancel 2 pen"
      ])
      const scene = yield* HtmlScene.make(Phases, {})
      scene.fireDocument("pointercancel", { button: 1 }).expect(
        Locator.tag("output")
      ).toHaveText("cancel 1 mouse")
    }).pipe(Effect.scoped))

  it.effect("delivers CustomEvent detail on BrowserHost, TestGlobalEvents and HtmlScene", () =>
    Effect.gen(function*() {
      const Custom = Html.component({
        name: "Custom",
        model: Schema.Array(Schema.String),
        message: PhaseMessage
      }).make({
        init: (): ReadonlyArray<string> => [],
        update: ($, { what }) => [...$.model, what],
        view: (h, log) => h.output(log.join(",")),
        subscriptions: () => [
          HtmlSubscription.onCustomEvent(
            "submit",
            ({ defaultPrevented, detail }) =>
              typeof detail === "string"
                ? PhaseMessage.Heard({
                  what: `${detail}${defaultPrevented ? "!" : ""}`
                })
                : detail === null
                ? PhaseMessage.Heard({ what: "empty" })
                : undefined,
            { preventDefault: true }
          )
        ]
      })

      const browser = yield* BrowserHost.mountEffect(
        Custom,
        {},
        yield* container
      )
      yield* tick
      const cancelled = new CustomEvent("submit", {
        detail: "hello",
        cancelable: true
      })
      document.dispatchEvent(cancelled)
      document.dispatchEvent(new CustomEvent("submit", { detail: undefined }))
      document.dispatchEvent(new CustomEvent("submit", { detail: 123 }))
      yield* tick
      assert.isTrue(cancelled.defaultPrevented)
      assert.deepStrictEqual(browser.model(), ["hello", "empty"])

      const root = yield* TestHost.mount(Custom, {})
      yield* TestHost.settle
      assert.isTrue(
        yield* TestGlobalEvents.fireCustomEvent("submit", { detail: "test" })
      )
      yield* TestGlobalEvents.fireCustomEvent("submit", { detail: undefined })
      assert.isFalse(
        yield* TestGlobalEvents.fireCustomEvent("submit", { detail: 42 })
      )
      yield* TestHost.settle
      assert.deepStrictEqual(root.model(), ["test", "empty"])

      const scene = yield* HtmlScene.make(Custom, {})
      scene.fireCustomEvent("submit", {
        detail: "scene",
        defaultPrevented: true
      })
        .expectDefaultPrevented()
        .fireCustomEvent("submit", { detail: undefined })
        .fireCustomEvent("submit", { detail: 0 }).expectIgnored()
        .expect(Locator.tag("output")).toHaveText("scene!,empty")
    }).pipe(Effect.provide(testLayer), Effect.scoped))
})

describe("HtmlScene.fireDocument and fireWindow", () => {
  it.effect("deliver the same cancelled press to a bubble listener enabled during capture in both test tools", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Phases, {})
      scene.fireDocument("mousedown")
        .expectDefaultPrevented()
        .expect(Locator.tag("output")).toHaveText("capture,bubble true")
      const root = yield* TestHost.mount(Phases, {})
      yield* TestHost.settle
      yield* TestGlobalEvents.fire("document", "mousedown")
      yield* TestHost.settle
      assert.deepStrictEqual(root.model(), ["capture", "bubble true"])

      // The capture listener is gone, so only the bubble one runs.
      scene.fireDocument("mousedown").expectDefaultPrevented(false)
        .fireWindow("focus")
        .expect(Locator.tag("output")).toHaveText(
          "capture,bubble true,bubble false,focus"
        )
    }).pipe(Effect.provide(testLayer)))

  it.effect("run the handler of the current Model, and a listener that returns nothing is ignored", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Keys, {})
      scene.fireDocument("keydown", { key: "x" }).expectDefaultPrevented()
        .click(Locator.attr("id", "rename"))
        .fireDocument("keydown", { key: "y", defaultPrevented: true })
        .fireDocument("keydown", { key: "Escape" }).expectIgnored()
        .expectDefaultPrevented(false)
        .expect(Locator.tag("output")).toHaveText("ax,by!")
    }))

  it.effect("default editable and repeat to false on document keys and accept overrides", () =>
    Effect.gen(function*() {
      const Shortcut = Html.component({
        name: "Shortcut",
        model: Schema.Array(Schema.String),
        message: Schema.String
      }).make({
        init: (): ReadonlyArray<string> => [],
        update: ($, entry) => [...$.model, entry],
        view: (h, log) => h.output(log.join(",")),
        subscriptions: () => [
          HtmlSubscription.onDocument(
            "keydown",
            ({ editable, key, repeat }) => `${key}:${editable}:${repeat}`
          )
        ]
      })
      const root = yield* TestHost.mount(Shortcut, {})
      yield* TestHost.settle
      yield* TestGlobalEvents.fire("document", "keydown", { key: "g" })
      yield* TestGlobalEvents.fire("document", "keydown", {
        key: "g",
        editable: true,
        repeat: true
      })
      yield* TestHost.settle
      assert.deepStrictEqual(root.model(), ["g:false:false", "g:true:true"])
    }).pipe(Effect.provide(testLayer)))

  it.effect("throw when nothing listens, listing the active keys", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Keys, {})
      assert.throws(
        () => scene.fireDocument("mouseup"),
        `HtmlScene.fireDocument: nothing listens for "mouseup" on the document; active keys: ["@effect/ui/html/document:\\"keydown\\""]`
      )
    }))
})

describe("HtmlSubscription.shortcuts", () => {
  it.effect("defaults to keydown with preventDefault: true and forwards capture and preventDefault", () =>
    Effect.gen(function*() {
      const mount = (options?: HtmlSubscription.GlobalEventOptions) =>
        HtmlScene.make(
          Html.component({
            name: "Shortcuts",
            model: Schema.Array(Schema.String),
            message: Schema.String
          }).make({
            init: (): ReadonlyArray<string> => [],
            update: ($, entry) => [...$.model, entry],
            view: (h, log) => h.output(log.join(",")),
            subscriptions: () => [
              HtmlSubscription.shortcuts(
                [{ key: "?", message: "help" }],
                options
              )
            ]
          }),
          {}
        )

      const defaults = yield* mount()
      defaults.fireDocument("keydown", { key: "x" }).expectIgnored()
        .expectDefaultPrevented(false)
        .fireDocument("keydown", { key: "?" }).expectDefaultPrevented()
        .expect(Locator.tag("output")).toHaveText("help")

      const options = { capture: true, preventDefault: false } as const
      assert.strictEqual(
        HtmlSubscription.shortcuts([{ key: "?", message: "help" }], options)
          .key,
        `@effect/ui/html/document:"keydown","capture"`
      )
      const custom = yield* mount(options)
      custom.fireDocument("keydown", { key: "?" })
        .expectDefaultPrevented(false)
        .expect(Locator.tag("output")).toHaveText("help")
    }))
})

const FrameMessage = UiSchema.TaggedEnum({
  TickedFrame: { delta: Schema.Number },
  Toggled: {}
})

const Frames = Html.component({
  name: "Frames",
  model: Schema.Struct({
    running: Schema.Boolean,
    deltas: Schema.Array(Schema.Number)
  }),
  message: FrameMessage
}).make({
  init: () => ({ running: true, deltas: [] }),
  update: {
    TickedFrame: ($, { delta }) => ({
      ...$.model,
      deltas: [...$.model.deltas, delta]
    }),
    Toggled: ($) => ({ ...$.model, running: !$.model.running })
  },
  view: (h, model) => h.p(model.deltas.join(",")),
  subscriptions: ({ model }) => [
    model.running &&
    HtmlSubscription.onAnimationFrame((delta) =>
      FrameMessage.TickedFrame({ delta })
    )
  ]
})

describe("onAnimationFrame", { concurrent: false }, () => {
  it.effect("counts each delta from the last frame, and the first from when it starts, so a pause doesn't jump", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Frames, {})
      yield* TestHost.settle
      yield* TestAnimationFrames.fire(16)
      yield* TestAnimationFrames.fire(17)
      root.send(FrameMessage.Toggled())
      yield* TestHost.settle
      yield* TestAnimationFrames.fire(1000)
      root.send(FrameMessage.Toggled())
      yield* TestHost.settle
      yield* TestAnimationFrames.fire(5)
      assert.deepStrictEqual(root.model()?.deltas, [16, 17, 5])
    }).pipe(
      Effect.provide(Layer.merge(TestHost.layer(), TestAnimationFrames.layer)),
      Effect.scoped
    ))

  it.effect("on BrowserHost, dispatches in the frame's callback and requests no frame once the tree unmounts", () =>
    Effect.gen(function*() {
      const pending = new Map<number, FrameRequestCallback>()
      let next = 0
      const { cancelAnimationFrame, requestAnimationFrame } = window
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          window.requestAnimationFrame = (callback) => {
            pending.set(++next, callback)
            return next
          }
          window.cancelAnimationFrame = (id) => void pending.delete(id)
        }),
        () =>
          Effect.sync(() => {
            window.requestAnimationFrame = requestAnimationFrame
            window.cancelAnimationFrame = cancelAnimationFrame
          })
      )
      const runFrame = () => {
        const callbacks = Array.from(pending.values())
        pending.clear()
        for (const callback of callbacks) callback(performance.now())
      }
      const tick = Effect.promise(() =>
        new Promise<void>((resolve) => setTimeout(resolve, 30))
      )
      const deltas = yield* Effect.gen(function*() {
        const app = document.body.appendChild(document.createElement("div"))
        yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
        const root = yield* BrowserHost.mountEffect(Frames, {}, app)
        yield* tick
        runFrame()
        runFrame()
        return root.model()?.deltas.length
      }).pipe(Effect.scoped)
      assert.strictEqual(deltas, 2)
      assert.strictEqual(pending.size, 0)
    }).pipe(Effect.scoped))
})

const MediaMessage = UiSchema.TaggedEnum({
  DarkChanged: { matches: Schema.Boolean },
  MotionChanged: { matches: Schema.Boolean }
})

const Media = Html.component({
  name: "Media",
  model: Schema.Array(Schema.String),
  message: MediaMessage
}).make({
  init: (): ReadonlyArray<string> => [],
  update: {
    DarkChanged: ($, { matches }) => [...$.model, `dark:${matches}`],
    MotionChanged: ($, { matches }) => [...$.model, `motion:${matches}`]
  },
  view: (h, log) => h.output(log.join(",")),
  subscriptions: () => [
    HtmlSubscription.onMediaQuery(
      "(prefers-color-scheme: dark)",
      (matches) => MediaMessage.DarkChanged({ matches })
    ),
    HtmlSubscription.onMediaQuery(
      "(prefers-reduced-motion: reduce)",
      (matches) => MediaMessage.MotionChanged({ matches })
    )
  ]
})

describe("onMediaQuery", { concurrent: false }, () => {
  it.effect("emits the initial match and changes on TestMediaQueries, sends nothing by default, and drives HtmlScene.mediaQuery", () =>
    Effect.gen(function*() {
      // Without a MediaQueries source, nothing emits and nothing fails.
      yield* Effect.gen(function*() {
        const silent = yield* TestHost.mount(Media, {})
        yield* TestHost.settle
        assert.deepStrictEqual(silent.model(), [])
      }).pipe(Effect.provide(TestHost.layer()), Effect.scoped)

      // With TestMediaQueries, initial matches emit on start, then each change.
      yield* Effect.gen(function*() {
        yield* TestMediaQueries.set("(prefers-color-scheme: dark)", true)
        const root = yield* TestHost.mount(Media, {})
        yield* TestHost.settle
        yield* TestMediaQueries.set("(prefers-color-scheme: dark)", false)
        yield* TestMediaQueries.set("(prefers-reduced-motion: reduce)", true)
        yield* TestHost.settle
        assert.deepStrictEqual(root.model(), [
          "dark:true",
          "motion:false",
          "dark:false",
          "motion:true"
        ])
      }).pipe(
        Effect.provide(Layer.merge(TestHost.layer(), TestMediaQueries.layer)),
        Effect.scoped
      )

      // Early and reentrant changes are dispatched in the order they arrive.
      yield* Effect.gen(function*() {
        let change: (matches: boolean) => void = () => {}
        const log: Array<boolean> = []
        const Reentrant = Html.component({
          name: "Reentrant",
          model: Schema.Boolean,
          message: MediaMessage
        }).make({
          init: () => false,
          update: {
            DarkChanged: (_, { matches }) => matches,
            MotionChanged: ($) => $.model
          },
          view: (h) => h.p(""),
          subscriptions: () => [
            HtmlSubscription.onMediaQuery(
              "(prefers-color-scheme: dark)",
              (matches) => {
                // The first delivery changes the query back.
                if (log.push(matches) === 1) change(false)
                return MediaMessage.DarkChanged({ matches })
              }
            )
          ]
        })
        const root = yield* TestHost.mount(Reentrant, {}).pipe(
          Effect.provideService(HtmlSubscription.MediaQueries, {
            matches: () => false,
            listen: (_, listener) => {
              change = listener
              return () => {}
            }
          })
        )
        // A change before `initial` runs starts delivery early.
        change(true)
        yield* TestHost.settle
        assert.deepStrictEqual(log, [false, true, false])
        assert.strictEqual(root.model(), false)
      }).pipe(Effect.provide(TestHost.layer()), Effect.scoped)

      // HtmlScene.mediaQuery dispatches, and throws for unheard queries.
      const scene = yield* HtmlScene.make(Media, {})
      scene
        .mediaQuery("(prefers-color-scheme: dark)", true)
        .expect(Locator.tag("output")).toHaveText("dark:true")
      assert.throws(
        () => scene.mediaQuery("(min-width: 768px)", true),
        `HtmlScene.mediaQuery: nothing listens for media query "(min-width: 768px)"; active keys: ["@effect/ui/html/mediaQuery:\\"(prefers-color-scheme: dark)\\"","@effect/ui/html/mediaQuery:\\"(prefers-reduced-motion: reduce)\\""]`
      )
    }).pipe(Effect.scoped))

  it.effect("on BrowserHost, emits initial matchMedia state, hears changes, and removes listeners on unmount", () =>
    Effect.gen(function*() {
      const lists = new Map<
        string,
        {
          matches: boolean
          listeners: Set<(event: MediaQueryListEvent) => void>
        }
      >()
      const getList = (query: string) => {
        let entry = lists.get(query)
        if (entry === undefined) {
          entry = { matches: false, listeners: new Set() }
          lists.set(query, entry)
        }
        return entry
      }
      const original = window.matchMedia
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          getList("(prefers-color-scheme: dark)").matches = true
          window.matchMedia = ((query: string) => {
            const entry = getList(query)
            return {
              media: query,
              get matches() {
                return entry.matches
              },
              addEventListener: (
                type: string,
                listener: (event: MediaQueryListEvent) => void
              ) => {
                if (type === "change") entry.listeners.add(listener)
              },
              removeEventListener: (
                type: string,
                listener: (event: MediaQueryListEvent) => void
              ) => {
                if (type === "change") entry.listeners.delete(listener)
              }
            } as unknown as MediaQueryList
          }) as typeof window.matchMedia
        }),
        () =>
          Effect.sync(() => {
            window.matchMedia = original
          })
      )
      const fireChange = (query: string, matches: boolean) => {
        const entry = getList(query)
        entry.matches = matches
        for (const listener of Array.from(entry.listeners)) {
          listener({ matches, media: query } as MediaQueryListEvent)
        }
      }
      const tick = Effect.promise(() =>
        new Promise<void>((resolve) => setTimeout(resolve, 30))
      )
      const log = yield* Effect.gen(function*() {
        const app = document.body.appendChild(document.createElement("div"))
        yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
        const root = yield* BrowserHost.mountEffect(Media, {}, app)
        yield* tick
        fireChange("(prefers-color-scheme: dark)", false)
        yield* tick
        return root.model()
      }).pipe(Effect.scoped)
      assert.deepStrictEqual(log, ["dark:true", "motion:false", "dark:false"])
      assert.strictEqual(
        getList("(prefers-color-scheme: dark)").listeners.size,
        0
      )
    }).pipe(Effect.scoped))
})

const StatusMessage = UiSchema.TaggedEnum({
  VisibilityChanged: { visible: Schema.Boolean },
  ConnectivityChanged: { online: Schema.Boolean },
  Stopped: {}
})

const Status = Html.component({
  name: "Status",
  model: Schema.Struct({
    listening: Schema.Boolean,
    log: Schema.Array(Schema.String)
  }),
  message: StatusMessage
}).make({
  init: () => ({ listening: true, log: [] }),
  update: {
    VisibilityChanged: ($, { visible }) => ({
      ...$.model,
      log: [...$.model.log, `visible:${visible}`]
    }),
    ConnectivityChanged: ($, { online }) => ({
      ...$.model,
      log: [...$.model.log, `online:${online}`]
    }),
    Stopped: ($) => ({ ...$.model, listening: false })
  },
  view: (h, model) =>
    h.div(
      h.button.on("click", StatusMessage.Stopped()).children("stop"),
      h.output(model.log.join(","))
    ),
  subscriptions: ({ model }) => [
    model.listening &&
    HtmlSubscription.onVisibility((visible) =>
      StatusMessage.VisibilityChanged({ visible })
    ),
    model.listening &&
    HtmlSubscription.onConnectivity((online) =>
      StatusMessage.ConnectivityChanged({ online })
    )
  ]
})

describe("onVisibility and onConnectivity", { concurrent: false }, () => {
  it.effect("emits initial state and changes on TestHost, keeps init on SSR, and drives HtmlScene", () =>
    Effect.gen(function*() {
      const rendered = yield* HtmlServer.renderToHtml(Status, {})
      assert.deepStrictEqual(rendered.state["/Status"], {
        listening: true,
        log: []
      })

      yield* Effect.gen(function*() {
        const testHost = yield* TestHost.TestHost
        yield* TestHost.setVisible(false)
        yield* TestHost.setOnline(false)
        const offNested = testHost.connectivity.subscribe((online) => {
          if (!online) testHost.connectivity.set(true)
        })
        yield* Effect.addFinalizer(() => Effect.sync(offNested))
        const root = yield* TestHost.mount(Status, {})
        yield* TestHost.settle
        yield* TestHost.setVisible(true)
        yield* TestHost.setOnline(true)
        yield* TestHost.settle
        yield* TestHost.setOnline(false)
        yield* TestHost.settle
        offNested()
        root.send(StatusMessage.Stopped())
        yield* TestHost.settle

        const late: Array<boolean> = []
        let offLate: (() => void) | undefined
        const offFirst = testHost.connectivity.subscribe((online) => {
          if (!online) {
            offFirst()
            testHost.connectivity.set(true)
            testHost.connectivity.set(false)
            offLate = testHost.connectivity.subscribe((value) =>
              late.push(value)
            )
          }
        })
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            offFirst()
            offLate?.()
          })
        )
        yield* TestHost.setVisible(false)
        yield* TestHost.setOnline(false)
        yield* TestHost.settle
        assert.deepStrictEqual(root.model()?.log, [
          "visible:false",
          "online:false",
          "visible:true",
          "online:true",
          "online:false",
          "online:true"
        ])
        assert.strictEqual(testHost.connectivity.get(), false)
        assert.deepStrictEqual(late, [])

        class CustomSignal implements Query.Signal {
          private value = false
          private readonly subscribers = new Set<(value: boolean) => void>()
          get() {
            return this.value
          }
          subscribe(listener: (value: boolean) => void) {
            this.subscribers.add(listener)
            return () => {
              this.subscribers.delete(listener)
            }
          }
          emit(next: boolean) {
            this.value = next
            for (const listener of this.subscribers) listener(next)
          }
        }
        const custom = new CustomSignal()
        const customRoot = yield* Renderer.mount(
          Status,
          {},
          testHost.host.createElement("#app")
        ).pipe(
          Effect.provideService(Html.Host, BrowserHost.htmlHost),
          Effect.provideService(Query.Connectivity, custom)
        )
        yield* TestHost.settle
        custom.emit(true)
        yield* TestHost.settle
        assert.deepStrictEqual(customRoot.model()?.log, [
          "visible:true",
          "online:false",
          "online:true"
        ])
      }).pipe(Effect.provide(TestHost.layer()), Effect.scoped)

      const scene = yield* HtmlScene.make(Status, {})
      scene
        .visibility(false)
        .connectivity(false)
        .expect(Locator.tag("output")).toHaveText("visible:false,online:false")
        .click("stop")
      assert.throws(
        () => scene.visibility(true),
        /HtmlScene\.visibility: nothing listens for .*; active keys: \[\]/
      )
    }).pipe(Effect.scoped))

  it.effect("on BrowserHost, emits initial hidden and offline state and hears changes", () =>
    Effect.gen(function*() {
      const stub = (target: object, key: string, value: unknown) => {
        const original = Object.getOwnPropertyDescriptor(target, key)
        return Effect.acquireRelease(
          Effect.sync(() => {
            Object.defineProperty(target, key, { value, configurable: true })
          }),
          () =>
            Effect.sync(() => {
              if (original === undefined) delete (target as any)[key]
              else Object.defineProperty(target, key, original)
            })
        )
      }
      yield* stub(document, "visibilityState", "hidden")
      yield* stub(window.navigator, "onLine", false)
      const tick = Effect.promise(() =>
        new Promise<void>((resolve) => setTimeout(resolve, 30))
      )
      const log = yield* Effect.gen(function*() {
        const app = document.body.appendChild(document.createElement("div"))
        yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
        const root = yield* BrowserHost.mountEffect(Status, {}, app)
        yield* tick
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          configurable: true
        })
        document.dispatchEvent(new Event("visibilitychange"))
        window.dispatchEvent(new Event("online"))
        yield* tick
        return root.model()?.log
      }).pipe(Effect.scoped)
      assert.deepStrictEqual(log, [
        "visible:false",
        "online:false",
        "visible:true",
        "online:true"
      ])
    }).pipe(Effect.scoped))
})
