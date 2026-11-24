/**
 * @title Drawing on a canvas
 *
 * Draw a scene from the Model, move it every animation frame, turn presses
 * into scene points, and test it in a scene and a whole-app test.
 */
import { Component, UiSchema } from "@effect/ui"
import { Canvas, Html, HtmlSubscription } from "@effect/ui/html"
import { HtmlScene, TestAnimationFrames } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { Effect, Layer, Schema } from "effect"

const WIDTH = 400
const HEIGHT = 300

const Comet = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  speed: Schema.Number
})

const SkyMessage = UiSchema.TaggedEnum({
  TickedFrame: { delta: Schema.Number },
  PressedSky: { x: Schema.Number, y: Schema.Number },
  ClickedPause: {}
})

// ---------------------------------------------------------------------------
// A scene from the Model
// ---------------------------------------------------------------------------

// The scene is plain data: `Canvas.Rect`, `Circle`, `Path`, `Text` and a
// nestable `Group` that translates, rotates, scales and fades what it holds.
// The constructors skip validation, so building a scene every frame is cheap.
// Each shape is a Schema too, so a Model can hold shapes.
export const sceneOf = (
  comets: ReadonlyArray<typeof Comet.Type>
): ReadonlyArray<Canvas.Shape> => [
  Canvas.Rect({ x: 0, y: 0, width: WIDTH, height: HEIGHT, fill: "#000814" }),
  ...comets.map(({ x, y }) =>
    Canvas.Group({
      translate: { x, y },
      shapes: [
        Canvas.Path({
          commands: [
            Canvas.PathCommand.MoveTo({ x: 0, y: 0 }),
            Canvas.PathCommand.LineTo({ x: -30, y: 0 })
          ],
          stroke: "#ffd60a",
          lineWidth: 2,
          lineCap: "round"
        }),
        Canvas.Circle({ x: 0, y: 0, radius: 5, fill: "#ffd60a" })
      ]
    })
  ),
  Canvas.Text({
    x: 8,
    y: 20,
    content: `${comets.length} comets`,
    font: "14px sans-serif",
    fill: "#fff"
  })
]

// ---------------------------------------------------------------------------
// The canvas, its frames and its presses
// ---------------------------------------------------------------------------

// `Canvas.view` returns the `h.canvas` builder with the `Canvas.Paint`
// mount, which takes the element's one mount slot. It paints on mount and
// again only when the scene differs, so a render that leaves it equal
// doesn't repaint. The server writes `<canvas width height>` and the
// fallback children; nothing paints until the client mounts.
//
// `pixelRatio: "auto"` sizes the backing store by `devicePixelRatio`, read
// in the mount, so the view stays pure. With a ratio other than `1` the view
// sets inline `width` and `height` at the scene size, or the canvas would
// lay out at its backing-store size; `.style({ width: "100%" })` replaces
// them for a canvas that fills its container.
//
// Pointer handlers get `Html.PointerPayload` with `x` and `y` in scene
// units, however large the canvas shows. With `onPointerMove` or
// `onPointerUp`, a press captures the pointer, and a cancelled press arrives
// at `onPointerUp`, so a drag that leaves the canvas still ends.
//
// `HtmlSubscription.onAnimationFrame` gives the ms since the last frame, and
// the first since it started, so pausing doesn't save up a jump. A tab that
// comes back from the background still sends one long frame: cap it.
export const Sky = Component.define({
  name: "Sky",
  model: Schema.Struct({
    running: Schema.Boolean,
    comets: Schema.Array(Comet)
  }),
  message: SkyMessage,
  elements: Html
}).make({
  init: () => ({ running: true, comets: [] }),
  update: {
    TickedFrame: ($, { delta }) =>
      $.evolve({
        comets: (comets) =>
          comets.map((comet) => ({
            ...comet,
            x: (comet.x + comet.speed * Math.min(delta, 50) / 1000) % WIDTH
          }))
      }),
    PressedSky: ($, { x, y }) =>
      $.evolve({ comets: [...$.model.comets, { x, y, speed: 120 }] }),
    ClickedPause: ($) => $.evolve({ running: !$.model.running })
  },
  subscriptions: ({ model }) => [
    model.running &&
    HtmlSubscription.onAnimationFrame((delta) =>
      SkyMessage.TickedFrame({ delta })
    )
  ],
  view: (h, model) =>
    h.div([
      Canvas.view(h, {
        width: WIDTH,
        height: HEIGHT,
        pixelRatio: "auto",
        shapes: sceneOf(model.comets),
        onPointerDown: ({ x, y }) => SkyMessage.PressedSky({ x, y })
      }).style({ width: "100%" }).children(["A night sky with comets"]),
      h.button.onClick(SkyMessage.ClickedPause()).children([
        model.running ? "Pause" : "Play"
      ])
    ])
})

// ---------------------------------------------------------------------------
// A scene asserts on the shapes, presses the canvas and fires frames
// ---------------------------------------------------------------------------

// The painted scene is the `Canvas.Paint` mount's args, so `expectMount`
// asserts on it. `mounted` sends what a press would, in scene units, and
// `frame(delta)` fires an animation frame.
const paint = (comets: ReadonlyArray<typeof Comet.Type>) =>
  Canvas.Paint({
    width: WIDTH,
    height: HEIGHT,
    pixelRatio: "auto",
    listen: ["pointerdown"],
    shapes: sceneOf(comets)
  })

const press = {
  button: 0,
  shift: false,
  ctrl: false,
  alt: false,
  meta: false,
  pointerType: "mouse" as const
}

export const pressedAndMoved = Effect.gen(function*() {
  const s = yield* HtmlScene.make(Sky, {})
  s.expectMount(paint([]))
    .mounted(Canvas.Paint, { ...press, event: "pointerdown", x: 100, y: 50 })
    .expectMount(paint([{ x: 100, y: 50, speed: 120 }]))
    .frame(25)
    .expectMount(paint([{ x: 103, y: 50, speed: 120 }]))
})

// ---------------------------------------------------------------------------
// A whole-app test fires frames through a fake source
// ---------------------------------------------------------------------------

// `BrowserHost.layer` provides the frames; elsewhere none fire.
// `TestAnimationFrames.layer` is the fake: `fire(delta)` runs every frame
// listener, and the next `settle` shows the update.
export const moved = Effect.gen(function*() {
  const root = yield* TestHost.mount(Sky, {})
  root.send(SkyMessage.PressedSky({ x: 0, y: 0 }))
  yield* TestHost.settle
  yield* TestAnimationFrames.fire(500)
  yield* TestHost.settle
  return root.model()?.comets[0]?.x
}).pipe(
  Effect.provide(Layer.merge(TestHost.layer(), TestAnimationFrames.layer))
)
