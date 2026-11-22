// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { BrowserHost, DomSubscription, Html } from "@effect/ui/html"
import { HtmlScene, TestGlobalEvents } from "@effect/ui/html/testing"
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
const Keys = Component.define({
  name: "Keys",
  scoped: false,
  model: Schema.Struct({ listening: Schema.Boolean, prefix: Schema.String, log: Schema.Array(Schema.String) }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ listening: true, prefix: "a", log: [] }),
  update: {
    Pressed: (model, { key }) => ({ ...model, log: [...model.log, key] }),
    Renamed: (model, { prefix }) => ({ ...model, prefix }),
    Stopped: (model) => ({ ...model, listening: false })
  },
  view: (model, h) =>
    h.div(
      h.input.attr("id", "field").onKeyDown(
        ({ key }) => key === "Enter" ? Message.Renamed({ prefix: "field" }) : undefined,
        {
          preventDefault: true
        }
      ),
      h.button.attr("id", "rename").onClick(Message.Renamed({ prefix: "b" })),
      h.button.attr("id", "stop").onClick(Message.Stopped()),
      h.output(model.log.join(","))
    ),
  subscriptions: (model) => [
    model.listening && DomSubscription.onDocument(
      "keydown",
      ({ defaultPrevented, key }) =>
        key === "Escape" ? undefined : Message.Pressed({ key: `${model.prefix}${key}${defaultPrevented ? "!" : ""}` }),
      { preventDefault: true }
    )
  ]
})

const PhaseMessage = UiSchema.TaggedEnum({ Heard: { what: Schema.String } })

// A press in each phase, and the window's focus. The capture listener
// cancels every press, and stops listening after the first.
const Phases = Component.define({
  name: "Phases",
  scoped: false,
  model: Schema.Array(Schema.String),
  message: PhaseMessage,
  elements: Html
}).make({
  init: (): ReadonlyArray<string> => [],
  update: (log, { what }) => [...log, what],
  view: (log, h) => h.div(h.button.attr("id", "inner"), h.output(log.join(","))),
  subscriptions: (log) => [
    !log.includes("capture") &&
    DomSubscription.onDocument("mousedown", PhaseMessage.Heard({ what: "capture" }), {
      capture: true,
      preventDefault: "always"
    }),
    log.length > 0 &&
    DomSubscription.onDocument(
      "mousedown",
      ({ defaultPrevented }) => PhaseMessage.Heard({ what: `bubble ${defaultPrevented}` })
    ),
    DomSubscription.onWindow("focus", PhaseMessage.Heard({ what: "focus" })),
    DomSubscription.onDocument(
      "pointercancel",
      ({ button, pointerType }) => PhaseMessage.Heard({ what: `cancel ${button} ${pointerType}` })
    )
  ]
})

const testLayer = Layer.merge(TestHost.layer(), TestGlobalEvents.layer)

describe("DomSubscription.onDocument and DomSubscription.onWindow", () => {
  it("are keyed by target, event and phase", () => {
    const handler = () => undefined
    assert.deepStrictEqual(
      [
        DomSubscription.onDocument("keydown", handler),
        DomSubscription.onDocument("mousedown", handler, { capture: true }),
        DomSubscription.onWindow("blur", handler)
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
      const click = (id: string) => Locator.fire(root.get(Locator.attr("id", id)), "click")
      // A message cancels the default, and no message leaves it.
      assert.isTrue(yield* TestGlobalEvents.fire("document", "keydown", { key: "x" }))
      assert.isFalse(yield* TestGlobalEvents.fire("document", "keydown", { key: "Escape" }))
      click("rename")
      yield* TestHost.settle
      yield* TestGlobalEvents.fire("document", "keydown", { key: "y" })
      yield* TestHost.settle
      assert.deepStrictEqual(root.model()?.log, ["ax", "by"])
      click("stop")
      yield* TestHost.settle
      assert.isFalse(yield* TestGlobalEvents.fire("document", "keydown", { key: "z" }))
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
      const Throws = Component.define({
        name: "Throws",
        scoped: false,
        model: Schema.Null,
        message: Message,
        elements: Html
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.p("throws"),
        subscriptions: () => [
          DomSubscription.onDocument("keydown", (): typeof Message.Type => {
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
const ParentMessage = UiSchema.TaggedEnum({ Set: { listen: Schema.NullOr(PreventDefault) } })

// A child listens for keys with the `preventDefault` its parent picks, or not
// at all for `null`. Its handler emits a message for every key but Escape.
const Listener = Component.define({
  name: "Listener",
  scoped: false,
  props: Schema.Struct({ preventDefault: PreventDefault }),
  model: Schema.Null,
  message: Message,
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.span(),
  subscriptions: (_, { preventDefault }) => [
    DomSubscription.onDocument("keydown", ({ key }) => key === "Escape" ? undefined : Message.Pressed({ key }), {
      preventDefault
    })
  ]
})

const Parent = Component.define({
  name: "Parent",
  scoped: false,
  model: Schema.NullOr(PreventDefault),
  message: ParentMessage,
  elements: Html
}).make({
  init: () => "always" as const,
  update: { Set: (_, { listen }) => listen },
  view: (listen, h) => h.div(listen === null ? undefined : Listener(h, { props: { preventDefault: listen } }))
})

describe("BrowserHost's GlobalEvents", { concurrent: false }, () => {
  const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))
  const container = Effect.acquireRelease(
    Effect.sync(() => document.body.appendChild(document.createElement("div"))),
    (element) => Effect.sync(() => element.remove())
  )
  const byId = (id: string) => document.querySelector<HTMLElement>("#" + id)!
  const press = (target: EventTarget, key: string) => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
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
      const set = (listen: typeof PreventDefault.Type | null) => root.send(ParentMessage.Set({ listen }))
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
      const press = () => inner.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
      inner.addEventListener("mousedown", (event) => event.stopPropagation(), { once: true })
      press()
      yield* tick
      press()
      window.dispatchEvent(new FocusEvent("focus"))
      inner.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, button: 2, pointerType: "pen" }))
      yield* tick
      // The stopped press reached capture; only the second press bubbled.
      assert.deepStrictEqual(root.model(), ["capture", "bubble false", "focus", "cancel 2 pen"])
      const s = yield* HtmlScene.make(Phases, {})
      s.fireDocument("pointercancel", { button: 1 }).expect(Locator.tag("output")).toHaveText("cancel 1 mouse")
    }).pipe(Effect.scoped))
})

describe("HtmlScene.fireDocument and fireWindow", () => {
  it.effect("deliver the same cancelled press to a bubble listener enabled during capture in both test tools", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Phases, {})
      s.fireDocument("mousedown")
        .expectDefaultPrevented()
        .expect(Locator.tag("output")).toHaveText("capture,bubble true")
      const root = yield* TestHost.mount(Phases, {})
      yield* TestHost.settle
      yield* TestGlobalEvents.fire("document", "mousedown")
      yield* TestHost.settle
      assert.deepStrictEqual(root.model(), ["capture", "bubble true"])

      // The capture listener is gone, so only the bubble one runs.
      s.fireDocument("mousedown").expectDefaultPrevented(false)
        .fireWindow("focus")
        .expect(Locator.tag("output")).toHaveText("capture,bubble true,bubble false,focus")
    }).pipe(Effect.provide(testLayer)))

  it.effect("run the handler of the current Model, and a listener that returns nothing is ignored", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Keys, {})
      s.fireDocument("keydown", { key: "x" }).expectDefaultPrevented()
        .click(Locator.attr("id", "rename"))
        .fireDocument("keydown", { key: "y", defaultPrevented: true })
        .fireDocument("keydown", { key: "Escape" }).expectIgnored().expectDefaultPrevented(false)
        .expect(Locator.tag("output")).toHaveText("ax,by!")
    }))

  it.effect("throw when nothing listens, listing the active keys", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Keys, {})
      assert.throws(
        () => s.fireDocument("mouseup"),
        `HtmlScene.fireDocument: nothing listens for "mouseup" on the document; active keys: ["@effect/ui/html/document:\\"keydown\\""]`
      )
    }))
})

describe("DomSubscription.onCustomEvent", { concurrent: false }, () => {
  const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))
  const container = Effect.acquireRelease(
    Effect.sync(() => document.body.appendChild(document.createElement("div"))),
    (element) => Effect.sync(() => element.remove())
  )
  const Custom = Component.define({
    name: "Custom",
    scoped: false,
    model: Schema.Array(Schema.String),
    message: PhaseMessage,
    elements: Html
  }).make({
    init: (): ReadonlyArray<string> => [],
    update: (log, { what }) => [...log, what],
    view: (log, h) => h.output(log.join(",")),
    subscriptions: () => [
      DomSubscription.onCustomEvent(
        "app:ping",
        ({ defaultPrevented, detail }) =>
          typeof detail === "string"
            ? PhaseMessage.Heard({ what: `${detail}${defaultPrevented ? "!" : ""}` })
            : detail === null
            ? PhaseMessage.Heard({ what: "empty" })
            : undefined,
        { preventDefault: true }
      )
    ]
  })

  it.effect("delivers CustomEvent detail on BrowserHost, TestGlobalEvents and HtmlScene", () =>
    Effect.gen(function*() {
      const browser = yield* BrowserHost.mountEffect(Custom, {}, yield* container)
      yield* tick
      const cancelled = new CustomEvent("app:ping", { detail: "hello", cancelable: true })
      document.dispatchEvent(cancelled)
      document.dispatchEvent(new CustomEvent("app:ping"))
      document.dispatchEvent(new CustomEvent("app:ping", { detail: 123 }))
      yield* tick
      assert.isTrue(cancelled.defaultPrevented)
      assert.deepStrictEqual(browser.model(), ["hello", "empty"])

      const root = yield* TestHost.mount(Custom, {})
      yield* TestHost.settle
      assert.isTrue(yield* TestGlobalEvents.fireCustomEvent("app:ping", { detail: "test" }))
      assert.isFalse(yield* TestGlobalEvents.fireCustomEvent("app:ping", { detail: 42 }))
      yield* TestHost.settle
      assert.deepStrictEqual(root.model(), ["test"])

      const s = yield* HtmlScene.make(Custom, {})
      s.fireCustomEvent("app:ping", { detail: "scene", defaultPrevented: true }).expectDefaultPrevented()
        .fireCustomEvent("app:ping")
        .fireCustomEvent("app:ping", { detail: 0 }).expectIgnored()
        .expect(Locator.tag("output")).toHaveText("scene!,empty")
    }).pipe(Effect.provide(testLayer), Effect.scoped))
})
