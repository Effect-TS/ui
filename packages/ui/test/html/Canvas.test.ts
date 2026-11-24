// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { BrowserHost, Canvas, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const recorder = () => {
  const calls: Array<string> = []
  const state: Record<string, unknown> = { globalAlpha: 1 }
  const context = new Proxy({}, {
    get: (_, name: string) =>
      name in state
        ? state[name]
        : (...args: Array<unknown>) =>
          void calls.push(`${name}(${args.join(",")})`),
    set: (_, name: string, value) => {
      state[name] = value
      calls.push(`${name}=${value}`)
      return true
    }
  })
  return { calls, context: context as CanvasRenderingContext2D }
}

const Message = UiSchema.TaggedEnum({
  Pressed: { x: Schema.Number, y: Schema.Number, pointerType: Schema.String },
  Released: { x: Schema.Number, y: Schema.Number },
  Bumped: {}
})

const Dots = Html.component({
  name: "Dots",
  model: Schema.Struct({
    dots: Schema.Array(Canvas.Point),
    bumps: Schema.Number
  }),
  message: Message
}).make({
  init: () => ({ dots: [], bumps: 0 }),
  update: {
    Pressed: ($, { x, y }) => ({
      ...$.model,
      dots: [...$.model.dots, { x, y }]
    }),
    Released: ($, { x, y }) => ({
      ...$.model,
      dots: [...$.model.dots, { x, y }]
    }),
    Bumped: ($) => ({ ...$.model, bumps: $.model.bumps + 1 })
  },
  view: (h, model) =>
    h.div(
      Canvas.view(h, {
        width: 300,
        height: 200,
        pixelRatio: 2,
        shapes: model.dots.map(({ x, y }) =>
          Canvas.Circle({ x, y, radius: 4, fill: "red" })
        ),
        onPointerDown: ({ pointerType, x, y }) =>
          Message.Pressed({ x, y, pointerType }),
        onPointerUp: ({ x, y }) => Message.Released({ x, y })
      }),
      h.output(String(model.bumps))
    )
})

describe("Canvas", { concurrent: false }, () => {
  const tick = Effect.promise(() =>
    new Promise<void>((resolve) => setTimeout(resolve, 30))
  )

  it.effect("paints at the pixel ratio, repaints only a changed scene, and reports pointers in scene coordinates", () =>
    Effect.gen(function*() {
      const { calls, context } = recorder()
      const getContext = HTMLCanvasElement.prototype.getContext
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          HTMLCanvasElement.prototype.getContext = (() => context) as any
        }),
        () =>
          Effect.sync(() => HTMLCanvasElement.prototype.getContext = getContext)
      )
      const app = yield* Effect.acquireRelease(
        Effect.sync(() =>
          document.body.appendChild(document.createElement("div"))
        ),
        (element) => Effect.sync(() => element.remove())
      )
      const root = yield* BrowserHost.mountEffect(Dots, {}, app)
      yield* tick
      const canvas = app.querySelector("canvas")!
      assert.deepStrictEqual([canvas.width, canvas.height], [600, 400])
      assert.strictEqual(canvas.style.width, "300px")
      assert.strictEqual(canvas.style.height, "200px")
      assert.deepStrictEqual(calls.splice(0), [
        "setTransform(2,0,0,2,0,0)",
        "clearRect(0,0,300,200)"
      ])

      const captured: Array<number> = []
      canvas.setPointerCapture = (id) => void captured.push(id)
      canvas.getBoundingClientRect = () =>
        ({ left: 10, top: 20, width: 150, height: 100 }) as DOMRect
      canvas.dispatchEvent(
        new PointerEvent("pointerdown", {
          clientX: 85,
          clientY: 70,
          pointerId: 7,
          pointerType: "pen"
        })
      )
      yield* tick
      assert.deepStrictEqual(root.model()?.dots, [{ x: 150, y: 100 }])
      assert.deepStrictEqual(captured, [7])
      assert.deepStrictEqual(calls.splice(0), [
        "setTransform(2,0,0,2,0,0)",
        "clearRect(0,0,300,200)",
        "save()",
        "beginPath()",
        `arc(150,100,4,0,${Math.PI * 2})`,
        "fillStyle=red",
        "fill()",
        "restore()"
      ])

      root.send(Message.Bumped())
      yield* tick
      assert.strictEqual(app.querySelector("output")!.textContent, "1")
      assert.deepStrictEqual(calls, [])

      canvas.dispatchEvent(
        new PointerEvent("pointercancel", { clientX: 10, clientY: 20 })
      )
      yield* tick
      assert.deepStrictEqual(root.model()?.dots, [{ x: 150, y: 100 }, {
        x: 0,
        y: 0
      }])
    }).pipe(Effect.scoped))

  it("scenes are equal only when every nested shape and path command is", () => {
    const same = Schema.toEquivalence(Schema.Array(Canvas.Shape))
    const line = (x: number) =>
      Canvas.Group({
        shapes: [
          Canvas.Path({
            commands: [
              Canvas.PathCommand.MoveTo({ x: 0, y: 0 }),
              Canvas.PathCommand.LineTo({ x, y: 1 })
            ]
          })
        ]
      })
    assert.isTrue(same([line(1)], [line(1)]))
    assert.isFalse(same([line(1)], [line(2)]))
    assert.isFalse(
      same([Canvas.Circle({ x: 0, y: 0, radius: 1 })], [
        Canvas.Rect({ x: 0, y: 0, width: 1, height: 1 })
      ])
    )
  })

  it("paint draws paths, text and nested groups in order, each between save and restore", () => {
    const { calls, context } = recorder()
    Canvas.paint(context, {
      width: 10,
      height: 10,
      shapes: [
        Canvas.Path({
          commands: [
            Canvas.PathCommand.MoveTo({ x: 0, y: 0 }),
            Canvas.PathCommand.LineTo({ x: 1, y: 0 }),
            Canvas.PathCommand.QuadTo({ cpx: 1, cpy: 1, x: 2, y: 2 }),
            Canvas.PathCommand.BezierTo({
              cp1x: 3,
              cp1y: 3,
              cp2x: 4,
              cp2y: 4,
              x: 5,
              y: 5
            }),
            Canvas.PathCommand.Close()
          ],
          stroke: "blue",
          lineWidth: 2,
          lineCap: "round"
        }),
        Canvas.Group({
          opacity: 0.5,
          translate: { x: 1, y: 2 },
          rotate: 3,
          scale: { x: 2, y: 2 },
          shapes: [
            Canvas.Group({
              opacity: 0.5,
              shapes: [
                Canvas.Rect({ x: 0, y: 0, width: 1, height: 1, stroke: "red" })
              ]
            }),
            Canvas.Text({
              x: 1,
              y: 1,
              content: "hi",
              font: "8px serif",
              align: "center",
              fill: "black"
            })
          ]
        })
      ]
    })
    assert.deepStrictEqual(calls, [
      "clearRect(0,0,10,10)",
      "save()",
      "beginPath()",
      "moveTo(0,0)",
      "lineTo(1,0)",
      "quadraticCurveTo(1,1,2,2)",
      "bezierCurveTo(3,3,4,4,5,5)",
      "closePath()",
      "lineCap=round",
      "strokeStyle=blue",
      "lineWidth=2",
      "stroke()",
      "restore()",
      "save()",
      "globalAlpha=0.5",
      "translate(1,2)",
      "rotate(3)",
      "scale(2,2)",
      "save()",
      "globalAlpha=0.25",
      "save()",
      "strokeStyle=red",
      "strokeRect(0,0,1,1)",
      "restore()",
      "restore()",
      "save()",
      "font=8px serif",
      "textAlign=center",
      "fillStyle=black",
      "fillText(hi,1,1)",
      "restore()",
      "restore()"
    ])
  })
})
