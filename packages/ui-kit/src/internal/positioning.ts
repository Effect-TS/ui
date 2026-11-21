import * as Mount from "@effect/ui/Mount"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

export const Side = Schema.Literals(["top", "bottom", "left", "right", "inline-start", "inline-end"])
export type Side = typeof Side.Type

export const Align = Schema.Literals(["start", "center", "end"])
export type Align = typeof Align.Type

export const CollisionAvoidance = Schema.Struct({
  side: Schema.optional(Schema.Literals(["flip", "shift", "none"])),
  align: Schema.optional(Schema.Literals(["flip", "shift", "none"])),
  fallbackAxisSide: Schema.optional(Schema.Literals(["start", "end", "none"]))
})
export type CollisionAvoidance = typeof CollisionAvoidance.Type

const RectSchema = Schema.Struct({ x: Schema.Number, y: Schema.Number, width: Schema.Number, height: Schema.Number })

export const CollisionBoundary = Schema.Union([
  Schema.Literal("clipping-ancestors"),
  Schema.Struct({ id: Schema.String }),
  RectSchema
])
export type CollisionBoundary = typeof CollisionBoundary.Type

export const CollisionPadding = Schema.Union([
  Schema.Number,
  Schema.Struct({
    top: Schema.optional(Schema.Number),
    right: Schema.optional(Schema.Number),
    bottom: Schema.optional(Schema.Number),
    left: Schema.optional(Schema.Number)
  })
])
export type CollisionPadding = typeof CollisionPadding.Type

export const PositionMethod = Schema.Literals(["absolute", "fixed"])

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

export type PositionerOptions = Schema.Struct.Type<typeof PositionerFields>

export const dropdownCollisionAvoidance: CollisionAvoidance = { fallbackAxisSide: "none" }
export const popupCollisionAvoidance: CollisionAvoidance = { fallbackAxisSide: "end" }

export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

type Physical = "top" | "right" | "bottom" | "left"
type Sides = { readonly [K in Physical]: number }
type Axis = "x" | "y"
type Placement = Physical | `${Physical}-start` | `${Physical}-end`

const PlaceOptions = Schema.Struct({
  side: Side,
  align: Align,
  sideOffset: Schema.Number,
  alignOffset: Schema.Number,
  collisionAvoidance: Schema.Struct({
    side: Schema.Literals(["flip", "shift", "none"]),
    align: Schema.Literals(["flip", "shift", "none"]),
    fallbackAxisSide: Schema.Literals(["start", "end", "none"])
  }),
  collisionPadding: Schema.Struct({
    top: Schema.Number,
    right: Schema.Number,
    bottom: Schema.Number,
    left: Schema.Number
  }),
  sticky: Schema.Boolean,
  arrowPadding: Schema.Number
})

export type PlaceOptions = typeof PlaceOptions.Type

export const resolveOptions = (
  options: PositionerOptions,
  defaults: { readonly side: Side; readonly collisionAvoidance: CollisionAvoidance }
): PlaceOptions => {
  const avoidance = options.collisionAvoidance ?? defaults.collisionAvoidance
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

export interface PlaceInput {
  readonly anchor: Rect
  readonly popup: Size
  readonly arrow: Size | null
  readonly boundary: Rect
  readonly anchorClip: Rect
  readonly rtl: boolean
  readonly options: PlaceOptions
}

export interface Placed {
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
const sideOf = (placement: Placement): Physical => placement.split("-")[0] as Physical
const alignmentOf = (placement: Placement): "start" | "end" | undefined =>
  placement.split("-")[1] as "start" | "end" | undefined
const sideAxisOf = (placement: Placement): Axis => placement[0] === "t" || placement[0] === "b" ? "y" : "x"
const otherAxis = (axis: Axis): Axis => axis === "x" ? "y" : "x"
const lengthOf = (axis: Axis): "width" | "height" => axis === "y" ? "height" : "width"
const clamp = (start: number, value: number, end: number): number => Math.max(start, Math.min(value, end))
const oppositePlacement = (placement: Placement): Placement => {
  const side = sideOf(placement)
  return (opposite[side] + placement.slice(side.length)) as Placement
}
const oppositeAlignment = (placement: Placement): Placement =>
  (placement.includes("start") ? placement.replace("start", "end") : placement.replace("end", "start")) as Placement

const alignmentSides = (placement: Placement, rects: Rects, rtl: boolean): readonly [Physical, Physical] => {
  const alignment = alignmentOf(placement)
  const axis = otherAxis(sideAxisOf(placement))
  const length = lengthOf(axis)
  let main: Physical = axis === "x"
    ? alignment === (rtl ? "end" : "start") ? "right" : "left"
    : alignment === "start"
    ? "bottom"
    : "top"
  if (rects.reference[length] > rects.floating[length]) main = opposite[main]
  return [main, opposite[main]]
}

const oppositeAxisPlacements = (placement: Placement, direction: "start" | "end", rtl: boolean): Array<Placement> => {
  const alignment = alignmentOf(placement)
  const isStart = direction === "start"
  let list: Array<Placement> = sideAxisOf(placement) === "y"
    ? isStart !== rtl ? ["left", "right"] : ["right", "left"]
    : isStart
    ? ["top", "bottom"]
    : ["bottom", "top"]
  if (alignment !== undefined) {
    list = list.map((side) => `${side}-${alignment}` as Placement)
    list = list.concat(list.map(oppositeAlignment))
  }
  return list
}

interface Rects {
  readonly reference: Rect
  readonly floating: Rect
}

const coordsFor = ({ floating, reference }: Rects, placement: Placement, rtl: boolean) => {
  const sideAxis = sideAxisOf(placement)
  const alignAxis = otherAxis(sideAxis)
  const sideLength = lengthOf(sideAxis)
  const alignLength = lengthOf(alignAxis)
  const side = sideOf(placement)
  const alignment = alignmentOf(placement)
  const common = reference[alignLength] / 2 - floating[alignLength] / 2
  const coords = { x: 0, y: 0 }
  coords[sideAxis] = side === "top" || side === "left"
    ? reference[sideAxis] - floating[sideLength]
    : reference[sideAxis] + reference[sideLength]
  coords[alignAxis] = reference[alignAxis] + common +
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
  offset?: { x: number; y: number; placement: Placement }
  flip?: { index?: number; overflows?: ReadonlyArray<{ placement: Placement; overflows: ReadonlyArray<number> }> }
  shift?: { x: number; y: number; enabled: { x: boolean; y: boolean } }
  size?: { availableWidth: number; availableHeight: number }
  arrow?: { x?: number; y?: number; centerOffset: number; alignmentOffset?: number }
  origin?: { value: string }
  hide?: { anchorHidden: boolean }
}

interface State {
  readonly x: number
  readonly y: number
  readonly placement: Placement
  readonly initialPlacement: Placement
  readonly rects: Rects
  readonly data: Data
}

interface Step {
  readonly x?: number
  readonly y?: number
  readonly data?: object
  readonly reset?: boolean | { readonly placement: Placement }
}

interface Middleware {
  readonly name: keyof Data
  readonly fn: (state: State) => Step
}

const physicalSides: Record<Side, (rtl: boolean) => Physical> = {
  top: () => "top",
  bottom: () => "bottom",
  left: () => "left",
  right: () => "right",
  "inline-start": (rtl) => rtl ? "right" : "left",
  "inline-end": (rtl) => rtl ? "left" : "right"
}

const logicalSide = (requested: Side, rendered: Physical, rtl: boolean): Side => {
  if (requested !== "inline-start" && requested !== "inline-end") return rendered
  if (rendered === "right") return rtl ? "inline-start" : "inline-end"
  if (rendered === "left") return rtl ? "inline-end" : "inline-start"
  return rendered
}

const requestedSideBiasPx = 1

export const place = (input: PlaceInput): Placed => {
  const { anchor, arrow, boundary, anchorClip, options, popup, rtl } = input
  const padding = options.collisionPadding
  const { side: avoidSide, align: avoidAlign, fallbackAxisSide } = options.collisionAvoidance
  const physical = physicalSides[options.side](rtl)
  const initialPlacement: Placement = options.align === "center" ? physical : `${physical}-${options.align}`
  const rects: Rects = { reference: anchor, floating: { x: 0, y: 0, width: popup.width, height: popup.height } }

  const shiftDisabled = avoidAlign === "none" && avoidSide !== "shift"
  const crossAxisShift = !shiftDisabled && (options.sticky || avoidSide === "shift")

  const offset: Middleware = {
    name: "offset",
    fn: ({ data, placement, x, y }) => {
      if (placement === data.offset?.placement && data.arrow?.alignmentOffset) return {}
      const side = sideOf(placement)
      const alignment = alignmentOf(placement)
      const vertical = sideAxisOf(placement) === "y"
      const main = options.sideOffset * (side === "top" || side === "left" ? -1 : 1)
      const crossMulti = rtl && vertical ? -1 : 1
      const cross = alignment === "end" ? -options.alignOffset : options.alignOffset
      const diff = vertical ? { x: cross * crossMulti, y: main } : { x: main, y: cross * crossMulti }
      return { x: x + diff.x, y: y + diff.y, data: { ...diff, placement } }
    }
  }

  const flipPadding: Sides = {
    top: padding.top + requestedSideBiasPx + (options.side === "bottom" ? requestedSideBiasPx : 0),
    right: padding.right + requestedSideBiasPx + (options.side === "left" ? requestedSideBiasPx : 0),
    bottom: padding.bottom + requestedSideBiasPx + (options.side === "top" ? requestedSideBiasPx : 0),
    left: padding.left + requestedSideBiasPx + (options.side === "right" ? requestedSideBiasPx : 0)
  }
  const flipMainAxis = avoidSide === "flip"
  const flipCrossAxis = avoidAlign === "flip"

  const flip: Middleware = {
    name: "flip",
    fn: (state) => {
      const { data, placement } = state
      if (data.arrow?.alignmentOffset) return {}
      const side = sideOf(placement)
      const initialSideAxis = sideAxisOf(initialPlacement)
      const fallbacks: Array<Placement> = sideOf(initialPlacement) === initialPlacement
        ? [oppositePlacement(initialPlacement)]
        : [
          oppositeAlignment(initialPlacement),
          oppositePlacement(initialPlacement),
          oppositeAlignment(oppositePlacement(initialPlacement))
        ]
      if (fallbackAxisSide !== "none") {
        fallbacks.push(...oppositeAxisPlacements(initialPlacement, fallbackAxisSide, rtl))
      }
      const placements = [initialPlacement, ...fallbacks]
      const overflow = overflowOf(
        { x: state.x, y: state.y, width: popup.width, height: popup.height },
        boundary,
        data.size === undefined ? flipPadding : padding
      )
      const overflows: Array<number> = []
      if (flipMainAxis) overflows.push(overflow[side])
      if (flipCrossAxis) {
        const [a, b] = alignmentSides(placement, rects, rtl)
        overflows.push(overflow[a], overflow[b])
      }
      const history = [...(data.flip?.overflows ?? []), { placement, overflows }]
      if (overflows.every((value) => value <= 0)) return {}
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
      const overflow = overflowOf({ x, y, width: popup.width, height: popup.height }, boundary, padding)
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
        const originSide = sideOf(placement) === "top" || sideOf(placement) === "left"
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

  const size: Middleware = {
    name: "size",
    fn: (state) => {
      const { placement } = state
      const overflow = overflowOf(
        { x: state.x, y: state.y, width: popup.width, height: popup.height },
        boundary,
        padding
      )
      const side = sideOf(placement)
      const alignment = alignmentOf(placement)
      const vertical = sideAxisOf(placement) === "y"
      const { height, width } = popup
      const heightSide: Physical = vertical ? side : alignment === "end" ? "top" : "bottom"
      const widthSide: Physical = vertical ? alignment === (rtl ? "start" : "end") ? "left" : "right" : side
      const clipHeight = height - overflow.top - overflow.bottom
      const clipWidth = width - overflow.left - overflow.right
      let availableHeight = Math.min(height - overflow[heightSide], clipHeight)
      let availableWidth = Math.min(width - overflow[widthSide], clipWidth)
      const shifted = state.data.shift
      if (shifted?.enabled.x) availableWidth = clipWidth
      if (shifted?.enabled.y) availableHeight = clipHeight
      if (shifted === undefined && alignment === undefined) {
        if (vertical) availableWidth = width - 2 * Math.max(overflow.left, overflow.right)
        else availableHeight = height - 2 * Math.max(overflow.top, overflow.bottom)
      }
      return { data: { availableWidth, availableHeight } }
    }
  }

  const arrowSize = arrow ?? { width: 0, height: 0 }
  const arrowPadding = arrow === null ? 0 : options.arrowPadding
  const arrowStep: Middleware = {
    name: "arrow",
    fn: (state) => {
      const { placement, x, y } = state
      const coords = { x, y }
      const axis = otherAxis(sideAxisOf(placement))
      const length = lengthOf(axis)
      const endDiff = anchor[length] + anchor[axis] - coords[axis] - popup[length]
      const startDiff = coords[axis] - anchor[axis]
      const clientSize = popup[length]
      const centerToReference = endDiff / 2 - startDiff / 2
      const largest = clientSize / 2 - arrowSize[length] / 2 - 1
      const minPadding = Math.min(arrowPadding, largest)
      const maxPadding = Math.min(arrowPadding, largest)
      const min = minPadding
      const max = clientSize - arrowSize[length] - maxPadding
      const center = clientSize / 2 - arrowSize[length] / 2 + centerToReference
      const at = clamp(min, center, max)
      const addOffset = state.data.arrow === undefined && alignmentOf(placement) !== undefined && center !== at &&
        anchor[length] / 2 - (center < min ? minPadding : maxPadding) - arrowSize[length] / 2 < 0
      const alignmentOffset = addOffset ? (center < min ? center - min : center - max) : 0
      const moved = { ...coords }
      moved[axis] = coords[axis] + alignmentOffset
      return {
        ...moved,
        data: {
          [axis]: at,
          centerOffset: center - at - alignmentOffset,
          ...(addOffset ? { alignmentOffset } : {})
        },
        reset: addOffset
      }
    }
  }

  const origin: Middleware = {
    name: "origin",
    fn: (state) => {
      const { data, placement, y } = state
      const side = sideOf(placement)
      const alignment = alignmentOf(placement)
      const vertical = sideAxisOf(placement) === "y"
      let cross: string
      if (arrow === null && alignment !== undefined && Math.abs((vertical ? data.shift?.x : data.shift?.y) ?? 0) <= 1) {
        cross = (alignment === "start") === (vertical && rtl) ? "100%" : "0%"
      } else {
        const at = (vertical ? data.arrow?.x : data.arrow?.y) ?? 0
        cross = `${at + (vertical ? arrowSize.width : arrowSize.height) / 2}px`
      }
      let sideOrigin = side === "top" || side === "left"
        ? `calc(100% + ${options.sideOffset}px)`
        : `${-options.sideOffset}px`
      if (crossAxisShift && vertical && Math.abs(data.shift?.y ?? 0) > options.sideOffset) {
        sideOrigin = `${anchor.y + anchor.height / 2 - y}px`
      }
      return { data: { value: vertical ? `${cross} ${sideOrigin}` : `${sideOrigin} ${cross}` } }
    }
  }

  const hide: Middleware = {
    name: "hide",
    fn: () => {
      const empty = anchor.width === 0 && anchor.height === 0 && anchor.x === 0 && anchor.y === 0
      const overflow = overflowOf(anchor, anchorClip, { top: 0, right: 0, bottom: 0, left: 0 })
      const hidden = overflow.top - anchor.height >= 0 || overflow.right - anchor.width >= 0 ||
        overflow.bottom - anchor.height >= 0 || overflow.left - anchor.width >= 0
      return { data: { anchorHidden: hidden || empty } }
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
  middleware.push(size, arrowStep, origin, hide)

  let { x, y } = coordsFor(rects, initialPlacement, rtl)
  let placement = initialPlacement
  let resets = 0
  const data: Record<string, object> = {}
  for (let i = 0; i < middleware.length; i++) {
    const { fn, name } = middleware[i]!
    const step = fn({ x, y, placement, initialPlacement, rects, data: data as Data })
    x = step.x ?? x
    y = step.y ?? y
    data[name] = { ...data[name], ...step.data }
    if (step.reset !== undefined && step.reset !== false && resets < 50) {
      resets++
      if (typeof step.reset === "object") {
        placement = step.reset.placement
        const coords = coordsFor(rects, placement, rtl)
        x = coords.x
        y = coords.y
      }
      i = -1
    }
  }

  const result = data as Data
  const arrowData = result.arrow!
  return {
    x,
    y,
    side: logicalSide(options.side, sideOf(placement), rtl),
    align: alignmentOf(placement) ?? "center",
    availableWidth: result.size!.availableWidth,
    availableHeight: result.size!.availableHeight,
    anchorHidden: result.hide!.anchorHidden,
    arrow: arrow === null ? null : {
      x: arrowData.x ?? null,
      y: arrowData.y ?? null,
      uncentered: arrowData.centerOffset !== 0
    },
    transformOrigin: result.origin!.value
  }
}

export const Reported = Schema.Struct({
  side: Side,
  align: Align,
  anchorHidden: Schema.Boolean,
  arrowUncentered: Schema.Boolean
})
export type Reported = typeof Reported.Type

export const TrackPositionArgs = Schema.Struct({
  options: PlaceOptions,
  positionMethod: PositionMethod,
  collisionBoundary: CollisionBoundary,
  disableAnchorTracking: Schema.Boolean,
  anchorSelector: Schema.String,
  arrowId: Schema.NullOr(Schema.String),
  offsetAsPadding: Schema.Boolean
})
export type TrackPositionArgs = typeof TrackPositionArgs.Type

export const arrowX = "--ui-kit-arrow-x"
export const arrowY = "--ui-kit-arrow-y"

export const idSelector = (id: string): string => `[id="${id.replace(/["\\]/g, "\\$&")}"]`

export const physicalSide = (side: Side, rtl: boolean): Physical => physicalSides[side](rtl)

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
const transforming = /transform|translate|scale|rotate|perspective|filter|contain/

const set = (value: string | undefined, none = "none"): boolean => value !== undefined && value !== "" && value !== none

const paintContained = (style: CSSStyleDeclaration): boolean =>
  painting.test(style.contain) || set(style.contentVisibility, "visible")

const containsFixed = (style: CSSStyleDeclaration): boolean =>
  [
    style.transform,
    style.translate,
    style.scale,
    style.rotate,
    style.perspective,
    style.filter,
    style.backdropFilter,
    style.offsetPath
  ]
    .some((value) => set(value)) ||
  style.transformStyle === "preserve-3d" ||
  transforming.test(style.willChange) || containing.test(style.contain) || paintContained(style)

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

const sameReport = (a: Reported | null, b: Reported): boolean =>
  a !== null && a.side === b.side && a.align === b.align && a.anchorHidden === b.anchorHidden &&
  a.arrowUncentered === b.arrowUncentered

export const trackPosition = (
  node: HTMLElement,
  args: TrackPositionArgs,
  changes: Stream.Stream<TrackPositionArgs>
): Stream.Stream<Reported> =>
  Stream.callback<Reported>((queue) => {
    const document = node.ownerDocument
    const view = document.defaultView!
    let current = args
    let reported: Reported | null = null
    let owned = written.get(node) ?? new Map<string, string>()

    const restore = () => {
      for (const [name, value] of owned) {
        if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value)
      }
    }

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
      return value !== undefined && node.style.getPropertyValue("padding-" + side) === value ? parseFloat(value) : 0
    }

    const popupSize = (): Size => ({
      width: Math.max(0, node.offsetWidth - bridged("left") - bridged("right")),
      height: Math.max(0, node.offsetHeight - bridged("top") - bridged("bottom"))
    })

    const pass = (): void => {
      const anchor = document.querySelector(current.anchorSelector)
      const arrow = current.arrowId === null ? null : document.getElementById(current.arrowId)
      const viewport = viewportOf()
      const anchorRect = anchor === null ? zero : clientRect(anchor)
      const rtl = view.getComputedStyle(node).direction === "rtl"
      const placed = place({
        anchor: anchorRect,
        popup: popupSize(),
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
      restore()
      const report: Reported = {
        side: placed.side,
        align: placed.align,
        anchorHidden: placed.anchorHidden,
        arrowUncentered: placed.arrow?.uncentered ?? false
      }
      if (!sameReport(reported, report)) {
        reported = report
        Queue.offerUnsafe(queue, report)
      }
    }

    const update = (): void => {
      const before = popupSize()
      pass()
      const after = popupSize()
      if (before.width !== after.width || before.height !== after.height) pass()
    }

    const observe = (): () => void => {
      const styles = new view.MutationObserver(restore)
      styles.observe(node, { attributes: true, attributeFilter: ["style"] })
      view.addEventListener("resize", update)
      if (current.disableAnchorTracking) {
        return () => {
          styles.disconnect()
          view.removeEventListener("resize", update)
        }
      }
      const anchor = document.querySelector(current.anchorSelector)
      document.addEventListener("scroll", update, { capture: true, passive: true })
      let frame = -1
      const sizes = typeof view.ResizeObserver === "function"
        ? new view.ResizeObserver((entries) => {
          if (entries[0]?.target === anchor) {
            // A size the update gives the popup after the anchor resized would be reported as a loop.
            sizes?.unobserve(node)
            view.cancelAnimationFrame(frame)
            frame = view.requestAnimationFrame(() => sizes?.observe(node))
          }
          update()
        })
        : null
      if (anchor !== null) sizes?.observe(anchor)
      sizes?.observe(node)
      const moves = anchor === null ? () => {} : observeMove(anchor, update)
      return () => {
        styles.disconnect()
        view.removeEventListener("resize", update)
        document.removeEventListener("scroll", update, { capture: true })
        view.cancelAnimationFrame(frame)
        sizes?.disconnect()
        moves()
      }
    }

    let stop = () => {}
    return Effect.acquireRelease(
      Effect.sync(() => {
        stop = observe()
        update()
      }).pipe(
        Effect.tap(() =>
          Effect.forkScoped(Stream.runForEach(changes, (next) =>
            Effect.sync(() => {
              if (next === current) return
              current = next
              stop()
              stop = observe()
              update()
            })))
        )
      ),
      () => Effect.sync(() => stop())
    )
  })

export const TrackPosition = Mount.makeStream("TrackPosition", { args: TrackPositionArgs }, trackPosition)
