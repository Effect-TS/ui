/**
 * Places a popup against an anchor element, keeps it inside a boundary, and
 * reports where it ended up.
 *
 * The kit's own popups, such as `Tooltip`, are placed with this module. Use
 * it for a popup the kit doesn't have. The options have the names and
 * defaults of Base UI's positioner props.
 *
 * It has two layers:
 *
 * - `place` is a pure function from rectangles and options to a position.
 *   It reads no DOM, so it runs in any environment and placement can be
 *   tested without a browser's layout.
 * - `TrackPosition` is a stream mount for the positioner, the element that
 *   holds the popup. It measures the anchor, the positioner and the arrow,
 *   calls `place`, writes the result on the positioner as inline style, and
 *   reports a `Placement` whenever the side, the alignment, the anchor's
 *   visibility or the arrow's centring changes.
 *
 * **Building a popup**
 *
 * 1. Spread `PositionerFields` into the component's props.
 * 2. Keep a `Placement` in the Model, with a message that stores each one
 *    the mount reports.
 * 3. Build the mount's args from the props with `trackArgs`.
 * 4. Draw the positioner as a manual popover with `positionerStyle` in its
 *    inline style, and issue `TrackPosition` on it while the popup shows.
 * 5. Write `data-side`, `data-align` and the like from the `Placement`,
 *    and give an arrow `arrowStyle`.
 *
 * The example on `TrackPosition` does all five.
 *
 * **What the mount writes**
 *
 * On the positioner, as inline style:
 *
 * - `left` and `top`: the position
 * - `--anchor-width`, `--anchor-height`: the anchor's size
 * - `--available-width`, `--available-height`: the space between the
 *   anchor and the edge of the boundary, for a `max-height`
 * - `--transform-origin`: the point on the anchor the popup grows from
 * - the arrow's offset, in a variable that `arrowStyle` reads
 * - with `offsetAsPadding`, the side offset as padding on the side that
 *   faces the anchor
 *
 * They survive view-rendered changes to the positioner's `style` attribute,
 * and stay after the mount ends, so a closing popup keeps its place through
 * an exit transition.
 *
 * While it runs, the mount places the popup again when the window resizes,
 * when the positioner changes size, and, unless `disableAnchorTracking` is
 * set, when anything scrolls or the anchor changes size or moves.
 *
 * **Gotchas**
 *
 * - `left` and `top` are measured from the viewport, plus the page's scroll
 *   for `"absolute"`. So the positioner has to be positioned against the
 *   viewport, as a popover or a modal dialog in the top layer is. Inside a
 *   transformed or positioned ancestor it lands in the wrong place.
 * - The positioner has to be laid out while the mount runs, so issue the
 *   mount only while the popup shows.
 * - The anchor is the first element in the document that matches
 *   `anchorSelector`, so build the selector from `h.id` to keep two
 *   instances apart. While nothing matches, the mount reports
 *   `anchorHidden`.
 * - An arrow needs an id, passed as `arrowId`, and a size of its own.
 * - There are no virtual anchors, no placing against one line of an inline
 *   anchor and no function-valued offsets.
 *
 * **Example** (A popup below its anchor, and above it when it doesn't fit)
 *
 * ```ts import.meta.vitest
 * import { Positioning } from "@effect/ui-kit"
 *
 * const viewport = { x: 0, y: 0, width: 1000, height: 800 }
 * const options = Positioning.resolveOptions({ sideOffset: 8 }, { side: "bottom" })
 *
 * const below = Positioning.place({
 *   anchor: { x: 400, y: 400, width: 100, height: 40 },
 *   popup: { width: 200, height: 100 },
 *   arrow: null,
 *   boundary: viewport,
 *   anchorClip: viewport,
 *   rtl: false,
 *   options
 * })
 * if (below.side !== "bottom" || below.x !== 350 || below.y !== 448) throw new Error("not below the anchor")
 *
 * const above = Positioning.place({
 *   anchor: { x: 400, y: 700, width: 100, height: 40 },
 *   popup: { width: 200, height: 100 },
 *   arrow: null,
 *   boundary: viewport,
 *   anchorClip: viewport,
 *   rtl: false,
 *   options
 * })
 * if (above.side !== "top" || above.y !== 592) throw new Error("not flipped above the anchor")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Mount from "@effect/ui/Mount"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

/**
 * The side of the anchor a popup shows on. `"inline-start"` and
 * `"inline-end"` follow the writing direction.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Side = Schema.Literals(["top", "bottom", "left", "right", "inline-start", "inline-end"])

/**
 * The side of the anchor a popup shows on.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Side = typeof Side.Type

/**
 * How a popup lines up with its anchor along the side it shows on.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Align = Schema.Literals(["start", "center", "end"])

/**
 * How a popup lines up with its anchor along the side it shows on.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Align = typeof Align.Type

const Avoidance = Schema.Literals(["flip", "shift", "none"])
const FallbackAxisSide = Schema.Literals(["start", "end", "none"])

/**
 * What a popup does when it doesn't fit inside the boundary.
 *
 * **Details**
 *
 * - `side`: for a popup that reaches past the boundary away from the
 *   anchor. `"flip"` moves it to the opposite side, `"shift"` keeps the side
 *   and slides the popup over the anchor, and `"none"` leaves it. `"flip"`
 *   by default.
 * - `align`: for a popup that reaches past the boundary along the anchor's
 *   edge. `"flip"` tries the other alignment and then slides the popup
 *   along the edge, `"shift"` only slides it, and `"none"` leaves it.
 *   `"flip"` by default.
 * - `fallbackAxisSide`: the side on the other axis to try when neither side
 *   fits, or `"none"` to stay on the requested axis. `"end"` by default.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CollisionAvoidance = Schema.Struct({
  side: Schema.optional(Avoidance),
  align: Schema.optional(Avoidance),
  fallbackAxisSide: Schema.optional(FallbackAxisSide)
})

/**
 * What a popup does when it doesn't fit inside the boundary.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CollisionAvoidance = typeof CollisionAvoidance.Type

/**
 * A rectangle in viewport coordinates, in pixels.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Rect = Schema.Struct({ x: Schema.Number, y: Schema.Number, width: Schema.Number, height: Schema.Number })

/**
 * A rectangle in viewport coordinates, in pixels.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Rect = typeof Rect.Type

/**
 * The area a popup keeps inside: `"clipping-ancestors"`, which is the
 * viewport, an element named by `{ id }`, or a rectangle in viewport
 * coordinates. An element or a rectangle is cut to the viewport.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CollisionBoundary = Schema.Union([
  Schema.Literal("clipping-ancestors"),
  Schema.Struct({ id: Schema.String }),
  Rect
])

/**
 * The area a popup keeps inside.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CollisionBoundary = typeof CollisionBoundary.Type

/**
 * The pixels a popup keeps from the boundary's edges: one number for every
 * edge, or one per edge, where an edge left out is 0.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CollisionPadding = Schema.Union([
  Schema.Number,
  Schema.Struct({
    top: Schema.optional(Schema.Number),
    right: Schema.optional(Schema.Number),
    bottom: Schema.optional(Schema.Number),
    left: Schema.optional(Schema.Number)
  })
])

/**
 * The pixels a popup keeps from the boundary's edges.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CollisionPadding = typeof CollisionPadding.Type

/**
 * The CSS `position` of the positioner. `"fixed"` doesn't make the page
 * taller when the popup reaches past its end.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PositionMethod = Schema.Literals(["absolute", "fixed"])

/**
 * The CSS `position` of the positioner.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PositionMethod = typeof PositionMethod.Type

/**
 * The positioning options a popup takes as props, to spread into its props
 * Schema: `Schema.Struct({ open: Schema.Boolean, ...PositionerFields })`.
 * Every one is optional.
 *
 * **Details**
 *
 * - `side`: the side of the anchor the popup shows on. The component picks
 *   the default.
 * - `align`: how the popup lines up with the anchor along that side,
 *   `"center"` by default.
 * - `sideOffset`: the gap between the anchor and the popup, in pixels.
 * - `alignOffset`: pixels the popup moves along the side, toward the
 *   anchor's other end when aligned to the start or the end, and right or
 *   down when centred.
 * - `collisionAvoidance`: what happens when the popup doesn't fit. It
 *   replaces the component's default as a whole.
 * - `collisionBoundary`: the area the popup keeps inside, the viewport by
 *   default.
 * - `collisionPadding`: pixels kept from the boundary's edges, 5 by default.
 * - `sticky`: the popup stays in view when the anchor scrolls out of it.
 * - `arrowPadding`: pixels kept between the arrow and the popup's corners,
 *   5 by default.
 * - `positionMethod`: `"absolute"` by default.
 * - `disableAnchorTracking`: the popup is placed only when it opens, when
 *   the window resizes and when its own size changes, not when the page
 *   scrolls or the anchor moves or changes size.
 * - `anchor`: the id of an element to place the popup against instead of
 *   the component's own anchor.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PositionerFields = {
  side: Schema.optional(Side),
  align: Schema.optional(Align),
  sideOffset: Schema.optional(Schema.Number),
  alignOffset: Schema.optional(Schema.Number),
  collisionAvoidance: Schema.optional(CollisionAvoidance),
  collisionBoundary: Schema.optional(CollisionBoundary),
  collisionPadding: Schema.optional(CollisionPadding),
  sticky: Schema.optional(Schema.Boolean),
  arrowPadding: Schema.optional(Schema.Number),
  positionMethod: Schema.optional(PositionMethod),
  disableAnchorTracking: Schema.optional(Schema.Boolean),
  anchor: Schema.optional(Schema.String)
}

/**
 * The positioning options a popup takes as props: the type of
 * `PositionerFields`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PositionerOptions = Schema.Struct.Type<typeof PositionerFields>

/**
 * The default `collisionAvoidance` of a dropdown, such as a select or a menu:
 * it never moves to the other axis.
 *
 * @stability experimental
 * @category constants
 * @since 0.1.0
 */
export const dropdownCollisionAvoidance: CollisionAvoidance = { fallbackAxisSide: "none" }

/**
 * The default `collisionAvoidance` of other popups, such as a tooltip or a
 * popover: when neither side fits, it tries the other axis.
 *
 * @stability experimental
 * @category constants
 * @since 0.1.0
 */
export const popupCollisionAvoidance: CollisionAvoidance = { fallbackAxisSide: "end" }

/**
 * A width and a height, in pixels.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Size {
  readonly width: number
  readonly height: number
}

type Physical = "top" | "right" | "bottom" | "left"
type Axis = "x" | "y"
type FloatingPlacement = Physical | `${Physical}-start` | `${Physical}-end`

/**
 * The options `place` takes, with every default filled in. `resolveOptions`
 * makes one from a component's props.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PlaceOptions = Schema.Struct({
  side: Side,
  align: Align,
  sideOffset: Schema.Number,
  alignOffset: Schema.Number,
  collisionAvoidance: Schema.Struct({ side: Avoidance, align: Avoidance, fallbackAxisSide: FallbackAxisSide }),
  collisionPadding: Schema.Struct({
    top: Schema.Number,
    right: Schema.Number,
    bottom: Schema.Number,
    left: Schema.Number
  }),
  sticky: Schema.Boolean,
  arrowPadding: Schema.Number
})

/**
 * The options `place` takes, with every default filled in.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PlaceOptions = typeof PlaceOptions.Type
type Sides = PlaceOptions["collisionPadding"]

/**
 * Fills in the defaults of a popup's positioning props.
 *
 * **Details**
 *
 * `defaults` holds what differs between components: the `side` a popup shows
 * on when its props name none, and its `collisionAvoidance`, which is
 * `popupCollisionAvoidance` when left out.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const resolveOptions = (
  options: PositionerOptions,
  defaults: { readonly side: Side; readonly collisionAvoidance?: CollisionAvoidance | undefined }
): PlaceOptions => {
  const avoidance = options.collisionAvoidance ?? defaults.collisionAvoidance ?? popupCollisionAvoidance
  const padding = options.collisionPadding ?? 5
  return {
    side: options.side ?? defaults.side,
    align: options.align ?? "center",
    sideOffset: options.sideOffset ?? 0,
    alignOffset: options.alignOffset ?? 0,
    collisionAvoidance: {
      side: avoidance.side ?? "flip",
      align: avoidance.align ?? "flip",
      fallbackAxisSide: avoidance.fallbackAxisSide ?? "end"
    },
    collisionPadding: typeof padding === "number"
      ? { top: padding, right: padding, bottom: padding, left: padding }
      : { top: padding.top ?? 0, right: padding.right ?? 0, bottom: padding.bottom ?? 0, left: padding.left ?? 0 },
    sticky: options.sticky ?? false,
    arrowPadding: options.arrowPadding ?? 5
  }
}

/**
 * What `place` measures a popup from. Every rectangle is in the same
 * coordinates, which the result's `x` and `y` are in too.
 *
 * **Details**
 *
 * - `anchor`: the element the popup is placed against.
 * - `popup`: the popup's size.
 * - `arrow`: the arrow's size, or `null` without one.
 * - `boundary`: the area the popup keeps inside.
 * - `anchorClip`: the part of the page the anchor can be seen through, which
 *   decides `anchorHidden`. The viewport, cut by each ancestor that clips
 *   the anchor.
 * - `rtl`: whether the writing direction is right to left.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PlaceInput {
  readonly anchor: Rect
  readonly popup: Size
  readonly arrow: Size | null
  readonly boundary: Rect
  readonly anchorClip: Rect
  readonly rtl: boolean
  readonly options: PlaceOptions
}

/**
 * Where `place` puts a popup.
 *
 * **Details**
 *
 * - `x`, `y`: the popup's top left corner.
 * - `side`, `align`: where the popup ended up, which differs from the
 *   options after a flip. A logical side stays logical.
 * - `availableWidth`, `availableHeight`: the space between the anchor and
 *   the boundary's edge on that side.
 * - `anchorHidden`: the anchor is outside `anchorClip`, or has no size and
 *   no position.
 * - `arrow`: `null` without an arrow. Otherwise its offset from the popup's
 *   left edge as `x` or from its top edge as `y`, the other being `null`,
 *   and `uncentered` when it can't point at the anchor's middle.
 * - `transformOrigin`: a CSS `transform-origin` at the point on the anchor
 *   the popup grows from.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PlaceResult {
  readonly x: number
  readonly y: number
  readonly side: Side
  readonly align: Align
  readonly availableWidth: number
  readonly availableHeight: number
  readonly anchorHidden: boolean
  readonly arrow: { readonly x: number | null; readonly y: number | null; readonly uncentered: boolean } | null
  readonly transformOrigin: string
}

const opposite: Record<Physical, Physical> = { top: "bottom", bottom: "top", left: "right", right: "left" }
const isBefore = (side: Physical): boolean => side === "top" || side === "left"
const sideOf = (placement: FloatingPlacement): Physical => placement.split("-")[0] as Physical
const alignmentOf = (placement: FloatingPlacement): "start" | "end" | undefined =>
  placement.split("-")[1] as "start" | "end" | undefined
const sideAxisOf = (placement: FloatingPlacement): Axis => placement[0] === "t" || placement[0] === "b" ? "y" : "x"
const otherAxis = (axis: Axis): Axis => axis === "x" ? "y" : "x"
const lengthOf = (axis: Axis): "width" | "height" => axis === "y" ? "height" : "width"
const clamp = (start: number, value: number, end: number): number => Math.max(start, Math.min(value, end))
const oppositePlacement = (placement: FloatingPlacement): FloatingPlacement => {
  const side = sideOf(placement)
  return (opposite[side] + placement.slice(side.length)) as FloatingPlacement
}
const oppositeAlignment = (placement: FloatingPlacement): FloatingPlacement =>
  (placement.includes("start")
    ? placement.replace("start", "end")
    : placement.replace("end", "start")) as FloatingPlacement

const alignmentSides = (
  placement: FloatingPlacement,
  anchor: Size,
  popup: Size,
  rtl: boolean
): readonly [Physical, Physical] => {
  const alignment = alignmentOf(placement)
  const axis = otherAxis(sideAxisOf(placement))
  const length = lengthOf(axis)
  let main: Physical = axis === "x"
    ? alignment === (rtl ? "end" : "start") ? "right" : "left"
    : alignment === "start"
    ? "bottom"
    : "top"
  if (anchor[length] > popup[length]) main = opposite[main]
  return [main, opposite[main]]
}

const oppositeAxisPlacements = (
  placement: FloatingPlacement,
  direction: "start" | "end",
  rtl: boolean
): Array<FloatingPlacement> => {
  const alignment = alignmentOf(placement)
  const isStart = direction === "start"
  let list: Array<FloatingPlacement> = sideAxisOf(placement) === "y"
    ? isStart !== rtl ? ["left", "right"] : ["right", "left"]
    : isStart
    ? ["top", "bottom"]
    : ["bottom", "top"]
  if (alignment !== undefined) {
    list = list.map((side) => `${side}-${alignment}` as FloatingPlacement)
    list = list.concat(list.map(oppositeAlignment))
  }
  return list
}

const coordsFor = (anchor: Rect, popup: Size, placement: FloatingPlacement, rtl: boolean) => {
  const sideAxis = sideAxisOf(placement)
  const alignAxis = otherAxis(sideAxis)
  const sideLength = lengthOf(sideAxis)
  const alignLength = lengthOf(alignAxis)
  const side = sideOf(placement)
  const alignment = alignmentOf(placement)
  const common = anchor[alignLength] / 2 - popup[alignLength] / 2
  const coords = { x: 0, y: 0 }
  coords[sideAxis] = isBefore(side)
    ? anchor[sideAxis] - popup[sideLength]
    : anchor[sideAxis] + anchor[sideLength]
  coords[alignAxis] = anchor[alignAxis] + common +
    (alignment === undefined ? 0 : common * (alignment === "end" ? 1 : -1) * (rtl && sideAxis === "y" ? -1 : 1))
  return coords
}

const overflowOf = (rect: Rect, clip: Rect, padding: Sides): Sides => ({
  top: clip.y - rect.y + padding.top,
  bottom: rect.y + rect.height - (clip.y + clip.height) + padding.bottom,
  left: clip.x - rect.x + padding.left,
  right: rect.x + rect.width - (clip.x + clip.width) + padding.right
})

interface Data {
  offset?: { x: number; y: number; placement: FloatingPlacement }
  flip?: {
    index?: number
    overflows?: ReadonlyArray<{ placement: FloatingPlacement; overflows: ReadonlyArray<number> }>
  }
  shift?: { x: number; y: number; enabled: { x: boolean; y: boolean } }
  arrow?: { x?: number; y?: number; centerOffset: number; alignmentOffset?: number }
}

interface State {
  readonly x: number
  readonly y: number
  readonly placement: FloatingPlacement
  readonly data: Data
}

interface Step {
  readonly x?: number
  readonly y?: number
  readonly data?: object
  readonly reset?: boolean | { readonly placement: FloatingPlacement }
}

interface Middleware {
  readonly name: keyof Data
  readonly fn: (state: State) => Step
}

const physicalSide = (side: Side, rtl: boolean): Physical =>
  side === "inline-start" ? (rtl ? "right" : "left") : side === "inline-end" ? (rtl ? "left" : "right") : side

const logicalSide = (requested: Side, rendered: Physical, rtl: boolean): Side => {
  if (requested !== "inline-start" && requested !== "inline-end") return rendered
  if (rendered === "right") return rtl ? "inline-start" : "inline-end"
  if (rendered === "left") return rtl ? "inline-end" : "inline-start"
  return rendered
}

const requestedSideBiasPx = 1

/**
 * Places a popup against an anchor: on the requested side, lined up as asked,
 * then flipped and shifted as `collisionAvoidance` allows to stay inside the
 * boundary.
 *
 * **Details**
 *
 * It reads no DOM and has no state, so the same input gives the same result.
 *
 * @stability experimental
 * @category placing
 * @since 0.1.0
 */
export const place = (input: PlaceInput): PlaceResult => {
  const { anchor, arrow, boundary, anchorClip, options, popup, rtl } = input
  const padding = options.collisionPadding
  const { side: avoidSide, align: avoidAlign, fallbackAxisSide } = options.collisionAvoidance
  const physical = physicalSide(options.side, rtl)
  const initialPlacement: FloatingPlacement = options.align === "center" ? physical : `${physical}-${options.align}`
  const overflowAt = (at: { readonly x: number; readonly y: number }, within: Sides): Sides =>
    overflowOf({ x: at.x, y: at.y, width: popup.width, height: popup.height }, boundary, within)

  const shiftDisabled = avoidAlign === "none" && avoidSide !== "shift"
  const crossAxisShift = !shiftDisabled && (options.sticky || avoidSide === "shift")

  const offset: Middleware = {
    name: "offset",
    fn: ({ data, placement, x, y }) => {
      if (placement === data.offset?.placement && data.arrow?.alignmentOffset) return {}
      const side = sideOf(placement)
      const alignment = alignmentOf(placement)
      const vertical = sideAxisOf(placement) === "y"
      const main = options.sideOffset * (isBefore(side) ? -1 : 1)
      const crossMulti = rtl && vertical ? -1 : 1
      const cross = alignment === "end" ? -options.alignOffset : options.alignOffset
      const diff = vertical ? { x: cross * crossMulti, y: main } : { x: main, y: cross * crossMulti }
      return { x: x + diff.x, y: y + diff.y, data: { ...diff, placement } }
    }
  }

  const biased = (side: Physical): number =>
    padding[side] + requestedSideBiasPx + (options.side === opposite[side] ? requestedSideBiasPx : 0)
  const flipPadding: Sides = {
    top: biased("top"),
    right: biased("right"),
    bottom: biased("bottom"),
    left: biased("left")
  }
  const flipMainAxis = avoidSide === "flip"
  const flipCrossAxis = avoidAlign === "flip"
  const initialSideAxis = sideAxisOf(initialPlacement)
  const placements: Array<FloatingPlacement> = [
    initialPlacement,
    ...(options.align === "center"
      ? [oppositePlacement(initialPlacement)]
      : [
        oppositeAlignment(initialPlacement),
        oppositePlacement(initialPlacement),
        oppositeAlignment(oppositePlacement(initialPlacement))
      ]),
    ...(fallbackAxisSide === "none" ? [] : oppositeAxisPlacements(initialPlacement, fallbackAxisSide, rtl))
  ]

  const flip: Middleware = {
    name: "flip",
    fn: (state) => {
      const { data, placement } = state
      if (data.arrow?.alignmentOffset) return {}
      const overflow = overflowAt(state, flipPadding)
      const overflows: Array<number> = []
      if (flipMainAxis) overflows.push(overflow[sideOf(placement)])
      if (flipCrossAxis) {
        const [a, b] = alignmentSides(placement, anchor, popup, rtl)
        overflows.push(overflow[a], overflow[b])
      }
      if (overflows.every((value) => value <= 0)) return {}
      const history = [...(data.flip?.overflows ?? []), { placement, overflows }]
      const nextIndex = (data.flip?.index ?? 0) + 1
      const next = placements[nextIndex]
      if (next !== undefined) {
        const ignoreCross = flipCrossAxis && initialSideAxis !== sideAxisOf(next)
        if (
          !ignoreCross ||
          history.every((entry) => sideAxisOf(entry.placement) === initialSideAxis ? entry.overflows[0]! > 0 : true)
        ) {
          return { data: { index: nextIndex, overflows: history }, reset: { placement: next } }
        }
      }
      let reset = history.filter((entry) => entry.overflows[0]! <= 0)
        .sort((a, b) => a.overflows[1]! - b.overflows[1]!)[0]?.placement
      if (reset === undefined) {
        reset = history
          .filter((entry) =>
            fallbackAxisSide === "none" || sideAxisOf(entry.placement) === initialSideAxis ||
            sideAxisOf(entry.placement) === "y"
          )
          .map((entry) =>
            [entry.placement, entry.overflows.reduce((sum, value) => sum + Math.max(value, 0), 0)] as const
          )
          .sort((a, b) => a[1] - b[1])[0]?.[0]
      }
      return reset !== undefined && placement !== reset ? { reset: { placement: reset } } : {}
    }
  }

  const limit = (axis: Axis): number =>
    arrow === null ? 0 : axis === "x"
      ? arrow.width / 2 + (padding.left + padding.right) / 2
      : arrow.height / 2 + (padding.top + padding.bottom) / 2
  const shift: Middleware = {
    name: "shift",
    fn: (state) => {
      const { placement, x, y } = state
      const overflow = overflowAt(state, padding)
      const crossAxis = sideAxisOf(placement)
      const mainAxis = otherAxis(crossAxis)
      const coords = { x, y }
      const clampAxis = (axis: Axis, coord: number) =>
        clamp(
          coord + overflow[axis === "y" ? "top" : "left"],
          coord,
          coord - overflow[axis === "y" ? "bottom" : "right"]
        )
      const checkMain = avoidAlign !== "none"
      if (checkMain) coords[mainAxis] = clampAxis(mainAxis, coords[mainAxis])
      if (crossAxisShift) coords[crossAxis] = clampAxis(crossAxis, coords[crossAxis])
      if (!options.sticky) {
        const mainLength = lengthOf(mainAxis)
        const mainMin = anchor[mainAxis] - popup[mainLength] + limit(mainAxis)
        const mainMax = anchor[mainAxis] + anchor[mainLength] - limit(mainAxis)
        if (coords[mainAxis] < mainMin) coords[mainAxis] = mainMin
        else if (coords[mainAxis] > mainMax) coords[mainAxis] = mainMax
        const crossLength = lengthOf(crossAxis)
        const originSide = isBefore(sideOf(placement))
        const offsetData = state.data.offset?.[crossAxis] ?? 0
        const crossMin = anchor[crossAxis] - popup[crossLength] + (originSide ? offsetData : 0)
        const crossMax = anchor[crossAxis] + anchor[crossLength] + (originSide ? 0 : offsetData)
        if (coords[crossAxis] < crossMin) coords[crossAxis] = crossMin
        else if (coords[crossAxis] > crossMax) coords[crossAxis] = crossMax
      }
      const enabled = { x: false, y: false }
      enabled[mainAxis] = checkMain
      enabled[crossAxis] = crossAxisShift
      return { ...coords, data: { x: coords.x - x, y: coords.y - y, enabled } }
    }
  }

  const arrowSize = arrow ?? { width: 0, height: 0 }
  const arrowPadding = arrow === null ? 0 : options.arrowPadding
  const arrowStep: Middleware = {
    name: "arrow",
    fn: ({ data, placement, x, y }) => {
      const coords = { x, y }
      const axis = otherAxis(sideAxisOf(placement))
      const length = lengthOf(axis)
      const endDiff = anchor[length] + anchor[axis] - coords[axis] - popup[length]
      const startDiff = coords[axis] - anchor[axis]
      const centerToReference = endDiff / 2 - startDiff / 2
      const min = Math.min(arrowPadding, popup[length] / 2 - arrowSize[length] / 2 - 1)
      const max = popup[length] - arrowSize[length] - min
      const center = popup[length] / 2 - arrowSize[length] / 2 + centerToReference
      const at = clamp(min, center, max)
      const addOffset = data.arrow === undefined && alignmentOf(placement) !== undefined && center !== at &&
        anchor[length] / 2 - min - arrowSize[length] / 2 < 0
      const alignmentOffset = addOffset ? (center < min ? center - min : center - max) : 0
      coords[axis] += alignmentOffset
      return {
        ...coords,
        data: {
          [axis]: at,
          centerOffset: center - at - alignmentOffset,
          ...(addOffset ? { alignmentOffset } : {})
        },
        reset: addOffset
      }
    }
  }

  const middleware: Array<Middleware> = [offset]
  const flipStep = avoidSide === "none" ? [] : [flip]
  const shiftStep = shiftDisabled ? [] : [shift]
  if (avoidSide === "shift" || avoidAlign === "shift" || options.align === "center") {
    middleware.push(...shiftStep, ...flipStep)
  } else {
    middleware.push(...flipStep, ...shiftStep)
  }
  middleware.push(arrowStep)

  let { x, y } = coordsFor(anchor, popup, initialPlacement, rtl)
  let placement = initialPlacement
  let resets = 0
  const steps: Record<string, object> = {}
  for (let i = 0; i < middleware.length; i++) {
    const { fn, name } = middleware[i]!
    const step = fn({ x, y, placement, data: steps as Data })
    x = step.x ?? x
    y = step.y ?? y
    steps[name] = { ...steps[name], ...step.data }
    if (step.reset !== undefined && step.reset !== false && resets < 50) {
      resets++
      if (typeof step.reset === "object") {
        placement = step.reset.placement
        const coords = coordsFor(anchor, popup, placement, rtl)
        x = coords.x
        y = coords.y
      }
      i = -1
    }
  }

  const { arrow: arrowData, shift: shifted } = steps as Data
  const side = sideOf(placement)
  const alignment = alignmentOf(placement)
  const vertical = sideAxisOf(placement) === "y"

  const overflow = overflowAt({ x, y }, padding)
  const clipHeight = popup.height - overflow.top - overflow.bottom
  const clipWidth = popup.width - overflow.left - overflow.right
  const heightSide: Physical = vertical ? side : alignment === "end" ? "top" : "bottom"
  const widthSide: Physical = vertical ? alignment === (rtl ? "start" : "end") ? "left" : "right" : side
  let availableHeight = Math.min(popup.height - overflow[heightSide], clipHeight)
  let availableWidth = Math.min(popup.width - overflow[widthSide], clipWidth)
  if (shifted?.enabled.x) availableWidth = clipWidth
  if (shifted?.enabled.y) availableHeight = clipHeight
  if (shifted === undefined && alignment === undefined) {
    if (vertical) availableWidth = popup.width - 2 * Math.max(overflow.left, overflow.right)
    else availableHeight = popup.height - 2 * Math.max(overflow.top, overflow.bottom)
  }

  let crossOrigin: string
  if (arrow === null && alignment !== undefined && Math.abs((vertical ? shifted?.x : shifted?.y) ?? 0) <= 1) {
    crossOrigin = (alignment === "start") === (vertical && rtl) ? "100%" : "0%"
  } else {
    const at = (vertical ? arrowData?.x : arrowData?.y) ?? 0
    crossOrigin = `${at + (vertical ? arrowSize.width : arrowSize.height) / 2}px`
  }
  let sideOrigin = isBefore(side) ? `calc(100% + ${options.sideOffset}px)` : `${-options.sideOffset}px`
  if (crossAxisShift && vertical && Math.abs(shifted?.y ?? 0) > options.sideOffset) {
    sideOrigin = `${anchor.y + anchor.height / 2 - y}px`
  }

  const anchorOverflow = overflowOf(anchor, anchorClip, { top: 0, right: 0, bottom: 0, left: 0 })
  const anchorEmpty = anchor.width === 0 && anchor.height === 0 && anchor.x === 0 && anchor.y === 0
  const anchorClipped = anchorOverflow.top - anchor.height >= 0 || anchorOverflow.right - anchor.width >= 0 ||
    anchorOverflow.bottom - anchor.height >= 0 || anchorOverflow.left - anchor.width >= 0

  return {
    x,
    y,
    side: logicalSide(options.side, side, rtl),
    align: alignment ?? "center",
    availableWidth,
    availableHeight,
    anchorHidden: anchorClipped || anchorEmpty,
    arrow: arrow === null || arrowData === undefined ? null : {
      x: arrowData.x ?? null,
      y: arrowData.y ?? null,
      uncentered: arrowData.centerOffset !== 0
    },
    transformOrigin: vertical ? `${crossOrigin} ${sideOrigin}` : `${sideOrigin} ${crossOrigin}`
  }
}

/**
 * What `TrackPosition` reports: the facts about a popup's position that its
 * parts render as attributes. A component keeps the latest in its Model.
 *
 * **Details**
 *
 * - `side`, `align`: where the popup is, for `data-side` and `data-align`.
 * - `anchorHidden`: the anchor is scrolled or clipped out of view, for
 *   `data-anchor-hidden`.
 * - `arrowUncentered`: the arrow can't point at the anchor's middle, for
 *   `data-uncentered`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Placement = Schema.Struct({
  side: Side,
  align: Align,
  anchorHidden: Schema.Boolean,
  arrowUncentered: Schema.Boolean
})

/**
 * What `TrackPosition` reports about a popup's position.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Placement = typeof Placement.Type

/**
 * The args of `TrackPosition`. `trackArgs` makes them from a component's
 * props.
 *
 * **Details**
 *
 * - `options`: what `place` takes.
 * - `positionMethod`: the positioner's CSS `position`, which decides
 *   whether the page's scroll is added to `left` and `top`.
 * - `collisionBoundary`: the area the popup keeps inside.
 * - `disableAnchorTracking`: don't follow scrolling or the anchor.
 * - `anchorSelector`: a CSS selector for the anchor.
 * - `arrowId`: the id of the arrow, or `null` without one.
 * - `offsetAsPadding`: write `sideOffset` as padding on the positioner's
 *   side facing the anchor, and move the positioner up against the anchor.
 *   The gap is then part of the positioner, so a pointer can cross it
 *   without leaving the popup.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const TrackPositionArgs = Schema.Struct({
  options: PlaceOptions,
  positionMethod: PositionMethod,
  collisionBoundary: CollisionBoundary,
  disableAnchorTracking: Schema.Boolean,
  anchorSelector: Schema.String,
  arrowId: Schema.NullOr(Schema.String),
  offsetAsPadding: Schema.Boolean
})

/**
 * The args of `TrackPosition`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type TrackPositionArgs = typeof TrackPositionArgs.Type

const arrowX = "--ui-kit-arrow-x"
const arrowY = "--ui-kit-arrow-y"

const idSelector = (id: string): string => `[id="${id.replace(/["\\]/g, "\\$&")}"]`

/**
 * Makes the args of `TrackPosition` from a popup's positioning props.
 *
 * **Details**
 *
 * `popup` holds what the component decides:
 *
 * - `side`: the side the popup shows on when its props name none.
 * - `collisionAvoidance`: its default, `popupCollisionAvoidance` when left
 *   out.
 * - `anchorSelector`: a CSS selector for its anchor, which the `anchor` prop
 *   overrides.
 * - `arrowId`: the id of its arrow, when it draws one.
 * - `offsetAsPadding`: see `TrackPositionArgs`. False when left out.
 *
 * The result is plain data, so a view can also read the defaults from it:
 * `args.options.side` is the side to render before the mount first reports.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const trackArgs = (
  props: PositionerOptions,
  popup: {
    readonly side: Side
    readonly collisionAvoidance?: CollisionAvoidance | undefined
    readonly anchorSelector: string
    readonly arrowId?: string | null | undefined
    readonly offsetAsPadding?: boolean | undefined
  }
): TrackPositionArgs => ({
  options: resolveOptions(props, popup),
  positionMethod: props.positionMethod ?? "absolute",
  collisionBoundary: props.collisionBoundary ?? "clipping-ancestors",
  disableAnchorTracking: props.disableAnchorTracking === true,
  anchorSelector: props.anchor === undefined ? popup.anchorSelector : idSelector(props.anchor),
  arrowId: popup.arrowId ?? null,
  offsetAsPadding: popup.offsetAsPadding === true
})

/**
 * The inline style a positioner needs before `TrackPosition` places it: its
 * `position`, resets of the `inset` and `margin` a browser gives a popover,
 * and `--available-width` and `--available-height` at the viewport's size
 * until the mount measures them.
 *
 * **Details**
 *
 * A headless component puts it after the inline style its consumer gave the
 * positioner, so these declarations win.
 *
 * @stability experimental
 * @category styles
 * @since 0.1.0
 */
export const positionerStyle = (positionMethod: PositionMethod): string =>
  `position:${positionMethod};inset:auto;margin:0;--available-width:100vw;--available-height:100vh`

/**
 * The inline style that puts an arrow where `TrackPosition` measured it:
 * `position: absolute` and a `left` or a `top`, by the side the popup is on.
 * The arrow has to be inside the positioner, and its offset across the
 * popup's edge is left to the consumer's CSS.
 *
 * @stability experimental
 * @category styles
 * @since 0.1.0
 */
export const arrowStyle = (side: Side): string =>
  side === "top" || side === "bottom"
    ? `position:absolute;left:var(${arrowX})`
    : `position:absolute;top:var(${arrowY})`

const zero: Rect = { x: 0, y: 0, width: 0, height: 0 }

const intersect = (a: Rect, b: Rect): Rect => {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y)
  }
}

const clientRect = (element: Element): Rect => {
  const { height, left, top, width } = element.getBoundingClientRect()
  return { x: left, y: top, width, height }
}

const scaleOf = (element: Element, rect: DOMRect): { readonly x: number; readonly y: number } => {
  const html = element as HTMLElement
  const x = html.offsetWidth ? rect.width / html.offsetWidth : 1
  const y = html.offsetHeight ? rect.height / html.offsetHeight : 1
  return { x: x || 1, y: y || 1 }
}

const innerRect = (element: Element): Rect => {
  const rect = element.getBoundingClientRect()
  const scale = scaleOf(element, rect)
  return {
    x: rect.left + element.clientLeft * scale.x,
    y: rect.top + element.clientTop * scale.y,
    width: element.clientWidth * scale.x,
    height: element.clientHeight * scale.y
  }
}

const clipping = /auto|scroll|hidden|clip/
const painting = /paint|strict|content/
const containing = /paint|layout|strict|content/
const fixedProperties = [
  "transform",
  "translate",
  "scale",
  "rotate",
  "perspective",
  "filter",
  "backdrop-filter",
  "offset-path"
]
const fixedChanges = new Set([...fixedProperties, "offset", "offset-position", "contain", "transform-style"])

const set = (value: string | undefined, none = "none"): boolean => value !== undefined && value !== "" && value !== none

const paintContained = (style: CSSStyleDeclaration): boolean =>
  painting.test(style.contain) || set(style.contentVisibility, "visible")

const containsFixed = (style: CSSStyleDeclaration): boolean =>
  fixedProperties.some((name) => set(style.getPropertyValue(name))) ||
  style.transformStyle === "preserve-3d" ||
  style.willChange.toLowerCase().split(",").some((name) => fixedChanges.has(name.trim())) ||
  containing.test(style.contain) || paintContained(style)

const contains = (style: CSSStyleDeclaration, position: string): boolean =>
  position === "fixed"
    ? containsFixed(style)
    : position === "absolute"
    ? set(style.position, "static") || containsFixed(style)
    : true

const inTopLayer = (element: Element): boolean =>
  [":popover-open", ":modal"].some((selector) => {
    try {
      return element.matches(selector)
    } catch {
      return false
    }
  })

const clipOf = (element: Element, viewport: Rect): Rect => {
  const view = element.ownerDocument.defaultView!
  const root = element.ownerDocument.documentElement
  let clip = viewport
  let position = view.getComputedStyle(element).position
  for (
    let current = inTopLayer(element) ? null : element.parentElement;
    current !== null && current !== root && current !== element.ownerDocument.body;
    current = current.parentElement
  ) {
    const style = view.getComputedStyle(current)
    if (contains(style, position)) {
      if (clipping.test(style.overflow + style.overflowX + style.overflowY) || paintContained(style)) {
        clip = intersect(clip, innerRect(current))
      }
      position = style.position
    }
    if (inTopLayer(current)) break
  }
  return clip
}

const sameRect = (a: DOMRect, b: DOMRect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

const observeMove = (element: Element, onMove: () => void): () => void => {
  const view = element.ownerDocument.defaultView
  if (view === null || typeof view.IntersectionObserver !== "function") return () => {}
  const root = element.ownerDocument.documentElement
  let observer: IntersectionObserver | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const cleanup = () => {
    clearTimeout(timer)
    observer?.disconnect()
    observer = null
  }
  const refresh = (skip: boolean, threshold = 1): void => {
    cleanup()
    const before = element.getBoundingClientRect()
    if (!skip) onMove()
    if (!before.width || !before.height) return
    const rootMargin = [
      -Math.floor(before.top),
      -Math.floor(root.clientWidth - (before.left + before.width)),
      -Math.floor(root.clientHeight - (before.top + before.height)),
      -Math.floor(before.left)
    ].map((inset) => inset + "px").join(" ")
    let first = true
    const onIntersect = (entries: Array<IntersectionObserverEntry>) => {
      const ratio = entries[0]!.intersectionRatio
      if (!sameRect(before, element.getBoundingClientRect())) return refresh(false)
      if (ratio !== threshold) {
        if (!first) return refresh(false)
        // Clipped in place: retry slowly so it doesn't loop.
        if (ratio === 0) timer = setTimeout(() => refresh(false, 1e-7), 1000)
        else refresh(false, ratio)
      }
      first = false
    }
    const init = { rootMargin, threshold: clamp(0, threshold, 1) || 1 }
    try {
      observer = new view.IntersectionObserver(onIntersect, { ...init, root: element.ownerDocument })
    } catch {
      observer = new view.IntersectionObserver(onIntersect, init)
    }
    observer.observe(element)
  }
  const onResize = () => refresh(true)
  view.addEventListener("resize", onResize)
  refresh(true)
  return () => {
    view.removeEventListener("resize", onResize)
    cleanup()
  }
}

const written = new WeakMap<HTMLElement, Map<string, string>>()

const sameReport = Schema.toEquivalence(Placement)
const sameArgs = Schema.toEquivalence(TrackPositionArgs)

/**
 * The body of `TrackPosition`: the Stream of a positioner's `Placement`s,
 * which places the positioner as it runs.
 *
 * **Details**
 *
 * An element takes one mount. To do more on the positioner than place it,
 * pass `Mount.makeStream` a body that merges this Stream with its own. The
 * arguments are the ones a body gets: the node, the args and the Stream of
 * later args.
 *
 * @stability experimental
 * @category mounts
 * @since 0.1.0
 */
export const trackPosition = (
  node: HTMLElement,
  args: TrackPositionArgs,
  changes: Stream.Stream<TrackPositionArgs>
): Stream.Stream<Placement> =>
  Stream.callback<Placement>((queue) => {
    const document = node.ownerDocument
    const view = document.defaultView!
    let current = args
    let reported: Placement | null = null
    let owned = written.get(node) ?? new Map<string, string>()

    const viewportOf = (): Rect => ({
      x: 0,
      y: 0,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight
    })

    const boundaryOf = (viewport: Rect): Rect => {
      const boundary = current.collisionBoundary
      if (boundary === "clipping-ancestors") return viewport
      if ("id" in boundary) {
        const element = document.getElementById(boundary.id)
        return element === null ? viewport : intersect(innerRect(element), viewport)
      }
      return intersect(boundary, viewport)
    }

    const bridged = (side: Physical): number => {
      const value = owned.get("padding-" + side)
      return value !== undefined ? parseFloat(value) : 0
    }

    const popupSize = (): Size => ({
      width: Math.max(0, node.offsetWidth - bridged("left") - bridged("right")),
      height: Math.max(0, node.offsetHeight - bridged("top") - bridged("bottom"))
    })

    const pass = (popup: Size): void => {
      const anchor = document.querySelector(current.anchorSelector)
      const arrow = current.arrowId === null ? null : document.getElementById(current.arrowId)
      const viewport = viewportOf()
      const anchorRect = anchor === null ? zero : clientRect(anchor)
      const rtl = view.getComputedStyle(node).direction === "rtl"
      const placed = place({
        anchor: anchorRect,
        popup,
        arrow: arrow === null ? null : { width: arrow.offsetWidth, height: arrow.offsetHeight },
        boundary: boundaryOf(viewport),
        anchorClip: anchor === null ? viewport : clipOf(anchor, viewport),
        rtl,
        options: current.options
      })
      const side = physicalSide(placed.side, rtl)
      const bridge = current.offsetAsPadding ? Math.max(0, current.options.sideOffset) : 0
      const scrolled = current.positionMethod === "absolute"
      const dpr = view.devicePixelRatio || 1
      const snap = (start: number, length: number) =>
        (Math.round((start + length) * dpr) - Math.round(start * dpr)) / dpr
      const next = new Map<string, string>([
        ["left", (placed.x + (scrolled ? view.scrollX : 0) - (side === "right" ? bridge : 0)) + "px"],
        ["top", (placed.y + (scrolled ? view.scrollY : 0) - (side === "bottom" ? bridge : 0)) + "px"],
        ["--anchor-width", snap(anchorRect.x, anchorRect.width) + "px"],
        ["--anchor-height", snap(anchorRect.y, anchorRect.height) + "px"],
        ["--available-width", placed.availableWidth + "px"],
        ["--available-height", placed.availableHeight + "px"],
        ["--transform-origin", placed.transformOrigin]
      ])
      if (bridge > 0) next.set("padding-" + opposite[side], bridge + "px")
      if (placed.arrow?.x != null) next.set(arrowX, placed.arrow.x + "px")
      if (placed.arrow?.y != null) next.set(arrowY, placed.arrow.y + "px")
      for (const name of owned.keys()) {
        if (!next.has(name)) node.style.removeProperty(name)
      }
      owned = next
      written.set(node, owned)
      for (const [name, value] of owned) {
        if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value)
      }
      const report: Placement = {
        side: placed.side,
        align: placed.align,
        anchorHidden: placed.anchorHidden,
        arrowUncentered: placed.arrow?.uncentered ?? false
      }
      if (reported === null || !sameReport(reported, report)) {
        reported = report
        Queue.offerUnsafe(queue, report)
      }
    }

    const update = (): void => {
      const before = popupSize()
      pass(before)
      const after = popupSize()
      if (before.width !== after.width || before.height !== after.height) pass(after)
    }

    const observe = (): () => void => {
      const anchor = current.disableAnchorTracking ? null : document.querySelector(current.anchorSelector)
      view.addEventListener("resize", update)
      if (!current.disableAnchorTracking) {
        document.addEventListener("scroll", update, { capture: true, passive: true })
      }
      let frame = -1
      const watch = () => sizes?.observe(node, { box: "border-box" })
      const sizes = typeof view.ResizeObserver === "function"
        ? new view.ResizeObserver((entries) => {
          if (entries[0]?.target === anchor) {
            // A size the update gives the popup after the anchor resized would be reported as a loop.
            sizes?.unobserve(node)
            view.cancelAnimationFrame(frame)
            frame = view.requestAnimationFrame(watch)
          }
          update()
        })
        : null
      if (anchor !== null) sizes?.observe(anchor)
      watch()
      const moves = anchor === null ? () => {} : observeMove(anchor, update)
      return () => {
        view.removeEventListener("resize", update)
        document.removeEventListener("scroll", update, { capture: true })
        view.cancelAnimationFrame(frame)
        sizes?.disconnect()
        moves()
      }
    }

    let stop = () => {}
    const start = (): void => {
      stop()
      stop = observe()
      update()
    }
    return Effect.acquireRelease(
      Effect.sync(start).pipe(
        Effect.tap(() =>
          Effect.forkScoped(Stream.runForEach(changes, (next) =>
            Effect.sync(() => {
              if (sameArgs(next, current)) return
              current = next
              start()
            })))
        )
      ),
      () => Effect.sync(() => stop())
    )
  })

/**
 * A stream mount that places a positioner against its anchor and keeps it
 * there while it runs. Issue it on the positioner while the popup shows, and
 * map each `Placement` it reports to a message.
 *
 * **Details**
 *
 * It reports once when it starts, then only when a field of the `Placement`
 * changes, so following a scroll renders nothing. The position itself goes
 * straight to the positioner's inline style. The module's JSDoc lists what
 * it writes and when it measures again.
 *
 * A `Scene` has no layout, so send a `Placement` there with
 * `mounted(Positioning.TrackPosition, placement)`.
 *
 * **Example** (A hint that stays next to its button)
 *
 * ```ts import.meta.vitest
 * import { Component, Mount, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Positioning } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ ChangedPlacement: { placement: Positioning.Placement } })
 *
 * const Hint = Component.define({
 *   name: "Hint",
 *   scoped: false,
 *   props: Schema.Struct({ open: Schema.Boolean, ...Positioning.PositionerFields }),
 *   model: Schema.Struct({ placement: Schema.NullOr(Positioning.Placement) }),
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => ({ placement: null }),
 *   update: {
 *     ChangedPlacement: (model, { placement }) => ({ ...model, placement })
 *   },
 *   view: (model, h) => {
 *     const anchorId = h.id("anchor")
 *     const args = Positioning.trackArgs(h.props, { side: "bottom", anchorSelector: `[id="${anchorId}"]` })
 *     const positioner = h.div
 *       .popover("manual", h.props.open)
 *       .attr("style", Positioning.positionerStyle(args.positionMethod))
 *       .attr("data-side", model.placement?.side ?? args.options.side)
 *       .children("Saved")
 *     return h.span(
 *       h.button.id(anchorId).children("Save"),
 *       h.props.open
 *         ? positioner.onMount(
 *           Positioning.TrackPosition(args).pipe(Mount.map((placement) => Message.ChangedPlacement({ placement })))
 *         )
 *         : positioner
 *     )
 *   }
 * })
 *
 * // Before the mount measures, the positioner has its resets and the requested side.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Hint, { open: true, sideOffset: 8 }))
 * if (!html.includes("position:absolute;inset:auto;margin:0")) throw new Error("the positioner has no resets")
 * if (!html.includes("data-side=\"bottom\"")) throw new Error("the positioner doesn't name its side")
 * ```
 *
 * @stability experimental
 * @category mounts
 * @since 0.1.0
 */
export const TrackPosition = Mount.makeStream("TrackPosition", { args: TrackPositionArgs }, trackPosition)
