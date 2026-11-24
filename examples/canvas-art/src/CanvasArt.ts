import { Command, Head, UiSchema } from "@effect/ui"
import { Button } from "@effect/ui-kit"
import { Canvas, Html, HtmlSubscription } from "@effect/ui/html"
import { Effect, Random, Schema } from "effect"

export const CANVAS_WIDTH = 600
export const CANVAS_HEIGHT = 400

const BALL_RADIUS_MIN = 8
const BALL_RADIUS_MAX = 24
const BALL_SPEED_MIN = 80
const BALL_SPEED_MAX = 240
const MAX_FRAME_MS = 50

const PALETTE = [
  "#ff2d55",
  "#ffcc00",
  "#34c759",
  "#5ac8fa",
  "#af52de",
  "#ff9500"
]

export const Ball = Schema.Struct({
  id: Schema.Number,
  x: Schema.Number,
  y: Schema.Number,
  vx: Schema.Number,
  vy: Schema.Number,
  radius: Schema.Number,
  color: Schema.String
})
export type Ball = typeof Ball.Type

export const CanvasArtModel = Schema.Struct({
  balls: Schema.Array(Ball),
  nextId: Schema.Number,
  running: Schema.Boolean
})
export type CanvasArtModel = typeof CanvasArtModel.Type

const NewBall = {
  x: Schema.Number,
  y: Schema.Number,
  vx: Schema.Number,
  vy: Schema.Number,
  radius: Schema.Number,
  color: Schema.String
}

export const CanvasArtMessage = UiSchema.TaggedEnum({
  TickedFrame: { delta: Schema.Number },
  ClickedCanvas: { x: Schema.Number, y: Schema.Number },
  CompletedGenerateBall: NewBall,
  ClickedClear: {},
  ClickedTogglePlay: {}
})

export const GenerateBall = Command.make(
  "GenerateBall",
  { args: { x: Schema.Number, y: Schema.Number } },
  ({ x, y }) =>
    Effect.gen(function*() {
      const angle = yield* Random.nextBetween(0, Math.PI * 2)
      const speed = yield* Random.nextBetween(BALL_SPEED_MIN, BALL_SPEED_MAX)
      const radius = yield* Random.nextBetween(BALL_RADIUS_MIN, BALL_RADIUS_MAX)
      const color = PALETTE[
        yield* Random.nextIntBetween(0, PALETTE.length, { halfOpen: true })
      ]!
      return {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius,
        color
      }
    })
)

const advance = (seconds: number) => (ball: Ball): Ball => {
  const x = ball.x + ball.vx * seconds
  const y = ball.y + ball.vy * seconds
  const maxX = CANVAS_WIDTH - ball.radius
  const maxY = CANVAS_HEIGHT - ball.radius
  return {
    ...ball,
    x: Math.max(ball.radius, Math.min(maxX, x)),
    y: Math.max(ball.radius, Math.min(maxY, y)),
    vx: x < ball.radius || x > maxX ? -ball.vx : ball.vx,
    vy: y < ball.radius || y > maxY ? -ball.vy : ball.vy
  }
}

const background = Canvas.Rect({
  x: 0,
  y: 0,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  fill: "#0a0a0f"
})

const sceneOf = (model: CanvasArtModel): ReadonlyArray<Canvas.Shape> => [
  background,
  ...model.balls.map(({ color, radius, x, y }) =>
    Canvas.Circle({ x, y, radius, fill: color })
  )
]

const BUTTON_CLASS = "min-w-20 px-4 py-2 text-white rounded"

export const CanvasArt = Html.component({
  name: "CanvasArt",
  model: CanvasArtModel,
  message: CanvasArtMessage
}).make({
  init: () => ({ balls: [], nextId: 0, running: true }),
  update: {
    TickedFrame: ($, { delta }) =>
      $.evolve({
        balls: (balls) =>
          balls.map(advance(Math.min(delta, MAX_FRAME_MS) / 1000))
      }),
    ClickedCanvas: ($, { x, y }) =>
      $.run(
        GenerateBall.make({ x, y }).pipe(
          Command.map((ball) => CanvasArtMessage.CompletedGenerateBall(ball))
        )
      ),
    CompletedGenerateBall: ($, { _tag, ...ball }) =>
      $.evolve({
        balls: [...$.model.balls, { id: $.model.nextId, ...ball }],
        nextId: $.model.nextId + 1
      }),
    ClickedClear: ($) => $.evolve({ balls: [] }),
    ClickedTogglePlay: ($) => $.evolve({ running: !$.model.running })
  },
  subscriptions: ({ model }) => [
    model.running &&
    HtmlSubscription.onAnimationFrame((delta) =>
      CanvasArtMessage.TickedFrame({ delta })
    )
  ],
  head: ({ model }) => [Head.title(`Canvas Art (${model.balls.length} balls)`)],
  view: (h, model) =>
    h.div.class(
      "flex flex-col items-center justify-center min-h-screen bg-black text-white p-8"
    ).children(
      h.h1.class("text-4xl font-bold mb-2").children("Canvas Art"),
      h.p.class("text-zinc-400 mb-6").children(
        "Click the canvas to spawn a ball."
      ),
      Canvas.view(h, {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        pixelRatio: "auto",
        shapes: sceneOf(model),
        onPointerDown: ({ x, y }) => CanvasArtMessage.ClickedCanvas({ x, y })
      }).class("rounded-lg shadow-2xl cursor-crosshair").attr(
        "aria-label",
        "Canvas art"
      ),
      h.div.class("flex gap-3 mt-4").children(
        Button(h, { onPress: CanvasArtMessage.ClickedTogglePlay() })
          .class(BUTTON_CLASS, "bg-indigo-600 hover:bg-indigo-500")
          .children(model.running ? "Pause" : "Play"),
        Button(h, { onPress: CanvasArtMessage.ClickedClear() })
          .class(BUTTON_CLASS, "bg-zinc-700 hover:bg-zinc-600")
          .children("Clear"),
        h.p.class("px-4 py-2 text-zinc-400 text-sm self-center").children(
          `${model.balls.length} balls`
        )
      )
    )
})
