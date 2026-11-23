/**
 * @title Document and window events
 *
 * Listen for keys on the document while a game runs, test it in a scene,
 * and press a key in a whole-app test.
 */
import { Component, UiSchema } from "@effect/ui"
import { Html, HtmlSubscription } from "@effect/ui/html"
import { HtmlScene, TestGlobalEvents } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { Effect, Layer, Schema } from "effect"

const Direction = Schema.Literals(["up", "down", "left", "right"])
const directions: Record<string, typeof Direction.Type> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right"
}

const SnakeMessage = UiSchema.TaggedEnum({
  ClickedStart: {},
  PressedArrow: { direction: Direction },
  PressedEscape: {}
})

// ---------------------------------------------------------------------------
// Listening on the document while the game runs
// ---------------------------------------------------------------------------

// `HtmlSubscription` holds the listeners on the live document and window,
// apart from `Html`, which only describes elements. Each entry is a
// Subscription, keyed by target, event and phase, so the game listens only
// while `running` is true. The handler returns a message
// or `undefined`; with `preventDefault: true` the page doesn't scroll for
// an arrow the game took, and keeps every other key. The handler may read
// the Model: the listener runs the one from the latest `subscriptions`.
// `defaultPrevented` skips a key an element's handler already took,
// `repeat` skips a held key's auto-repeats, and `editable` skips keys typed
// into a field, while `Escape` still gets through.
export const Snake = Component.define({
  name: "Snake",
  scoped: false,
  model: Schema.Struct({ running: Schema.Boolean, heading: Direction }),
  message: SnakeMessage,
  elements: Html
}).make({
  init: () => ({ running: false, heading: "right" as const }),
  update: {
    ClickedStart: ($) => $.evolve({ running: true }),
    PressedArrow: ($, { direction }) => $.evolve({ heading: direction }),
    PressedEscape: ($) => $.evolve({ running: false })
  },
  view: (h, model) =>
    model.running
      ? h.p(`heading ${model.heading}`)
      : h.button.onClick(SnakeMessage.ClickedStart()).children("Start"),
  subscriptions: ({ model }) => [
    model.running && HtmlSubscription.onDocument(
      "keydown",
      ({ composing, defaultPrevented, editable, key, repeat }) => {
        if (defaultPrevented || composing || repeat) return undefined
        if (key === "Escape") return SnakeMessage.PressedEscape()
        if (editable) return undefined
        const direction = directions[key]
        // Reversing into itself isn't a turn.
        return direction === undefined || direction === opposite[model.heading]
          ? undefined
          : SnakeMessage.PressedArrow({ direction })
      },
      { preventDefault: true }
    )
  ]
})

const opposite = { up: "down", down: "up", left: "right", right: "left" } as const

// ---------------------------------------------------------------------------
// A scene fires document events
// ---------------------------------------------------------------------------

// `fireDocument` runs the active listener's handler with the payload, its
// missing fields defaulted, and dispatches what it returns.
// `expectDefaultPrevented` and `expectIgnored` read the step. With no
// listener for the event it throws and lists the active keys, so a key
// fired before the game starts fails the test.
export const steered = Effect.gen(function*() {
  const s = yield* HtmlScene.make(Snake, {})
  s.click(Locator.text("Start"))
    .fireDocument("keydown", { key: "ArrowUp", editable: true }).expectIgnored()
    .fireDocument("keydown", { key: "ArrowUp", repeat: true }).expectIgnored()
    .fireDocument("keydown", { key: "ArrowUp" }).expectDefaultPrevented()
    .fireDocument("keydown", { key: "ArrowDown" }).expectIgnored()
    .fireDocument("keydown", { key: "Escape" })
  s.expect(Locator.text("Start")).toExist()
})

// ---------------------------------------------------------------------------
// A whole-app test fires them through a fake source
// ---------------------------------------------------------------------------

// `TestHost` provides no document, so without a source the listener never
// fires. `TestGlobalEvents.layer` is the fake: `fire` runs every listener
// for the event and returns whether one cancelled the default.
export const pressed = Effect.gen(function*() {
  const root = yield* TestHost.mount(Snake, {})
  root.send(SnakeMessage.ClickedStart())
  yield* TestHost.settle
  const cancelled = yield* TestGlobalEvents.fire("document", "keydown", { key: "ArrowUp" })
  yield* TestHost.settle
  return { cancelled, heading: root.model()?.heading }
}).pipe(Effect.provide(Layer.merge(TestHost.layer(), TestGlobalEvents.layer)))
