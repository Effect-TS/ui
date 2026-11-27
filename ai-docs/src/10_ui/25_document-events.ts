/**
 * @title Document and window events
 *
 * Listen for keys on the document while a game runs, test it in a scene,
 * and press a key in a whole-app test.
 */
import { UiSchema } from "@effect/ui"
import { Html, HtmlSubscription } from "@effect/ui/html"
import { HtmlScene, TestGlobalEvents } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { Effect, Layer, Schema } from "effect"

const Direction = Schema.Literals(["up", "down", "left", "right"])
const arrows: ReadonlyArray<
  readonly [key: string, direction: typeof Direction.Type]
> = [
  ["ArrowUp", "up"],
  ["ArrowDown", "down"],
  ["ArrowLeft", "left"],
  ["ArrowRight", "right"]
]

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
// while `running` is true. `HtmlSubscription.shortcuts` wraps
// `HtmlSubscription.onDocument("keydown", ...)` with `preventDefault: true`
// so the page doesn't scroll for a matched key and keeps every other key.
// By default it skips `defaultPrevented` (a key an element's handler already
// took), `composing`, `repeat` (a held key's auto-repeats), `ctrl`/`alt`/`meta`
// combos, and `editable` (keys typed into a field); `whileTyping: true` lets
// `Escape` through. The listener runs the declaration from the latest
// `subscriptions`, so omitting the opposite direction updates with `model.heading`.
export const Snake = Html.component({
  name: "Snake",
  model: Schema.Struct({ running: Schema.Boolean, heading: Direction }),
  message: SnakeMessage
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
      : h.button.on("click", SnakeMessage.ClickedStart()).children("Start"),
  subscriptions: ({ model }) => [
    model.running && HtmlSubscription.shortcuts([
      {
        key: "Escape",
        message: SnakeMessage.PressedEscape(),
        whileTyping: true
      },
      // Reversing into itself isn't a turn.
      ...arrows.flatMap(([key, direction]) =>
        direction === opposite[model.heading]
          ? []
          : [{ key, message: SnakeMessage.PressedArrow({ direction }) }]
      )
    ])
  ]
})

const opposite = {
  up: "down",
  down: "up",
  left: "right",
  right: "left"
} as const

// ---------------------------------------------------------------------------
// Key sequences
// ---------------------------------------------------------------------------

const NavMessage = UiSchema.TaggedEnum({
  OpenedSearch: {},
  WentToList: {},
  WentToBoard: {}
})

// `HtmlSubscription.keySequences` takes single-key rows and `keys` rows in one
// table. The running Subscription holds the presses so far, so the Model
// doesn't. A press more than `timeout` (one second by default) after the one
// before starts over, measured with the events' `timeStamp`. The first row
// the presses match or begin wins, so a `g` row next to `g l` would leave one
// of them dead, and in development that throws.
export const Nav = Html.component({
  name: "Nav",
  model: Schema.String,
  message: NavMessage
}).make({
  init: () => "home",
  update: {
    OpenedSearch: () => "search",
    WentToList: () => "list",
    WentToBoard: () => "board"
  },
  view: (h, page) => h.p(page),
  subscriptions: () => [
    HtmlSubscription.keySequences([
      { key: "/", message: NavMessage.OpenedSearch() },
      { keys: ["g", "l"], message: NavMessage.WentToList() },
      { keys: ["g", "b"], message: NavMessage.WentToBoard() }
    ])
  ]
})

// A scene sets `timeStamp` to move time between presses, with no clock. A
// begun row's press is handled and default-prevented, and a late press is
// matched as a first press.
export const navigated = Effect.gen(function*() {
  const s = yield* HtmlScene.make(Nav, {})
  s.fireDocument("keydown", { key: "g", timeStamp: 0 }).expectDefaultPrevented()
    .fireDocument("keydown", { key: "l", timeStamp: 300 })
    .expect(Locator.text("list")).toExist()
    .fireDocument("keydown", { key: "g", timeStamp: 1000 })
    .fireDocument("keydown", { key: "b", timeStamp: 2500 }).expectIgnored()
})

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
  const cancelled = yield* TestGlobalEvents.fire("document", "keydown", {
    key: "ArrowUp"
  })
  yield* TestHost.settle
  return { cancelled, heading: root.model()?.heading }
}).pipe(Effect.provide(Layer.merge(TestHost.layer(), TestGlobalEvents.layer)))
