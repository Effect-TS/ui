// @vitest-environment happy-dom
import { Component, Subscription, UiSchema } from "@effect/ui"
import { BrowserHost, Html } from "@effect/ui/html"
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
    model.listening && Html.onDocument(
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
  model: Schema.Array(Schema.String),
  message: PhaseMessage,
  elements: Html
}).make({
  init: (): ReadonlyArray<string> => [],
  update: (log, { what }) => [...log, what],
  view: (log, h) => h.div(h.button.attr("id", "inner"), h.output(log.join(","))),
  subscriptions: (log) => [
    !log.includes("capture") &&
    Html.onDocument("mousedown", PhaseMessage.Heard({ what: "capture" }), { capture: true, preventDefault: "always" }),
    Html.onDocument("mousedown", ({ defaultPrevented }) => PhaseMessage.Heard({ what: `bubble ${defaultPrevented}` })),
    Html.onWindow("focus", PhaseMessage.Heard({ what: "focus" }))
  ]
})

const testLayer = Layer.merge(TestHost.layer(), TestGlobalEvents.layer)

describe("Html.onDocument and Html.onWindow", () => {
  it("are keyed by target, event and phase", () => {
    const handler = () => undefined
    assert.deepStrictEqual(
      [
        Html.onDocument("keydown", handler),
        Html.onDocument("mousedown", handler, { capture: true }),
        Html.onWindow("blur", handler)
      ].map(({ deps, key, name }) => ({ key, name, deps })),
      [
        { key: `@effect/ui/html/document:"keydown"`, name: "@effect/ui/html/document", deps: ["keydown"] },
        {
          key: `@effect/ui/html/document:"mousedown","capture"`,
          name: "@effect/ui/html/document",
          deps: ["mousedown", "capture"]
        },
        { key: `@effect/ui/html/window:"blur"`, name: "@effect/ui/html/window", deps: ["blur"] }
      ]
    )
    assert.strictEqual(
      Html.onDocument("keydown", handler).key,
      Subscription.keyOf("@effect/ui/html/document", "keydown")
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
        model: Schema.Null,
        message: Message,
        elements: Html
      }).make({
        init: () => null,
        update: (model) => model,
        view: (_, h) => h.p("throws"),
        subscriptions: () => [
          Html.onDocument("keydown", (): typeof Message.Type => {
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
      press()
      yield* tick
      inner.addEventListener("mousedown", (event) => event.stopPropagation())
      press()
      window.dispatchEvent(new FocusEvent("focus"))
      yield* tick
      // The capture listener stopped after the first press, and the stopped press never bubbled.
      assert.deepStrictEqual(root.model(), ["capture", "bubble true", "focus"])
    }).pipe(Effect.scoped))
})

describe("HtmlScene.fireDocument and fireWindow", () => {
  it.effect("run the capture listener, then the bubble one, which sees the cancel", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Phases, {})
      s.fireDocument("mousedown")
        .expectDefaultPrevented()
        .expect(Locator.tag("output")).toHaveText("capture,bubble true")
      // The capture listener is gone, so only the bubble one runs.
      s.fireDocument("mousedown").expectDefaultPrevented(false)
        .fireWindow("focus")
        .expect(Locator.tag("output")).toHaveText("capture,bubble true,bubble false,focus")
    }))

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
      assert.throws(() => s.fireWindow("blur"), /nothing listens for "blur" on the window/)
    }))
})
