/**
 * A `<canvas>` drawn from data: the view lists shapes, and the canvas
 * shows them.
 *
 * Shapes are Schemas, so a scene is plain data that a test asserts on and
 * the log records. `view` returns the `h.canvas` builder with the
 * `Paint` mount on it, which paints on mount and again whenever the scene
 * changes, and reports pointer presses in scene coordinates. `paint` draws
 * a scene on any 2D context, such as an `OffscreenCanvas`'s. For animation,
 * pair it with `HtmlSubscription.onAnimationFrame`.
 *
 * **Example** (Dots where the user clicks)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Canvas, Html } from "@effect/ui/html"
 * import { HtmlScene } from "@effect/ui/html/testing"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ PressedCanvas: { x: Schema.Number, y: Schema.Number } })
 *
 * const Dots = Html.component({
 *   name: "Dots",
 *   model: Schema.Array(Canvas.Point),
 *   message: Message
 * }).make({
 *   init: (): ReadonlyArray<Canvas.Point> => [],
 *   update: { PressedCanvas: ($, { x, y }) => [...$.model, { x, y }] },
 *   view: (h, model) =>
 *     Canvas.view(h, {
 *       width: 300,
 *       height: 200,
 *       shapes: model.map(({ x, y }) => Canvas.Circle({ x, y, radius: 4, fill: "tomato" })),
 *       onPointerDown: ({ x, y }) => Message.PressedCanvas({ x, y })
 *     }).attr("aria-label", "Dots")
 * })
 *
 * const pressed = { button: 0, shift: false, ctrl: false, alt: false, meta: false, pointerType: "mouse" as const }
 *
 * Effect.gen(function*() {
 *   const s = yield* HtmlScene.make(Dots, {})
 *   s.mounted(Canvas.Paint, { ...pressed, event: "pointerdown", x: 10, y: 20 })
 *     .expectMount(Canvas.Paint({
 *       width: 300,
 *       height: 200,
 *       pixelRatio: 1,
 *       listen: ["pointerdown"],
 *       shapes: [Canvas.Circle({ x: 10, y: 20, radius: 4, fill: "tomato" })]
 *     }))
 * }).pipe(Effect.scoped, Effect.runSync)
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Record from "effect/Record"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Component from "../Component.ts"
import { handle } from "../internal/handler.ts"
import * as Mount from "../Mount.ts"
import * as UiSchema from "../UiSchema.ts"
import type * as View from "../View.ts"
import type * as Html from "./Html.ts"
import { modifiers, pointerTypeOf } from "./internal/pointer.ts"

const callable = <S extends Schema.Top, F extends Function>(
  schema: S,
  construct: F
): S & F => Object.setPrototypeOf(construct, schema)

const tagged =
  <A extends { readonly _tag: string }>(tag: A["_tag"]) =>
  (fields: Omit<A, "_tag">): A => ({ ...fields, _tag: tag }) as A

// The equivalence derived for a union validates both values against a member before it compares them,
// which costs many times the comparison. The `_tag` already says which member's equivalence applies.
const sameByTag = <
  S extends Schema.Top & { readonly Type: { readonly _tag: string } }
>(
  cases: Record<S["Type"]["_tag"], Schema.Top>
) =>
  Schema.overrideToEquivalence<S>(() => {
    const same: Record<string, (a: unknown, b: unknown) => boolean> = Record
      .map(cases, (schema) => Schema.toEquivalence(schema))
    return (a, b) => a._tag === b._tag && same[a._tag]?.(a, b) === true
  })

/**
 * A point in scene coordinates.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number })

/**
 * A point in scene coordinates.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export interface Point extends Schema.Schema.Type<typeof Point> {}

/**
 * A source rectangle in image pixels.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export const Crop = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number
})

/**
 * A source rectangle in image pixels.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export interface Crop extends Schema.Schema.Type<typeof Crop> {}

/**
 * How the ends of a stroked open path look.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export const LineCap = Schema.Literals(["butt", "round", "square"])

/**
 * How two stroked segments of a path meet.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export const LineJoin = Schema.Literals(["miter", "round", "bevel"])

/**
 * Where a `Text` sits across its `x`.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export const TextAlign = Schema.Literals([
  "left",
  "center",
  "right",
  "start",
  "end"
])

/**
 * Where a `Text` sits across its `y`.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export const TextBaseline = Schema.Literals([
  "top",
  "middle",
  "bottom",
  "alphabetic",
  "hanging",
  "ideographic"
])

const RectSchema = Schema.TaggedStruct("Rect", {
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
  fill: Schema.optional(Schema.String),
  stroke: Schema.optional(Schema.String),
  lineWidth: Schema.optional(Schema.Number)
})

/**
 * A rectangle, filled, stroked or both.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export interface Rect extends Schema.Schema.Type<typeof RectSchema> {}

/**
 * A rectangle's Schema, and its constructor, which doesn't validate:
 * `Canvas.Rect({ x: 0, y: 0, width: 600, height: 400, fill: "#000" })`.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export const Rect: typeof RectSchema & ((fields: Omit<Rect, "_tag">) => Rect) =
  callable(
    RectSchema,
    tagged<Rect>("Rect")
  )

const CircleSchema = Schema.TaggedStruct("Circle", {
  x: Schema.Number,
  y: Schema.Number,
  radius: Schema.Number,
  fill: Schema.optional(Schema.String),
  stroke: Schema.optional(Schema.String),
  lineWidth: Schema.optional(Schema.Number)
})

/**
 * A circle around `x` and `y`, filled, stroked or both.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export interface Circle extends Schema.Schema.Type<typeof CircleSchema> {}

/**
 * A circle's Schema, and its constructor, which doesn't validate.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export const Circle:
  & typeof CircleSchema
  & ((fields: Omit<Circle, "_tag">) => Circle) = callable(
    CircleSchema,
    tagged<Circle>("Circle")
  )

/**
 * The steps of a `Path`, with a constructor per step that doesn't
 * validate: `MoveTo`, `LineTo`, `QuadTo` and `BezierTo`, which take
 * their control points before the end point, and `Close`, which draws back
 * to where the path started.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export const PathCommand = UiSchema.TaggedEnum({
  MoveTo: { x: Schema.Number, y: Schema.Number },
  LineTo: { x: Schema.Number, y: Schema.Number },
  QuadTo: {
    cpx: Schema.Number,
    cpy: Schema.Number,
    x: Schema.Number,
    y: Schema.Number
  },
  BezierTo: {
    cp1x: Schema.Number,
    cp1y: Schema.Number,
    cp2x: Schema.Number,
    cp2y: Schema.Number,
    x: Schema.Number,
    y: Schema.Number
  },
  Close: {}
})

/**
 * A step of a `Path`.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export type PathCommand = typeof PathCommand.Type

const PathSchema = Schema.TaggedStruct("Path", {
  commands: Schema.Array(PathCommand.pipe(sameByTag(PathCommand.cases))),
  fill: Schema.optional(Schema.String),
  stroke: Schema.optional(Schema.String),
  lineWidth: Schema.optional(Schema.Number),
  lineCap: Schema.optional(LineCap),
  lineJoin: Schema.optional(LineJoin)
})

/**
 * A path drawn by its `commands`, filled, stroked or both.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export interface Path extends Schema.Schema.Type<typeof PathSchema> {}

/**
 * A path's Schema, and its constructor, which doesn't validate.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export const Path: typeof PathSchema & ((fields: Omit<Path, "_tag">) => Path) =
  callable(
    PathSchema,
    tagged<Path>("Path")
  )

const TextSchema = Schema.TaggedStruct("Text", {
  x: Schema.Number,
  y: Schema.Number,
  content: Schema.String,
  font: Schema.optional(Schema.String),
  fill: Schema.optional(Schema.String),
  stroke: Schema.optional(Schema.String),
  lineWidth: Schema.optional(Schema.Number),
  align: Schema.optional(TextAlign),
  baseline: Schema.optional(TextBaseline)
})

/**
 * One line of text at `x` and `y`, filled, stroked or both. `font` is
 * a CSS font, such as `"16px sans-serif"`.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export interface Text extends Schema.Schema.Type<typeof TextSchema> {}

/**
 * A text's Schema, and its constructor, which doesn't validate.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export const Text: typeof TextSchema & ((fields: Omit<Text, "_tag">) => Text) =
  callable(
    TextSchema,
    tagged<Text>("Text")
  )

const ImageSchema = Schema.TaggedStruct("Image", {
  src: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  crop: Schema.optional(Crop),
  smoothing: Schema.optional(Schema.Boolean)
})

/**
 * An image at `x` and `y`, optionally cropped from `crop` in image pixels,
 * sized to `width` and `height` (defaulting to the crop or image size), and
 * drawn with `smoothing` (`false` for crisp pixel art). Draws nothing until
 * loaded.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export interface Image extends Schema.Schema.Type<typeof ImageSchema> {}

/**
 * An image's Schema, and its constructor, which doesn't validate.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export const Image:
  & typeof ImageSchema
  & ((fields: Omit<Image, "_tag">) => Image) = callable(
    ImageSchema,
    tagged<Image>("Image")
  )

/**
 * Shapes drawn together, moved by `translate`, then turned by `rotate` in
 * radians, then sized by `scale`, and faded by `opacity`. A group in a
 * group adds its own on top.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export interface Group {
  readonly _tag: "Group"
  readonly shapes: ReadonlyArray<Shape>
  readonly translate?: Point | undefined
  readonly rotate?: number | undefined
  readonly scale?: Point | undefined
  readonly opacity?: number | undefined
}

const GroupSchema = Schema.TaggedStruct("Group", {
  shapes: Schema.Array(Schema.suspend((): Schema.Codec<Shape> => Shape)),
  translate: Schema.optional(Point),
  rotate: Schema.optional(Schema.Number),
  scale: Schema.optional(Point),
  opacity: Schema.optional(Schema.Number)
})

/**
 * A group's Schema, and its constructor, which doesn't validate.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export const Group:
  & typeof GroupSchema
  & ((fields: Omit<Group, "_tag">) => Group) = callable(
    GroupSchema,
    tagged<Group>("Group")
  )

/**
 * Anything a scene holds.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export type Shape = Rect | Circle | Path | Text | Image | Group

/**
 * The Schema of any shape.
 *
 * @stability experimental
 * @category shapes
 * @since 0.1.0
 */
export const Shape: Schema.Codec<Shape> = Schema.Union([
  Rect,
  Circle,
  Path,
  Text,
  Image,
  Group
]).pipe(
  sameByTag({ Rect, Circle, Path, Text, Image, Group })
)

/**
 * A 2D context `paint` draws on: a `<canvas>`'s or an `OffscreenCanvas`'s.
 *
 * @stability experimental
 * @category painting
 * @since 0.1.0
 */
export type Context2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D

/**
 * A decoded image source `paint` can draw.
 *
 * @stability experimental
 * @category painting
 * @since 0.1.0
 */
export type ImageSource =
  | HTMLImageElement
  | ImageBitmap
  | HTMLCanvasElement
  | OffscreenCanvas

const strokeWith = (
  context: Context2D,
  stroke: string,
  lineWidth: number | undefined
) => {
  context.strokeStyle = stroke
  if (lineWidth !== undefined) context.lineWidth = lineWidth
}

const paintShape = (
  context: Context2D,
  shape: Shape,
  images: ((src: string) => ImageSource | undefined) | undefined
): void => {
  context.save()
  try {
    switch (shape._tag) {
      case "Rect": {
        if (shape.fill !== undefined) {
          context.fillStyle = shape.fill
          context.fillRect(shape.x, shape.y, shape.width, shape.height)
        }
        if (shape.stroke !== undefined) {
          strokeWith(context, shape.stroke, shape.lineWidth)
          context.strokeRect(shape.x, shape.y, shape.width, shape.height)
        }
        break
      }
      case "Circle": {
        context.beginPath()
        context.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2)
        fillAndStroke(context, shape)
        break
      }
      case "Path": {
        context.beginPath()
        for (const command of shape.commands) {
          switch (command._tag) {
            case "MoveTo":
              context.moveTo(command.x, command.y)
              break
            case "LineTo":
              context.lineTo(command.x, command.y)
              break
            case "QuadTo":
              context.quadraticCurveTo(
                command.cpx,
                command.cpy,
                command.x,
                command.y
              )
              break
            case "BezierTo":
              context.bezierCurveTo(
                command.cp1x,
                command.cp1y,
                command.cp2x,
                command.cp2y,
                command.x,
                command.y
              )
              break
            case "Close":
              context.closePath()
          }
        }
        if (shape.lineCap !== undefined) context.lineCap = shape.lineCap
        if (shape.lineJoin !== undefined) context.lineJoin = shape.lineJoin
        fillAndStroke(context, shape)
        break
      }
      case "Text": {
        if (shape.font !== undefined) context.font = shape.font
        if (shape.align !== undefined) context.textAlign = shape.align
        if (shape.baseline !== undefined) context.textBaseline = shape.baseline
        if (shape.fill !== undefined) {
          context.fillStyle = shape.fill
          context.fillText(shape.content, shape.x, shape.y)
        }
        if (shape.stroke !== undefined) {
          strokeWith(context, shape.stroke, shape.lineWidth)
          context.strokeText(shape.content, shape.x, shape.y)
        }
        break
      }
      case "Image": {
        const image = images?.(shape.src)
        if (image === undefined) break
        if (shape.smoothing !== undefined) {
          context.imageSmoothingEnabled = shape.smoothing
        }
        if (shape.crop !== undefined) {
          const { height, width, x, y } = shape.crop
          context.drawImage(
            image,
            x,
            y,
            width,
            height,
            shape.x,
            shape.y,
            shape.width ?? width,
            shape.height ?? height
          )
        } else if (shape.width === undefined && shape.height === undefined) {
          context.drawImage(image, shape.x, shape.y)
        } else {
          // An `<img>`'s `width` is its layout size, so its source size is the natural one.
          const width = shape.width ??
            ("naturalWidth" in image ? image.naturalWidth : image.width)
          const height = shape.height ??
            ("naturalHeight" in image ? image.naturalHeight : image.height)
          context.drawImage(image, shape.x, shape.y, width, height)
        }
        break
      }
      case "Group": {
        if (shape.opacity !== undefined) context.globalAlpha *= shape.opacity
        if (shape.translate !== undefined) {
          context.translate(shape.translate.x, shape.translate.y)
        }
        if (shape.rotate !== undefined) context.rotate(shape.rotate)
        if (shape.scale !== undefined) {
          context.scale(shape.scale.x, shape.scale.y)
        }
        for (const child of shape.shapes) paintShape(context, child, images)
      }
    }
  } finally {
    context.restore()
  }
}

const fillAndStroke = (context: Context2D, shape: Circle | Path) => {
  if (shape.fill !== undefined) {
    context.fillStyle = shape.fill
    context.fill()
  }
  if (shape.stroke !== undefined) {
    strokeWith(context, shape.stroke, shape.lineWidth)
    context.stroke()
  }
}

/**
 * Clears a `width` by `height` scene and draws `shapes` on `context`, in
 * order, so a later shape covers an earlier one.
 *
 * **When to use**
 *
 * Use to draw a scene outside `view`, such as on an `OffscreenCanvas` to
 * export an image. `Paint` calls it on each change.
 *
 * **Details**
 *
 * Each shape is drawn between `save` and `restore`, so its styles and a
 * group's transform don't reach the next one. The context's own transform
 * applies, which is how `Paint` scales a scene to its pixel ratio. Pass
 * `images` to resolve `Image` shapes by `src`; without it, or when it returns
 * `undefined`, an `Image` draws nothing.
 *
 * **Example** (Drawing on an `OffscreenCanvas`)
 *
 * ```ts
 * import { Canvas } from "@effect/ui/html"
 *
 * const offscreen = new OffscreenCanvas(100, 100)
 * Canvas.paint(offscreen.getContext("2d")!, {
 *   width: 100,
 *   height: 100,
 *   shapes: [Canvas.Rect({ x: 0, y: 0, width: 100, height: 100, fill: "navy" })]
 * })
 * ```
 *
 * @stability experimental
 * @category painting
 * @since 0.1.0
 */
export const paint = (
  context: Context2D,
  scene: {
    readonly width: number
    readonly height: number
    readonly shapes: ReadonlyArray<Shape>
  },
  images?: (src: string) => ImageSource | undefined
): void => {
  context.clearRect(0, 0, scene.width, scene.height)
  for (const shape of scene.shapes) paintShape(context, shape, images)
}

/**
 * The pointer events a canvas reports.
 *
 * @stability experimental
 * @category mounts
 * @since 0.1.0
 */
export const PointerEvent = Schema.Literals([
  "pointerdown",
  "pointermove",
  "pointerup"
])

/**
 * A pointer event a canvas reports.
 *
 * @stability experimental
 * @category mounts
 * @since 0.1.0
 */
export type PointerEvent = typeof PointerEvent.Type

/**
 * What `Paint` reports: the event, and its pointer payload with `x` and
 * `y` in scene coordinates.
 *
 * @stability experimental
 * @category mounts
 * @since 0.1.0
 */
export interface Pointer extends Html.PointerPayload {
  readonly event: PointerEvent
}

/**
 * How many backing-store pixels a canvas has per scene unit: a number, or
 * `"auto"` for the screen's `devicePixelRatio`.
 *
 * @stability experimental
 * @category mounts
 * @since 0.1.0
 */
export const PixelRatio = Schema.Union([Schema.Number, Schema.Literal("auto")])

/**
 * How many backing-store pixels a canvas has per scene unit.
 *
 * @stability experimental
 * @category mounts
 * @since 0.1.0
 */
export type PixelRatio = typeof PixelRatio.Type

const imageLoader = (
  canvas: HTMLCanvasElement,
  onLoad: () => void,
  options?: AddEventListenerOptions
) => {
  const images = new Map<string, HTMLImageElement>()
  return (src: string): HTMLImageElement | undefined => {
    let image = images.get(src)
    if (image === undefined) {
      image = canvas.ownerDocument.createElement("img")
      images.set(src, image)
      image.src = src
      if (!(image.complete && image.naturalWidth > 0)) {
        image.addEventListener("load", onLoad, options)
      }
    }
    return image.complete && image.naturalWidth > 0 ? image : undefined
  }
}

const draw = (
  canvas: HTMLCanvasElement,
  args: {
    readonly width: number
    readonly height: number
    readonly shapes: ReadonlyArray<Shape>
    readonly pixelRatio: PixelRatio
  },
  images: (src: string) => ImageSource | undefined
): boolean => {
  const context = canvas.getContext("2d")
  if (context === null) return false
  const ratio = args.pixelRatio === "auto"
    ? canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1
    : args.pixelRatio
  const width = Math.round(args.width * ratio)
  const height = Math.round(args.height * ratio)
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  paint(context, args, images)
  return true
}

/**
 * The mount `view` puts on its canvas. It paints the scene when the canvas
 * is added and whenever its args change, and reports the pointer events
 * `listen` names.
 *
 * **Details**
 *
 * - Args compare by the Schemas' equivalence, so a render that leaves the
 *   scene equal doesn't repaint.
 * - `Image` shapes load per canvas, draw nothing until loaded, and repaint
 *   when ready without sending a message.
 * - The backing store is `width` by `height` times the pixel ratio, and the
 *   context is scaled to match, so shapes stay in scene coordinates.
 *   `"auto"` reads `devicePixelRatio` as the mount paints.
 * - A pointer's `x` and `y` are in scene coordinates whatever size the
 *   canvas is shown at.
 * - With `pointermove` or `pointerup` listened for, a press captures the
 *   pointer, so a drag that ends outside the canvas still sends its
 *   `pointerup`. A `pointercancel`, such as a touch the browser turns into
 *   a scroll, is reported as `pointerup`.
 * - On a copy of the page that runs no mounts, such as DevTools time
 *   travel, it paints the scene once and reports nothing.
 *
 * A test asserts on the args with `expectMount` and sends a `Pointer`
 * with `mounted`.
 *
 * @stability experimental
 * @category mounts
 * @since 0.1.0
 */
export const Paint = Mount.makeStream(
  "Canvas.Paint",
  {
    args: {
      width: Schema.Number,
      height: Schema.Number,
      shapes: Schema.Array(Shape),
      pixelRatio: PixelRatio,
      listen: Schema.Array(PointerEvent)
    },
    paint: (canvas: HTMLCanvasElement, args) => {
      const images = imageLoader(canvas, () => {
        if (canvas.isConnected) draw(canvas, args, images)
      })
      if (!draw(canvas, args, images)) throw new Error("no 2D context")
    }
  },
  (canvas: HTMLCanvasElement, initial, changes) =>
    Stream.callback<Pointer>((queue) =>
      Effect.gen(function*() {
        let args = initial
        const listening = new AbortController()
        const { signal } = listening
        yield* Effect.addFinalizer(() => Effect.sync(() => listening.abort()))
        const images = imageLoader(canvas, () => draw(canvas, args, images), {
          signal
        })
        const report =
          (event: PointerEvent) => (from: globalThis.PointerEvent) => {
            if (!args.listen.includes(event)) return
            const box = canvas.getBoundingClientRect()
            Queue.offerUnsafe(queue, {
              event,
              button: from.button,
              x: (from.clientX - box.left) *
                (box.width === 0 ? 1 : args.width / box.width),
              y: (from.clientY - box.top) *
                (box.height === 0 ? 1 : args.height / box.height),
              ...modifiers(from),
              pointerType: pointerTypeOf(from) ?? "mouse"
            })
          }
        canvas.addEventListener("pointerdown", (event) => {
          if (
            !args.listen.includes("pointermove") &&
            !args.listen.includes("pointerup")
          ) return
          // A pointer the browser doesn't know as active, such as a synthetic event's, can't be captured.
          try {
            canvas.setPointerCapture(event.pointerId)
          } catch {}
        }, { signal })
        canvas.addEventListener("pointerdown", report("pointerdown"), {
          signal
        })
        canvas.addEventListener("pointermove", report("pointermove"), {
          signal
        })
        canvas.addEventListener("pointerup", report("pointerup"), { signal })
        canvas.addEventListener("pointercancel", report("pointerup"), {
          signal
        })
        yield* Stream.runForEach(changes, (next) =>
          Effect.sync(() => {
            args = next
            draw(canvas, next, images)
          })).pipe(Effect.forkScoped)
      })
    )
)

/**
 * A `<canvas>` builder: what `view` takes from the caller's `h` and
 * returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CanvasElement<Msg, R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"canvas">,
  HTMLCanvasElement,
  "canvas"
>

/**
 * The options of `view`.
 *
 * **Details**
 *
 * - `width` and `height`: the scene's size, which is the canvas's size on
 *   the page unless CSS sizes it.
 * - `shapes`: the scene, drawn in order.
 * - `pixelRatio`: backing-store pixels per scene unit, `1` by default.
 *   `"auto"` follows the screen, for sharp lines on a high-density
 *   display.
 * - `onPointerDown`, `onPointerMove` and `onPointerUp`: a message, or a
 *   function of the pointer payload with `x` and `y` in scene
 *   coordinates. A drag released outside the canvas still sends its
 *   `onPointerUp`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ViewOptions<Msg> {
  readonly width: number
  readonly height: number
  readonly shapes: ReadonlyArray<Shape>
  readonly pixelRatio?: PixelRatio | undefined
  readonly onPointerDown?: View.Handler<Msg, Html.PointerPayload> | undefined
  readonly onPointerMove?: View.Handler<Msg, Html.PointerPayload> | undefined
  readonly onPointerUp?: View.Handler<Msg, Html.PointerPayload> | undefined
}

const pointerEvents = PointerEvent.literals

/**
 * A `<canvas>` that shows `shapes`. Chain classes, attributes and
 * fallback children on the builder it returns.
 *
 * **Details**
 *
 * It writes `width` and `height` and puts `Paint` on the canvas, which
 * takes the element's one mount. The server writes the canvas and its
 * fallback children, and nothing is drawn until the client mounts it.
 *
 * With a `pixelRatio` other than `1`, the backing store is larger than
 * the scene, and a canvas lays out at its backing store's size. So `view`
 * also writes an inline `width` and `height` at the scene's size. A
 * chained `style` replaces them, such as `.style({ width: "100%" })` for a
 * canvas that follows its container.
 *
 * **Example** (A sharp canvas that follows its container)
 *
 * ```ts
 * import { Canvas, type Html } from "@effect/ui/html"
 *
 * declare const h: Html.Tags<never>
 *
 * const chart = Canvas.view(h, {
 *   width: 600,
 *   height: 300,
 *   pixelRatio: "auto",
 *   shapes: [Canvas.Rect({ x: 0, y: 0, width: 600, height: 300, fill: "#111" })]
 * }).style({ width: "100%" }).children("A chart of sales")
 * ```
 *
 * @stability experimental
 * @category views
 * @since 0.1.0
 */
export const view = <Msg>(
  h: { readonly canvas: CanvasElement<Msg> },
  options: ViewOptions<NoInfer<Msg>>
): CanvasElement<Msg> => {
  const { height, shapes, width } = options
  const pixelRatio = options.pixelRatio ?? 1
  const handlers = {
    pointerdown: options.onPointerDown,
    pointermove: options.onPointerMove,
    pointerup: options.onPointerUp
  }
  const listen = pointerEvents.filter((event) => handlers[event] !== undefined)
  const canvas = h.canvas.attrs({
    width: String(width),
    height: String(height)
  })
  return (pixelRatio === 1
    ? canvas
    : canvas.style({ width: width + "px", height: height + "px" })).onMount(
      Paint({ width, height, shapes, pixelRatio, listen }).pipe(
        Mount.map(({ event, ...payload }) =>
          handle(handlers[event], payload) ?? Component.noop
        )
      )
    )
}
