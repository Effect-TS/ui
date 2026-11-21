/**
 * A panel that slides in from an edge of the screen, such as a bottom sheet
 * or a navigation drawer, and is swiped away.
 *
 * `Drawer` is a headless component over a `Dialog`: the `Dialog` keeps the
 * `<dialog>`, focus, dismissal, transitions and nesting, and the drawer adds
 * the swipe. The consumer owns whether the drawer is open and where it
 * rests, passes them as `open` and `snapPoint`, and stores what `Opened`,
 * `Dismissed` and `Snapped` report. A refused close keeps the drawer open,
 * and a swipe that asked for it slides back.
 *
 * **Anatomy**
 *
 * | Part           | Element                                                  |
 * | :------------- | :------------------------------------------------------- |
 * | `trigger`      | `<button>` that opens the drawer                         |
 * | `swipeArea`    | `<div>` outside the portal that a swipe opens the drawer from |
 * | `portal`       | `<dialog>` in the top layer, around the parts below      |
 * | `backdrop`     | `<div>` that covers the page                             |
 * | `viewport`     | `<div>` that positions the popup                         |
 * | `popup`        | `<div>` with the drawer's content, which a swipe moves   |
 * | `content`      | `<div>` inside the popup where a mouse drag selects text |
 * | `title`, `description`, `close`, `initialFocus`, `finalFocus` | as for a `Dialog` |
 *
 * Each part takes the consumer's builder and returns it, as a `Dialog`'s do:
 * `drawer.portal(h.dialog)?.children(drawer.popup(h.div).children(...))`.
 * `swipeArea` takes `{ element, swipeDirection, disabled }` and can be drawn
 * more than once. Its direction is the opposite of the drawer's by default.
 *
 * Style the popup's position from the variables below, so a swipe moves it:
 * `.popup { transform: translateY(var(--drawer-swipe-movement-y)) }`, and
 * `translateY(calc(var(--drawer-snap-point-offset) + var(--drawer-swipe-movement-y)))`
 * with snap points. While a swipe runs the kit sets the popup's inline
 * `transition` to `none`, and puts it back after.
 *
 * **Swipes**
 *
 * A swipe starts from the popup with a mouse, a pen or a finger, in
 * `swipeDirection`. It doesn't start from a `button`, `a`, `input`, `select`,
 * `textarea`, `label` or `[role="button"]`, from `content` with a mouse or a
 * pen, or from an element with `data-swipe-ignore`. `data-swipe-ignore="x"`
 * or `"y"` ignores only touches along that axis. A touch on content that
 * scrolls scrolls it. One that starts with the content scrolled to its edge
 * nearest the drawer's, and moves toward the drawer's edge, swipes. A pinch, a selection of text and a swipe
 * while a nested drawer is open start nothing.
 *
 * A release dismisses the drawer past half its size or faster than 0.5 px
 * per ms, and settles it back otherwise. With `snapPoints`, a release rests
 * on the nearest snap point, pushed further by a fast release, and emits
 * `Snapped` for a new one. Past the lowest, it dismisses.
 *
 * A swipe on a swipe area emits `Opened` with the reason `"swipe"` once it
 * moves, so the drawer opens as the swipe starts. Once `open` is true the
 * popup follows the finger. A release past half the popup's size, or faster
 * than 0.1 px per ms, keeps it open, and a shorter one emits `Dismissed`
 * with the reason `"swipe"`. A consumer that refuses or delays the open sees
 * nothing follow the finger.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, on top of the `Dialog`'s:
 *
 * - `popup`: `data-swiping`, `data-swipe-direction` (`up`, `down`, `left`
 *   or `right`), `data-swipe-dismiss` while a swipe's close runs,
 *   `data-expanded` at the snap point `1`, `data-nested-drawer-open` and
 *   `data-nested-drawer-swiping`
 * - `backdrop`: `data-swiping` and `data-swipe-dismiss`
 * - `swipeArea`: `data-open` / `data-closed`, `data-disabled`,
 *   `data-swipe-direction` and `data-swiping`
 *
 * The popup sets the CSS variables `--nested-drawers`, `--drawer-height`,
 * `--drawer-frontmost-height` (the height of the frontmost nested drawer),
 * `--drawer-snap-point-offset`, `--drawer-swipe-movement-x` and
 * `--drawer-swipe-movement-y`, and `--drawer-swipe-strength`, from `0.1` to `1`:
 * a faster swipe's close ends sooner, as in
 * `transition-duration: calc(var(--drawer-swipe-strength) * 400ms)`. The
 * backdrop sets `--drawer-swipe-progress`, from `0` when open to `1` when
 * swiped away, so `opacity: calc(1 - var(--drawer-swipe-progress))` fades it.
 * With snap points it runs from `0` at the tallest snap point to `1` at the
 * next one, and rests there, so the backdrop shows only while the drawer is
 * expanded.
 * With `virtualKeyboard`, the viewport sets `--drawer-keyboard-inset` while
 * the software keyboard covers part of it: read it as
 * `var(--drawer-keyboard-inset, 0px)`.
 *
 * **Keyboard**
 *
 * As a `Dialog`'s. With `virtualKeyboard` and the `viewport` part, the
 * viewport follows the software keyboard: the focused field scrolls into the
 * part of the screen the keyboard leaves, and a modal drawer keeps the page
 * from scrolling under it.
 *
 * **Limits**
 *
 * - The popup carries the swipe's mount and the viewport the keyboard's, so
 *   neither takes a mount of the consumer's.
 * - Snap points apply to a drawer that swipes `up` or `down`.
 * - It renders a `Drawer` and a `Dialog` instance, so a `Scene` of the
 *   consumer finds both, as the `Drawer` export describes.
 * - On the server, and on a host that doesn't run mounts, nothing swipes.
 *
 * **Example** (A bottom sheet whose open state lives in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Drawer } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ Opened: {}, Dismissed: {} })
 *
 * const Page = Component.define({
 *   name: "Page",
 *   model: Schema.Struct({ open: Schema.Boolean }),
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => ({ open: true }),
 *   update: {
 *     Opened: () => ({ open: true }),
 *     Dismissed: () => ({ open: false })
 *   },
 *   view: (model, h) =>
 *     Drawer(h, {
 *       props: { open: model.open },
 *       onEmit: {
 *         Opened: () => Message.Opened(),
 *         Dismissed: () => Message.Dismissed(),
 *         Settled: () => undefined,
 *         Snapped: () => undefined
 *       },
 *       view: (drawer) =>
 *         h.div(
 *           drawer.trigger(h.button).children("Filters"),
 *           drawer.portal(h.dialog)?.children(
 *             drawer.backdrop(h.div.class("backdrop")),
 *             drawer.viewport(h.div.class("viewport")).children(
 *               drawer.popup(h.div.class("sheet")).children(
 *                 drawer.title(h.h2).children("Filters"),
 *                 drawer.content(h.div).children("Pick the filters to apply."),
 *                 drawer.close(h.button).children("Done")
 *               )
 *             )
 *           )
 *         )
 *     })
 * })
 *
 * // The sheet swipes down, and keeps the consumer's class.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Page, {}))
 * if (!html.includes(`data-swipe-direction="down"`) || !html.includes(`class="sheet"`)) {
 *   throw new Error("the sheet isn't a drawer")
 * }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { Dialog, DialogDismissReason, type DialogEvents, DialogProps } from "./Dialog.ts"
import { flag, withStyle } from "./internal/attributes.ts"
import { trackKeyboard, TrackKeyboardArgs } from "./internal/drawerKeyboard.ts"

/**
 * The direction a swipe dismisses a drawer in, which is also the edge it
 * sits on: `"down"` for a bottom sheet, `"left"` for a drawer on the left.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DrawerSwipeDirection = Schema.Literals(["up", "down", "left", "right"])

/**
 * The direction a swipe dismisses a drawer in.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DrawerSwipeDirection = typeof DrawerSwipeDirection.Type

/**
 * How much of a drawer shows at a snap point: a number up to `1` is a
 * fraction of the viewport's height, a larger number is pixels, and a string
 * is a length in `px` or `rem`, such as `"320px"` or `"20rem"`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DrawerSnapPoint = Schema.Union([Schema.Number, Schema.String])

/**
 * How much of a drawer shows at a snap point.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DrawerSnapPoint = typeof DrawerSnapPoint.Type

/**
 * A `Dialog`'s props, and how the drawer is swiped.
 *
 * **Details**
 *
 * - `open`, `modal`, `disablePointerDismissal`, `triggerId`, `keepMounted`,
 *   `forceRenderBackdrop`, `initialFocus`, `finalFocus`, `id`, `openMethod`
 *   and `holdExit`: as for a `Dialog`.
 * - `swipeDirection`: the direction a swipe dismisses the drawer in,
 *   `"down"` by default.
 * - `snapPoints`: the heights the drawer can rest at, from the lowest to the
 *   tallest. Only a drawer that swipes `"up"` or `"down"` uses them.
 * - `snapPoint`: the snap point the drawer rests at, controlled like `open`.
 *   Store what `Snapped` reports. Left out or `null`, it is the first one.
 * - `snapToSequentialPoints`: a release moves at most one snap point, however
 *   fast the swipe.
 * - `virtualKeyboard`: the viewport follows the software keyboard, as the
 *   module describes. It needs the `viewport` part.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DrawerProps = Schema.Struct({
  ...DialogProps.fields,
  swipeDirection: Schema.optional(DrawerSwipeDirection),
  snapPoints: Schema.optional(Schema.Array(DrawerSnapPoint)),
  snapPoint: Schema.optional(Schema.NullOr(DrawerSnapPoint)),
  snapToSequentialPoints: Schema.optional(Schema.Boolean),
  virtualKeyboard: Schema.optional(Schema.Boolean)
})

/**
 * The props of a `Drawer`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DrawerProps = typeof DrawerProps.Type

/**
 * Why a drawer asks to close: a `Dialog`'s reasons, and `swipe`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DrawerDismissReason = Schema.Literals([...DialogDismissReason.literals, "swipe"])

/**
 * Why a drawer asks to close.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DrawerDismissReason = typeof DrawerDismissReason.Type

/**
 * Why a drawer asks to open: a press on a trigger, or a swipe on a swipe
 * area.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DrawerOpenReason = Schema.Literals(["trigger-press", "swipe"])

/**
 * Why a drawer asks to open.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DrawerOpenReason = typeof DrawerOpenReason.Type

/**
 * `Opened` requests that the drawer open, with the trigger's `id` and the
 * reason. A swipe on a swipe area has no trigger, so its `triggerId` is
 * `null`. `Dismissed` requests that it close, with the reason. `Settled`
 * reports that the transitions of an open or a close finished, as a
 * `Dialog`'s does. `Snapped` requests that the drawer rest at another snap
 * point, after a swipe. The consumer decides whether to change `open` and
 * `snapPoint`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DrawerEvents = UiSchema.TaggedEnum({
  Opened: { triggerId: Schema.NullOr(Schema.String), reason: DrawerOpenReason },
  Dismissed: { reason: DrawerDismissReason },
  Settled: { open: Schema.Boolean },
  Snapped: { snapPoint: DrawerSnapPoint }
})

/**
 * What a `Drawer` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DrawerEvents = typeof DrawerEvents.Type

/**
 * The props of a `DrawerProvider`: none.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DrawerProviderProps = Schema.Struct({})

/**
 * The props of a `DrawerProvider`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DrawerProviderProps = typeof DrawerProviderProps.Type

const fastSwipeVelocity = 0.5
const minSwipeThreshold = 10
const reverseCancelThreshold = 10
const snapVelocityThreshold = 0.5
const snapVelocityMultiplier = 300
const maxSnapVelocity = 4
const minReleaseVelocity = 0.2
const maxReleaseVelocity = 4
const minReleaseDuration = 80
const maxReleaseDuration = 360
const minReleaseScalar = 0.1
const maxReleaseScalar = 1
const axisLockSlop = 6
const axisLockBias = 2
const minVelocityDuration = 50
const minSampleDuration = 4
const maxSampleAge = 80
const minSampleDistance = 1
const openRatio = 0.5
const fallbackOpenThreshold = 40
const openVelocityThreshold = 0.1
const minOpenDistance = 1

const interactive = "button,a,input,select,textarea,label,[role=\"button\"]"
const ignoreAttribute = "data-swipe-ignore"
const contentAttribute = "data-drawer-content"

const opposite: Record<DrawerSwipeDirection, DrawerSwipeDirection> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left"
}

const isHorizontal = (direction: DrawerSwipeDirection): boolean => direction === "left" || direction === "right"

const displacement = (direction: DrawerSwipeDirection, x: number, y: number): number =>
  direction === "up" ? -y : direction === "down" ? y : direction === "left" ? -x : x

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

const closestIndex = (values: ReadonlyArray<number>, target: number): number => {
  let index = -1
  let distance = Infinity
  values.forEach((value, i) => {
    if (Math.abs(value - target) < distance) {
      distance = Math.abs(value - target)
      index = i
    }
  })
  return index
}

interface Snap {
  readonly value: DrawerSnapPoint
  readonly height: number
  readonly offset: number
}

interface Sizes {
  readonly height: number
  readonly viewport: number
  readonly fontSize: number
}

const lengthOf = (point: DrawerSnapPoint, sizes: Sizes): number | null => {
  if (!Number.isFinite(sizes.viewport) || sizes.viewport <= 0) return null
  if (typeof point === "number") {
    if (!Number.isFinite(point)) return null
    return point <= 1 ? clamp(point, 0, 1) * sizes.viewport : point
  }
  const trimmed = point.trim()
  const value = Number.parseFloat(trimmed)
  if (!Number.isFinite(value)) return null
  return trimmed.endsWith("px") ? value : trimmed.endsWith("rem") ? value * sizes.fontSize : null
}

const snapsOf = (points: ReadonlyArray<DrawerSnapPoint>, sizes: Sizes): ReadonlyArray<Snap> => {
  if (points.length === 0 || sizes.viewport <= 0 || sizes.height <= 0) return []
  const max = Math.min(sizes.height, sizes.viewport)
  const resolved = points.flatMap((value): Array<Snap> => {
    const length = lengthOf(value, sizes)
    if (length === null) return []
    const height = clamp(length, 0, max)
    return [{ value, height, offset: Math.max(0, sizes.height - height) }]
  })
  const kept: Array<Snap> = []
  for (let i = resolved.length - 1; i >= 0; i--) {
    const snap = resolved[i]!
    if (!kept.some((other) => Math.abs(other.height - snap.height) <= 1)) kept.unshift(snap)
  }
  return kept
}

interface Snapping {
  readonly snaps: ReadonlyArray<Snap>
  readonly active: Snap | undefined
  readonly offset: number
  readonly min: number
  readonly range: number
}

const snappingOf = (props: DrawerProps, sizes: Sizes): Snapping | null => {
  const direction = props.swipeDirection ?? "down"
  if (isHorizontal(direction) || props.snapPoints === undefined) return null
  const snaps = snapsOf(props.snapPoints, sizes)
  if (snaps.length === 0) return null
  const wanted = props.snapPoint ?? props.snapPoints[0]!
  let active = snaps.find((snap) => Object.is(snap.value, wanted))
  if (active === undefined) {
    const length = lengthOf(wanted, sizes)
    if (length !== null) {
      const height = clamp(length, 0, Math.min(sizes.height, sizes.viewport))
      active = snaps[closestIndex(snaps.map((snap) => snap.height), height)]
    }
  }
  const offsets = snaps.map((snap) => snap.offset).sort((a, b) => a - b)
  return {
    snaps,
    active,
    offset: active?.offset ?? 0,
    min: offsets[0]!,
    range: offsets.length > 1 ? offsets[1]! - offsets[0]! : 0
  }
}

const restingProgress = (snapping: Snapping | null): number =>
  snapping === null || snapping.range <= 0 || snapping.active === undefined
    ? 0
    : clamp((snapping.active.offset - snapping.min) / snapping.range, 0, 1)

type Release = typeof Message.cases.ReleasedSwipe.Type

type Decision =
  | { readonly _tag: "Dismiss"; readonly strength: number | null }
  | { readonly _tag: "Snap"; readonly snapPoint: DrawerSnapPoint }
  | { readonly _tag: "Settle" }

const settle: Decision = { _tag: "Settle" }

const strengthOf = (direction: DrawerSwipeDirection, base: number, release: Release): number | null => {
  const size = isHorizontal(direction) ? release.width : release.height
  if (size <= 0) return null
  const remaining = Math.max(0, size - (base + displacement(direction, release.deltaX, release.deltaY)))
  if (remaining <= 0) return null
  const last = displacement(direction, release.releaseVelocityX, release.releaseVelocityY)
  const velocity = Math.abs(last) > 0 ? last : displacement(direction, release.velocityX, release.velocityY)
  if (velocity <= minReleaseVelocity) return null
  const duration = clamp(
    remaining / clamp(velocity, minReleaseVelocity, maxReleaseVelocity),
    minReleaseDuration,
    maxReleaseDuration
  )
  return minReleaseScalar +
    (duration - minReleaseDuration) / (maxReleaseDuration - minReleaseDuration) * (maxReleaseScalar - minReleaseScalar)
}

const decide = (props: DrawerProps, snapping: Snapping | null, release: Release): Decision => {
  const direction = props.swipeDirection ?? "down"
  if (snapping === null) {
    const intended = release.direction
    if (intended === null || release.reversed) return settle
    const along = displacement(intended, release.deltaX, release.deltaY)
    if (along <= 0) return settle
    const size = isHorizontal(intended) ? release.width : release.height
    const fast = displacement(intended, release.velocityX, release.velocityY) >= fastSwipeVelocity
    return fast || along > Math.max(size * 0.5, minSwipeThreshold)
      ? { _tag: "Dismiss", strength: strengthOf(intended, 0, release) }
      : settle
  }
  const height = release.height
  if (height <= 0) return settle
  const down = direction === "down"
  const drag = down ? release.deltaY : -release.deltaY
  const dragSign = Math.sign(drag)
  let velocity = down ? release.releaseVelocityY : -release.releaseVelocityY
  if (dragSign !== 0 && Math.abs(drag) >= minSwipeThreshold) {
    const sign = Math.sign(velocity)
    if (sign !== 0 && sign !== dragSign) velocity = down ? release.velocityY : -release.velocityY
  }
  const current = snapping.offset
  const dragTarget = clamp(current + drag, 0, height)
  const boost = Math.abs(velocity) >= snapVelocityThreshold
    ? clamp(velocity, -maxSnapVelocity, maxSnapVelocity) * snapVelocityMultiplier
    : 0
  const sequential = props.snapToSequentialPoints === true
  const target = sequential ? dragTarget : clamp(dragTarget + boost, 0, height)
  const settleOn = (snap: Snap): Decision =>
    snapping.active !== undefined && Object.is(snap.value, snapping.active.value)
      ? settle
      : { _tag: "Snap", snapPoint: snap.value }
  const close = (fallback: Snap): Decision =>
    release.direction === null
      ? settleOn(fallback)
      : { _tag: "Dismiss", strength: strengthOf(direction, current, release) }
  if (sequential) {
    const ordered = [...snapping.snaps].sort((a, b) => a.offset - b.offset)
    const offsets = ordered.map((snap) => snap.offset)
    const index = closestIndex(offsets, current)
    let snap = ordered[closestIndex(offsets, target)]!
    let effective = target
    const sign = Math.sign(velocity)
    if (dragSign !== 0 && sign === dragSign && Math.abs(velocity) >= snapVelocityThreshold) {
      const next = clamp(index + dragSign, 0, ordered.length - 1)
      if (next !== index) {
        const adjacent = ordered[next]!
        if (dragSign > 0 ? target < adjacent.offset : target > adjacent.offset) {
          snap = adjacent
          effective = adjacent.offset
        }
      } else if (dragSign > 0) {
        return close(snap)
      }
    }
    return Math.abs(effective - height) < Math.abs(effective - snap.offset) ? close(snap) : settleOn(snap)
  }
  const snap = snapping.snaps[closestIndex(snapping.snaps.map((snap) => snap.offset), target)]!
  if (velocity >= fastSwipeVelocity && drag > 0) return close(snap)
  return Math.abs(target - height) < Math.abs(target - snap.offset) ? close(snap) : settleOn(snap)
}

const ReleaseFields = {
  direction: Schema.NullOr(DrawerSwipeDirection),
  reversed: Schema.Boolean,
  deltaX: Schema.Number,
  deltaY: Schema.Number,
  velocityX: Schema.Number,
  velocityY: Schema.Number,
  releaseVelocityX: Schema.Number,
  releaseVelocityY: Schema.Number,
  width: Schema.Number,
  height: Schema.Number
}

const Message = UiSchema.TaggedEnum({
  StartedSwipe: {},
  ReleasedSwipe: ReleaseFields,
  CancelledSwipe: {},
  RefusedSwipe: {},
  ShowedPopup: {},
  Measured: { width: Schema.Number, height: Schema.Number, viewport: Schema.Number, fontSize: Schema.Number },
  StartedAreaSwipe: { key: Schema.String },
  ReleasedAreaSwipe: { displacement: Schema.Number, velocity: Schema.Number, size: Schema.NullOr(Schema.Number) },
  CancelledAreaSwipe: {},
  ChangedNested: { count: Schema.Number, swiping: Schema.Boolean, height: Schema.Number }
})

type Message = typeof Message.Type

const Model = Schema.Struct({
  swiping: Schema.Boolean,
  area: Schema.NullOr(Schema.String),
  openedByArea: Schema.Boolean,
  dismissed: Schema.Boolean,
  strength: Schema.NullOr(Schema.Number),
  releases: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
  viewport: Schema.Number,
  fontSize: Schema.Number,
  nestedOpen: Schema.Number,
  nestedSwiping: Schema.Boolean,
  nestedHeight: Schema.Number
})

type Model = typeof Model.Type

const NestedReport = Schema.Struct({ count: Schema.Number, swiping: Schema.Boolean, height: Schema.Number })

const frontmostOf = (model: Model): number => model.nestedHeight > 0 ? model.nestedHeight : model.height

interface Point {
  readonly x: number
  readonly y: number
}

interface Sample extends Point {
  readonly time: number
}

// Some Android devices send a stationary move just before the release, so a
// sample that didn't move doesn't replace the last one that did.
interface Velocity {
  sample: Sample | null
  stationary: boolean
  x: number
  y: number
}

const velocity = (): Velocity => ({ sample: null, stationary: false, x: 0, y: 0 })

const record = (state: Velocity, offset: Point, time: number): void => {
  if (!Number.isFinite(time) || time <= 0) return
  const last = state.sample
  if (last !== null && time > last.time) {
    const stationary = Math.abs(offset.x - last.x) < minSampleDistance &&
      Math.abs(offset.y - last.y) < minSampleDistance
    const skip = stationary && !state.stationary
    state.stationary = stationary
    if (skip) return
    const duration = Math.max(time - last.time, minSampleDuration)
    state.x = (offset.x - last.x) / duration
    state.y = (offset.y - last.y) / duration
  }
  state.sample = { x: offset.x, y: offset.y, time }
}

const releaseVelocity = (state: Velocity, offset: Point, time: number): Point => {
  const last = state.sample
  if (last === null || !Number.isFinite(time) || time < last.time) return { x: state.x, y: state.y }
  const age = time - last.time
  if (age > maxSampleAge) return { x: 0, y: 0 }
  const duration = Math.max(age, minSampleDuration)
  const dx = offset.x - last.x
  const dy = offset.y - last.y
  return {
    x: Math.abs(dx) >= minSampleDistance ? dx / duration : state.x,
    y: Math.abs(dy) >= minSampleDistance ? dy / duration : state.y
  }
}

const damp = (delta: number, allowed: boolean): number => allowed ? delta : Math.sign(delta) * Math.abs(delta) ** 0.5

const snapMovement = (base: number, movement: number): number => {
  const next = base + movement
  return next >= 0 ? movement : -Math.sqrt(-next) - base
}

type Axis = "vertical" | "horizontal"

const axisOf = (direction: DrawerSwipeDirection): Axis => isHorizontal(direction) ? "horizontal" : "vertical"

const scrollable = (element: HTMLElement, axis: Axis): boolean => {
  const view = element.ownerDocument.defaultView
  if (view === null) return false
  const style = view.getComputedStyle(element)
  const overflow = axis === "vertical" ? style.overflowY : style.overflowX
  if (overflow !== "auto" && overflow !== "scroll") return false
  return axis === "vertical" ? element.scrollHeight > element.clientHeight : element.scrollWidth > element.clientWidth
}

const scrollableAncestor = (target: EventTarget | null, root: HTMLElement, axis: Axis): HTMLElement | null => {
  let node = target instanceof Element ? target : null
  while (node !== null && node !== root) {
    if (node instanceof HTMLElement && scrollable(node, axis)) return node
    node = node.parentElement
  }
  return null
}

const scrollTargetOf = (target: EventTarget | null, root: HTMLElement, axis: Axis): HTMLElement | null =>
  scrollableAncestor(target, root, axis) ?? (scrollable(root, axis) ? root : null)

const scrollMetrics = (element: HTMLElement, axis: Axis) =>
  axis === "vertical"
    ? { offset: element.scrollTop, max: Math.max(0, element.scrollHeight - element.clientHeight) }
    : { offset: element.scrollLeft, max: Math.max(0, element.scrollWidth - element.clientWidth) }

const fromStartEdge = (direction: DrawerSwipeDirection): boolean => direction === "down" || direction === "right"

const atSwipeEdge = (element: HTMLElement, direction: DrawerSwipeDirection): boolean => {
  const { max, offset } = scrollMetrics(element, axisOf(direction))
  return fromStartEdge(direction) ? offset <= 0 : offset >= max
}

const canSwipeFromEdge = (element: HTMLElement, direction: DrawerSwipeDirection, delta: number): boolean =>
  (fromStartEdge(direction) ? delta > 0 : delta < 0) && atSwipeEdge(element, direction)

const elementOf = (node: Node | null | undefined): Element | null =>
  node === null || node === undefined ? null : node instanceof Element ? node : node.parentElement

const selectedIn = (document: Document, root: HTMLElement): boolean => {
  const active = document.activeElement
  if (
    (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && root.contains(active)
  ) {
    try {
      const { selectionEnd, selectionStart } = active
      if (selectionStart !== null && selectionEnd !== null && selectionStart < selectionEnd) return true
    } catch {
      // An input type without a selection, such as a checkbox, throws.
    }
  }
  const selection = document.getSelection?.()
  if (selection === null || selection === undefined || selection.isCollapsed) return false
  return selection.containsNode(root, true) || root.contains(elementOf(selection.anchorNode)) ||
    root.contains(elementOf(selection.focusNode))
}

const onRange = (event: Event): boolean =>
  event.composedPath().some((target) => target instanceof HTMLInputElement && target.type === "range")

const transformOf = (element: HTMLElement): { readonly x: number; readonly y: number; readonly scale: number } => {
  const view = element.ownerDocument.defaultView
  const transform = view === null ? "none" : view.getComputedStyle(element).transform
  const matrix = transform !== undefined && transform !== "none" ? /matrix(?:3d)?\(([^)]+)\)/.exec(transform) : null
  if (matrix === null) return { x: 0, y: 0, scale: 1 }
  const values = matrix[1]!.split(",").map((value) => Number.parseFloat(value))
  if (values.length === 6) {
    return { x: values[4]!, y: values[5]!, scale: Math.sqrt(values[0]! * values[0]! + values[1]! * values[1]!) }
  }
  if (values.length === 16) return { x: values[12]!, y: values[13]!, scale: values[0]! }
  return { x: 0, y: 0, scale: 1 }
}

const setVar = (element: HTMLElement | null | undefined, name: string, value: string | null): void => {
  if (element === null || element === undefined) return
  if (value === null) element.style.removeProperty(name)
  else element.style.setProperty(name, value)
}

const byAttribute = (document: Document, name: string, id: string): HTMLElement | null =>
  document.querySelector<HTMLElement>("[" + name + "=\"" + CSS.escape(id) + "\"]")

const movementX = "--drawer-swipe-movement-x"
const movementY = "--drawer-swipe-movement-y"
const progressVar = "--drawer-swipe-progress"
const heightVar = "--drawer-height"

interface ProgressArgs {
  readonly drawerId: string
  readonly rest: number
  readonly nested: boolean
  readonly indent: string | null
  readonly open: boolean
}

const writeProgress = (document: Document, args: ProgressArgs, value: number | null, size = 0): void => {
  const height = value !== null && value > 0 && size > 0 ? size + "px" : null
  const backdrop = byAttribute(document, "data-drawer-backdrop", args.drawerId)
  setVar(backdrop, progressVar, String(value ?? args.rest))
  setVar(backdrop, heightVar, height)
  if (args.nested || args.indent === null) return
  const indent = document.getElementById(args.indent)
  setVar(indent, progressVar, String(value ?? (args.open ? args.rest : 0)))
  setVar(indent, heightVar, height)
}

const frame = (view: Window | null, f: () => void): void => {
  if (view !== null && typeof view.requestAnimationFrame === "function") view.requestAnimationFrame(f)
  else setTimeout(f, 0)
}

interface Frozen {
  readonly element: HTMLElement
  readonly transition: string
  readonly transform: string
}

const freeze = (element: HTMLElement, transform: string | null): Frozen => {
  const frozen = {
    element,
    transition: element.style.getPropertyValue("transition"),
    transform: element.style.getPropertyValue("transform")
  }
  element.style.setProperty("transition", "none")
  if (transform !== null) element.style.setProperty("transform", transform)
  return frozen
}

const thaw = (frozen: Frozen | null): void => {
  if (frozen === null) return
  setVar(frozen.element, "transition", frozen.transition === "" ? null : frozen.transition)
  setVar(frozen.element, "transform", frozen.transform === "" ? null : frozen.transform)
}

const TrackSwipeArgs = {
  drawerId: Schema.String,
  open: Schema.Boolean,
  direction: DrawerSwipeDirection,
  enabled: Schema.Boolean,
  snapping: Schema.Boolean,
  snapOffset: Schema.Number,
  snapMin: Schema.Number,
  snapRange: Schema.Number,
  height: Schema.Number,
  rest: Schema.Number,
  dismissed: Schema.Boolean,
  releases: Schema.Number,
  area: Schema.Boolean,
  nested: Schema.Boolean,
  indent: Schema.NullOr(Schema.String)
}

type TrackSwipeArgs = Schema.Struct<typeof TrackSwipeArgs>["Type"]

interface Gesture {
  readonly pointer: number | null
  start: Point
  startTime: number
  last: Point
  first: boolean
  active: boolean
  intended: DrawerSwipeDirection | null
  peak: number
  reversed: boolean
  initial: { readonly x: number; readonly y: number; readonly scale: number }
  movement: Point
  readonly velocity: Velocity
  frozen: Frozen | null
  listening: AbortController | null
}

interface TouchState {
  readonly startX: number
  readonly startY: number
  lastX: number
  lastY: number
  readonly scrollTarget: HTMLElement | null
  readonly cross: boolean
  allowSwipe: boolean | null
  yielded: boolean
  attributed: boolean
}

const TrackSwipe = Mount.makeStream(
  "TrackSwipe",
  { args: TrackSwipeArgs },
  (node: HTMLElement, initial, changes) =>
    Stream.callback<Message>((queue) =>
      Effect.gen(function*() {
        const document = node.ownerDocument
        const view = document.defaultView
        let args: TrackSwipeArgs = initial
        let gesture: Gesture | null = null
        let held: Gesture | null = null
        let pending: number | null = null
        let touch: TouchState | null = null
        let ignoreTouch = false
        let lastPointer = ""
        let measured = ""
        const send = (message: Message) => Queue.offerUnsafe(queue, message)
        const portal = () => node.closest("dialog")
        const axis = () => axisOf(args.direction)
        const directions = (): ReadonlyArray<DrawerSwipeDirection> =>
          args.snapping ? [args.direction, opposite[args.direction]] : [args.direction]
        const snapDown = () => args.snapping && args.direction === "down"
        const inOwn = (target: EventTarget | null): Element | null => {
          const element = elementOf(target as Node | null)
          return element !== null && node.contains(element) && element.closest("dialog") === portal() ? element : null
        }
        const viewport = (): HTMLElement | null => {
          const found = node.parentElement?.closest<HTMLElement>("[role=\"presentation\"]") ?? null
          return found !== null && portal()?.contains(found) === true ? found : null
        }
        const measure = () => {
          const root = document.documentElement
          const fontSize = Number.parseFloat(view?.getComputedStyle(root).fontSize ?? "") || 16
          const area = viewport()
          const sizes = {
            width: node.offsetWidth,
            height: node.offsetHeight,
            viewport: area !== null ? area.offsetHeight : root.clientHeight,
            fontSize
          }
          const key = sizes.width + " " + sizes.height + " " + sizes.viewport + " " + sizes.fontSize
          if (key === measured) return
          measured = key
          send(Message.Measured(sizes))
        }
        const progress = (value: number | null) => {
          writeProgress(document, args, value, node.offsetHeight)
        }
        const rest = () => {
          node.style.setProperty(movementX, "0px")
          node.style.setProperty(movementY, "0px")
        }
        const progressOf = (g: Gesture): number => {
          if (args.snapping && args.snapRange > 0 && args.height > 0) {
            const along = displacement(args.direction, g.movement.x, g.movement.y)
            return clamp((clamp(args.snapOffset + along, 0, args.height) - args.snapMin) / args.snapRange, 0, 1)
          }
          const direction = args.snapping ? g.intended : args.direction
          if (direction === null) return 0
          const size = (isHorizontal(direction) ? node.offsetWidth : node.offsetHeight) * (g.initial.scale || 1)
          const along = displacement(direction, g.movement.x, g.movement.y)
          return size > 0 && along > 0 ? clamp(along / size, 0, 1) : 0
        }
        const write = (g: Gesture) => {
          node.style.setProperty(movementX, g.movement.x + "px")
          node.style.setProperty(
            movementY,
            (snapDown() ? snapMovement(args.snapOffset, g.movement.y) : g.movement.y) + "px"
          )
        }
        const activate = (g: Gesture, touched: boolean) => {
          measure()
          g.active = true
          g.initial = transformOf(node)
          g.frozen = freeze(node, null)
          if (!touched) {
            const selection = document.getSelection?.()
            if (
              selection !== null && selection !== undefined && !selection.isCollapsed &&
              (node.contains(elementOf(selection.anchorNode)) || node.contains(elementOf(selection.focusNode)))
            ) selection.removeAllRanges()
          }
          send(Message.StartedSwipe())
        }
        const move = (g: Gesture, point: Point, time: number, touched: boolean) => {
          if (g.first) {
            g.first = false
            g.start = point
            g.startTime = time
            g.velocity.sample = null
            g.velocity.stationary = false
          }
          g.last = point
          const dx = point.x - g.start.x
          const dy = point.y - g.start.y
          const allowed = directions()
          if (g.intended === null && (dx !== 0 || dy !== 0)) {
            const candidate: DrawerSwipeDirection = Math.abs(dx) >= Math.abs(dy)
              ? (dx > 0 ? "right" : "left")
              : (dy > 0 ? "down" : "up")
            if (allowed.includes(candidate)) {
              g.intended = candidate
              g.peak = displacement(candidate, dx, dy)
            }
          } else if (g.intended !== null && !args.snapping) {
            const along = displacement(g.intended, dx, dy)
            const size = isHorizontal(g.intended) ? node.offsetWidth : node.offsetHeight
            g.peak = Math.max(g.peak, along)
            if (along > Math.max(size * 0.5, minSwipeThreshold)) g.reversed = false
            else if (g.peak - along >= reverseCancelThreshold) g.reversed = true
          }
          const horizontal = isHorizontal(args.direction)
          const movement = {
            x: horizontal ? damp(dx, allowed.includes(dx < 0 ? "left" : "right")) : 0,
            y: horizontal ? 0 : damp(dy, allowed.includes(dy < 0 ? "up" : "down"))
          }
          const changed = movement.x !== g.movement.x || movement.y !== g.movement.y
          g.movement = movement
          if (!g.active && movement.x === 0 && movement.y === 0) {
            record(g.velocity, movement, time)
            return
          }
          if (!g.active) activate(g, touched)
          if (changed) write(g)
          record(g.velocity, movement, time)
          progress(progressOf(g))
        }
        const end = (g: Gesture) => {
          gesture = null
          touch = null
          g.listening?.abort()
          if (g.pointer !== null && node.hasPointerCapture?.(g.pointer) === true) node.releasePointerCapture(g.pointer)
        }
        const release = (time: number) => {
          const g = gesture
          if (g === null) return
          end(g)
          if (!g.active) return
          const duration = time - g.startTime
          const span = duration > 0 ? Math.max(duration, minVelocityDuration) : 0
          const last = releaseVelocity(g.velocity, g.movement, time)
          held = g
          pending = args.releases + 1
          send(Message.ReleasedSwipe({
            direction: g.intended,
            reversed: g.reversed,
            deltaX: g.movement.x,
            deltaY: g.movement.y,
            velocityX: span > 0 ? g.movement.x / span : 0,
            velocityY: span > 0 ? g.movement.y / span : 0,
            releaseVelocityX: last.x,
            releaseVelocityY: last.y,
            width: node.offsetWidth,
            height: node.offsetHeight
          }))
        }
        const cancel = () => {
          const g = gesture
          if (g === null) return
          end(g)
          if (!g.active) return
          thaw(g.frozen)
          rest()
          progress(null)
          send(Message.CancelledSwipe())
        }
        const takeBack = () =>
          frame(view, () => {
            if (!args.open || !args.dismissed) return
            rest()
            send(Message.RefusedSwipe())
          })
        const decided = () => {
          pending = null
          thaw(held?.frozen ?? null)
          held = null
          progress(null)
          if (!args.dismissed) return rest()
          if (args.open) takeBack()
        }
        const canStart = (target: EventTarget | null): Element | null =>
          args.open && args.enabled && !args.area && gesture === null && pending === null ? inOwn(target) : null
        const begin = (point: Point, time: number, pointer: number | null, first: boolean): Gesture => {
          const g: Gesture = {
            pointer,
            start: point,
            startTime: time,
            last: point,
            first,
            active: false,
            intended: null,
            peak: 0,
            reversed: false,
            initial: { x: 0, y: 0, scale: 1 },
            movement: { x: 0, y: 0 },
            velocity: velocity(),
            frozen: null,
            listening: null
          }
          gesture = g
          return g
        }
        const onPointerMove = (event: PointerEvent) => {
          const g = gesture
          if (g === null || event.pointerId !== g.pointer) return
          event.preventDefault()
          move(g, { x: event.clientX, y: event.clientY }, event.timeStamp, false)
          if (event.buttons === 0) release(event.timeStamp)
        }
        const onPointerUp = (event: PointerEvent) => {
          if (gesture !== null && gesture.pointer === event.pointerId) release(event.timeStamp)
        }
        const onPointerDown = (event: PointerEvent) => {
          lastPointer = event.pointerType
          if (event.pointerType === "touch" || event.button !== 0 || event.defaultPrevented) return
          const target = canStart(event.target)
          if (target === null) return
          if (
            target.closest("[" + ignoreAttribute + "],[" + contentAttribute + "]," + interactive) !== null ||
            scrollableAncestor(target, node, axis()) !== null
          ) return
          const g = begin({ x: event.clientX, y: event.clientY }, event.timeStamp, event.pointerId, false)
          try {
            node.setPointerCapture?.(event.pointerId)
          } catch {
            // The pointer is already gone, as after a synthetic event.
          }
          g.listening = new AbortController()
          const { signal } = g.listening
          document.addEventListener("pointermove", onPointerMove, { signal })
          document.addEventListener("pointerup", onPointerUp, { signal })
          document.addEventListener("pointercancel", onPointerUp, { signal })
        }
        const cross = () => isHorizontal(args.direction) ? "y" : "x"
        const onTouchStart = (event: TouchEvent) => {
          touch = null
          ignoreTouch = false
          if (lastPointer === "pen") {
            lastPointer = ""
            return
          }
          const first = event.touches[0]
          const target = first === undefined ? null : canStart(event.target)
          if (first === undefined || target === null || onRange(event)) return
          const ignored = "[" + ignoreAttribute + "]:not([" + ignoreAttribute + "=\"" + cross() + "\"])"
          if (target.closest(ignored) !== null || selectedIn(document, node)) {
            ignoreTouch = true
            return
          }
          const scrollTarget = scrollTargetOf(target, node, axis())
          touch = {
            startX: first.clientX,
            startY: first.clientY,
            lastX: first.clientX,
            lastY: first.clientY,
            scrollTarget,
            cross: scrollTargetOf(target, node, isHorizontal(args.direction) ? "vertical" : "horizontal") !== null ||
              target.closest("[" + ignoreAttribute + "=\"" + cross() + "\"]") !== null,
            allowSwipe: scrollTarget !== null && !atSwipeEdge(scrollTarget, args.direction) ? false : null,
            yielded: false,
            attributed: false
          }
          begin({ x: first.clientX, y: first.clientY }, event.timeStamp, null, scrollTarget !== null)
        }
        const yields = (state: TouchState, event: TouchEvent, point: Touch): boolean => {
          if (state.yielded) return true
          if (state.attributed || state.allowSwipe === true || !state.cross) return false
          if (!event.cancelable) {
            state.yielded = true
            return true
          }
          const vertical = !isHorizontal(args.direction)
          const along = Math.abs(vertical ? point.clientY - state.startY : point.clientX - state.startX)
          const across = Math.abs(vertical ? point.clientX - state.startX : point.clientY - state.startY)
          if (across >= axisLockSlop && across > along + axisLockBias) {
            state.yielded = true
            return true
          }
          if (along >= axisLockSlop) {
            state.attributed = true
            return false
          }
          return true
        }
        const touchMove = (event: TouchEvent, state: TouchState, g: Gesture, point: Touch) => {
          if (event.touches.length === 2 || !args.enabled || selectedIn(document, node)) return
          if (yields(state, event, point)) return
          const at = { x: point.clientX, y: point.clientY }
          const target = state.scrollTarget
          if (target === null || target === document.documentElement || target === document.body) {
            if (event.cancelable) event.preventDefault()
            return move(g, at, event.timeStamp, true)
          }
          if (scrollMetrics(target, axis()).max <= 0) {
            if (event.cancelable) event.preventDefault()
            return
          }
          const delta = isHorizontal(args.direction) ? point.clientX - state.lastX : point.clientY - state.lastY
          if (delta !== 0) {
            if (state.allowSwipe !== true) {
              if (event.cancelable && canSwipeFromEdge(target, args.direction, delta)) {
                state.allowSwipe = true
                event.preventDefault()
              } else {
                state.allowSwipe = false
              }
            } else if (event.cancelable) {
              event.preventDefault()
            }
          }
          if (state.allowSwipe === true) move(g, at, event.timeStamp, true)
        }
        const onTouchMove = (event: TouchEvent) => {
          const state = touch
          const g = gesture
          const point = event.touches[0]
          if (ignoreTouch || state === null || g === null || g.pointer !== null || point === undefined) return
          touchMove(event, state, g, point)
          state.lastX = point.clientX
          state.lastY = point.clientY
        }
        const onTouchEnd = (event: TouchEvent) => {
          ignoreTouch = false
          if (gesture !== null && gesture.pointer === null) release(event.timeStamp)
        }
        let observer: ResizeObserver | undefined
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            node.addEventListener("pointerdown", onPointerDown)
            node.addEventListener("touchstart", onTouchStart, { passive: true })
            node.addEventListener("touchmove", onTouchMove, { passive: false })
            node.addEventListener("touchend", onTouchEnd)
            node.addEventListener("touchcancel", onTouchEnd)
            measure()
            if (typeof ResizeObserver === "function") {
              observer = new ResizeObserver(measure)
              observer.observe(node)
              const area = viewport()
              if (area !== null) observer.observe(area)
            }
            if (args.open && args.dismissed) send(Message.ShowedPopup())
            if (args.open && !args.area) writeProgress(document, args, null)
          }),
          () =>
            Effect.sync(() => {
              node.removeEventListener("pointerdown", onPointerDown)
              node.removeEventListener("touchstart", onTouchStart)
              node.removeEventListener("touchmove", onTouchMove)
              node.removeEventListener("touchend", onTouchEnd)
              node.removeEventListener("touchcancel", onTouchEnd)
              observer?.disconnect()
              const g = gesture ?? held
              if (g !== null) {
                g.listening?.abort()
                thaw(g.frozen)
              }
              writeProgress(document, { ...args, open: false }, null)
            })
        )
        yield* Stream.runForEach(changes, (next) =>
          Effect.sync(() => {
            const previous = args
            args = next
            if (gesture !== null && (!next.open || !next.enabled || next.area)) cancel()
            if (pending !== null && next.releases >= pending) decided()
            if (
              gesture === null && pending === null && !next.area &&
              (next.open !== previous.open || next.rest !== previous.rest || next.indent !== previous.indent)
            ) writeProgress(document, next, null)
            if (previous.area && !next.area && next.open && gesture === null) {
              if (next.dismissed) takeBack()
              else rest()
            }
            if (next.open && !previous.open) {
              if (!next.area) rest()
              if (next.dismissed) send(Message.ShowedPopup())
            }
          })).pipe(Effect.forkScoped)
      })
    )
)

const opensOnRelease = (moved: number, speed: number, size: number | null): boolean =>
  moved >= (size === null || size <= 0 ? fallbackOpenThreshold : size * openRatio) || speed >= openVelocityThreshold

const TrackSwipeAreaArgs = {
  key: Schema.String,
  drawerId: Schema.String,
  open: Schema.Boolean,
  direction: DrawerSwipeDirection,
  drawerDirection: DrawerSwipeDirection,
  disabled: Schema.Boolean,
  snapOffset: Schema.Number,
  rest: Schema.Number,
  nested: Schema.Boolean,
  indent: Schema.NullOr(Schema.String)
}

type TrackSwipeAreaArgs = Schema.Struct<typeof TrackSwipeAreaArgs>["Type"]

interface AreaGesture {
  readonly pointer: number | null
  readonly start: Point
  readonly velocity: Velocity
  moved: number
  started: boolean
  popup: HTMLElement | null
  size: number
  frozen: Frozen | null
  listening: AbortController | null
}

const TrackSwipeArea = Mount.makeStream(
  "TrackSwipeArea",
  { args: TrackSwipeAreaArgs },
  (node: HTMLElement, initial, changes) =>
    Stream.callback<Message>((queue) =>
      Effect.gen(function*() {
        const document = node.ownerDocument
        let args: TrackSwipeAreaArgs = initial
        let gesture: AreaGesture | null = null
        const send = (message: Message) => Queue.offerUnsafe(queue, message)
        const apply = (g: AreaGesture) => {
          if (!args.open || !g.started) return
          if (g.popup === null) {
            const popup = byAttribute(document, "data-drawer-popup", args.drawerId)
            if (popup === null) return
            g.popup = popup
            g.frozen = freeze(popup, null)
          }
          if (g.size <= 0) g.size = isHorizontal(args.drawerDirection) ? g.popup.offsetWidth : g.popup.offsetHeight
          const closed = Math.max(0, g.size - args.snapOffset)
          const remaining = closed - g.moved
          const offset = remaining >= 0 ? remaining : -Math.sqrt(-remaining)
          const signed = (args.drawerDirection === "down" || args.drawerDirection === "right" ? offset : -offset) + "px"
          const horizontal = isHorizontal(args.drawerDirection)
          g.popup.style.setProperty(movementX, horizontal ? signed : "0px")
          g.popup.style.setProperty(movementY, horizontal ? "0px" : signed)
          writeProgress(document, args, closed > 0 ? clamp(remaining / closed, 0, 1) : 0, g.popup.offsetHeight)
        }
        const finish = (g: AreaGesture) => {
          gesture = null
          g.listening?.abort()
          if (g.pointer !== null && node.hasPointerCapture?.(g.pointer) === true) node.releasePointerCapture(g.pointer)
          thaw(g.frozen)
          if (g.popup !== null) writeProgress(document, args, null)
        }
        const begin = (point: Point, time: number, pointer: number | null): AreaGesture | null => {
          if (args.disabled || args.open || gesture !== null) return null
          const g: AreaGesture = {
            pointer,
            start: point,
            velocity: velocity(),
            moved: 0,
            started: false,
            popup: null,
            size: 0,
            frozen: null,
            listening: null
          }
          record(g.velocity, { x: 0, y: 0 }, time)
          gesture = g
          return g
        }
        const move = (g: AreaGesture, point: Point, time: number) => {
          g.moved = displacement(args.direction, point.x - g.start.x, point.y - g.start.y)
          record(g.velocity, { x: g.moved, y: 0 }, time)
          if (!g.started) {
            if (g.moved < minOpenDistance) return
            g.started = true
            send(Message.StartedAreaSwipe({ key: args.key }))
          }
          apply(g)
        }
        const release = (g: AreaGesture, time: number) => {
          finish(g)
          if (!g.started) return
          send(Message.ReleasedAreaSwipe({
            displacement: g.moved,
            velocity: releaseVelocity(g.velocity, { x: g.moved, y: 0 }, time).x,
            size: g.popup === null ? null : g.size
          }))
        }
        const onPointerMove = (event: PointerEvent) => {
          const g = gesture
          if (g === null || g.pointer !== event.pointerId) return
          move(g, { x: event.clientX, y: event.clientY }, event.timeStamp)
          if (event.buttons === 0) release(g, event.timeStamp)
        }
        const onPointerUp = (event: PointerEvent) => {
          const g = gesture
          if (g !== null && g.pointer === event.pointerId) release(g, event.timeStamp)
        }
        const onPointerDown = (event: PointerEvent) => {
          if (event.pointerType === "touch" || event.button !== 0) return
          const g = begin({ x: event.clientX, y: event.clientY }, event.timeStamp, event.pointerId)
          if (g === null) return
          if (event.cancelable) event.preventDefault()
          try {
            node.setPointerCapture?.(event.pointerId)
          } catch {
            // The pointer is already gone, as after a synthetic event.
          }
          g.listening = new AbortController()
          const { signal } = g.listening
          document.addEventListener("pointermove", onPointerMove, { signal })
          document.addEventListener("pointerup", onPointerUp, { signal })
          document.addEventListener("pointercancel", onPointerUp, { signal })
        }
        const onTouchStart = (event: TouchEvent) => {
          const first = event.touches[0]
          if (first === undefined || event.touches.length > 1) return
          begin({ x: first.clientX, y: first.clientY }, event.timeStamp, null)
        }
        const onTouchMove = (event: TouchEvent) => {
          const g = gesture
          const point = event.touches[0]
          if (g === null || g.pointer !== null || point === undefined) return
          move(g, { x: point.clientX, y: point.clientY }, event.timeStamp)
          if (g.started && event.cancelable) event.preventDefault()
        }
        const onTouchEnd = (event: TouchEvent) => {
          const g = gesture
          if (g !== null && g.pointer === null) release(g, event.timeStamp)
        }
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            node.addEventListener("pointerdown", onPointerDown)
            node.addEventListener("touchstart", onTouchStart, { passive: true })
            node.addEventListener("touchmove", onTouchMove, { passive: false })
            node.addEventListener("touchend", onTouchEnd)
            node.addEventListener("touchcancel", onTouchEnd)
          }),
          () =>
            Effect.sync(() => {
              node.removeEventListener("pointerdown", onPointerDown)
              node.removeEventListener("touchstart", onTouchStart)
              node.removeEventListener("touchmove", onTouchMove)
              node.removeEventListener("touchend", onTouchEnd)
              node.removeEventListener("touchcancel", onTouchEnd)
              if (gesture !== null) finish(gesture)
            })
        )
        yield* Stream.runForEach(changes, (next) =>
          Effect.sync(() => {
            args = next
            const g = gesture
            if (g === null) return
            if (next.disabled) {
              finish(g)
              if (g.started) send(Message.CancelledAreaSwipe())
              return
            }
            apply(g)
          })).pipe(Effect.forkScoped)
      })
    )
)

const TrackKeyboard = Mount.makeStream("TrackDrawerKeyboard", { args: TrackKeyboardArgs }, trackKeyboard)

const ProviderMessage = UiSchema.TaggedEnum({
  ChangedOpen: { active: Schema.Boolean },
  MountedIndent: { id: Schema.String }
})

const ReportIndent = Mount.makeStream(
  "ReportIndent",
  { args: { id: Schema.String } },
  (_node: HTMLElement, args, changes) =>
    Stream.concat(Stream.succeed(args), changes).pipe(
      Stream.map(({ id }) => ProviderMessage.MountedIndent({ id }))
    )
)

const idOf = (builder: unknown): string | null => {
  const id = (builder as { readonly attrs?: Readonly<Record<string, string>> | undefined }).attrs?.id
  return id === undefined || id === "" ? null : id
}

/**
 * Scales the page behind the drawers below it, as a native sheet does.
 * Headless: call it with the consumer's `h` and a `view` closure that draws
 * the page with `provider.indent`.
 *
 * **Details**
 *
 * - `indent`: a `<div>` around the page. It gets `data-active` while a
 *   drawer below the provider is open, `data-inactive` otherwise, and a
 *   resting `--drawer-swipe-progress: 0`, or the backdrop's while an open
 *   drawer rests at a lower snap point. While a drawer is swiped, its
 *   `--drawer-swipe-progress` and `--drawer-height`, the height of the
 *   frontmost drawer, follow the finger. Give the element its `id` on the
 *   builder passed in, if it needs one.
 * - `indentBackground`: a `<div>` behind the indent, with the same
 *   `data-active` and `data-inactive`.
 * - `active`: whether a drawer below the provider is open.
 *
 * A drawer reports to the nearest provider above it. One without a provider
 * works as before.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const DrawerProvider = Component.define({
  name: "DrawerProvider",
  props: DrawerProviderProps,
  model: Schema.Struct({ active: Schema.Boolean, indent: Schema.NullOr(Schema.String) }),
  message: ProviderMessage,
  shares: {
    value: (model) => ({ indent: model.indent }),
    collects: {
      schema: Schema.Boolean,
      onChange: (reports) => ProviderMessage.ChangedOpen({ active: reports.some((open) => open) })
    }
  },
  elements: Html
}).make({
  init: () => ({ active: false, indent: null }),
  update: {
    ChangedOpen: (model, { active }) => ({ ...model, active }),
    MountedIndent: (model, { id }) => model.indent === id ? model : { ...model, indent: id }
  },
  parts: (model, p) => {
    const active = model.active
    const indentPart = p.part("div", (b, id: string) =>
      b
        .attr("id", id)
        .attr("data-active", flag(active))
        .attr("data-inactive", flag(!active))
        .forward((node) => node.attr("style", withStyle(node.attrs.style, progressVar + ":0")))
        .onMount(ReportIndent({ id })))
    const indent = View.wrapPart(
      indentPart,
      <B extends View.PartTarget<"div">>(element: B): ReturnType<B["attr"]> =>
        indentPart(element, idOf(element) ?? p.id("indent"))
    )
    const indentBackground = p.part(
      "div",
      (b) => b.attr("data-active", flag(active)).attr("data-inactive", flag(!active))
    )
    return { active, indent, indentBackground }
  }
})

const sizesOf = (model: Model): Sizes => ({ height: model.height, viewport: model.viewport, fontSize: model.fontSize })

const DrawerCore = Component.define({
  name: "Drawer",
  props: DrawerProps,
  model: Model,
  message: Message,
  events: DrawerEvents,
  shares: {
    value: (_, props) => ({ open: props.open }),
    collects: {
      schema: NestedReport,
      onChange: (reports) =>
        Message.ChangedNested({
          count: reports.reduce((sum, report) => sum + report.count, 0),
          swiping: reports.some((report) => report.swiping),
          height: reports.reduce((height, report) => report.height > 0 ? report.height : height, 0)
        })
    }
  },
  shared: {
    parent: {
      owner: "self",
      optional: true,
      report: (model, props) => ({
        count: props.open ? 1 + model.nestedOpen : 0,
        swiping: model.swiping || model.nestedSwiping,
        height: props.open ? frontmostOf(model) : 0
      })
    },
    provider: {
      owner: DrawerProvider,
      optional: true,
      report: (_, props) => props.open
    }
  },
  elements: Html
}).make({
  init: () => ({
    swiping: false,
    area: null,
    openedByArea: false,
    dismissed: false,
    strength: null,
    releases: 0,
    width: 0,
    height: 0,
    viewport: 0,
    fontSize: 16,
    nestedOpen: 0,
    nestedSwiping: false,
    nestedHeight: 0
  }),
  update: {
    StartedSwipe: (model) => ({ ...model, swiping: true }),
    ReleasedSwipe: (model, release, $) => {
      const next = { ...model, swiping: false, releases: model.releases + 1 }
      if (!$.props.open) return next
      const decision = decide($.props, snappingOf($.props, sizesOf(model)), release)
      switch (decision._tag) {
        case "Dismiss":
          return $.set({ ...next, dismissed: true, strength: decision.strength }).emit(
            DrawerEvents.Dismissed({ reason: "swipe" })
          )
        case "Snap":
          return $.set(next).emit(DrawerEvents.Snapped({ snapPoint: decision.snapPoint }))
        case "Settle":
          return next
      }
    },
    CancelledSwipe: (model) => ({ ...model, swiping: false }),
    RefusedSwipe: (model) => ({ ...model, dismissed: false, strength: null }),
    ShowedPopup: (model, _message, $) =>
      $.props.open && model.dismissed ? { ...model, dismissed: false, strength: null } : model,
    Measured: (model, sizes) => ({ ...model, ...sizes }),
    StartedAreaSwipe: (model, { key }, $) =>
      $.props.open || model.area !== null
        ? model
        : $.set({ ...model, area: key, openedByArea: true, dismissed: false, strength: null }).emit(
          DrawerEvents.Opened({ triggerId: null, reason: "swipe" })
        ),
    ReleasedAreaSwipe: (model, { displacement: moved, size, velocity: speed }, $) => {
      const next = { ...model, area: null, openedByArea: false }
      if (!$.props.open || opensOnRelease(moved, speed, size) || !model.openedByArea) return next
      return $.set({ ...next, dismissed: true, strength: null }).emit(DrawerEvents.Dismissed({ reason: "swipe" }))
    },
    CancelledAreaSwipe: (model) => ({ ...model, area: null, openedByArea: false }),
    ChangedNested: (model, { count, height, swiping }) => ({
      ...model,
      nestedOpen: count,
      nestedSwiping: swiping,
      nestedHeight: height
    })
  },
  parts: (model, p) => {
    const props = p.props
    const open = props.open
    const swipeDirection = props.swipeDirection ?? "down"
    const snapping = snappingOf(props, sizesOf(model))
    const rest = restingProgress(snapping)
    const drawerId = p.id("drawer")
    const swiping = model.swiping || model.area !== null
    const nested = p.shared.parent !== undefined
    const nestedDrawers = model.nestedOpen
    const nestedDrawerSwiping = model.nestedSwiping
    const indent = p.shared.provider?.indent ?? null
    const frontmost = frontmostOf(model)
    const active = props.snapPoint ?? props.snapPoints?.[0]
    const expanded = active === 1
    const swipeDismiss = model.dismissed && !open
    let areas = 0

    const popup = p.part("div", (b) =>
      b
        .attr("data-drawer-popup", drawerId)
        .attr("data-swiping", flag(swiping))
        .attr("data-swipe-direction", swipeDirection)
        .attr("data-swipe-dismiss", flag(swipeDismiss))
        .attr("data-expanded", flag(expanded))
        .attr("data-nested-drawer-open", flag(nestedDrawers > 0))
        .attr("data-nested-drawer-swiping", flag(nestedDrawerSwiping))
        .forward((node) =>
          node.attr(
            "style",
            withStyle(
              node.attrs.style,
              [
                "--nested-drawers:" + nestedDrawers,
                model.height > 0 ? heightVar + ":" + model.height + "px" : undefined,
                frontmost > 0 ? "--drawer-frontmost-height:" + frontmost + "px" : undefined,
                "--drawer-snap-point-offset:" + (snapping?.offset ?? 0) + "px",
                "--drawer-swipe-strength:" + (model.strength ?? 1),
                movementX + ":0px",
                movementY + ":0px"
              ].filter((entry) => entry !== undefined).join(";")
            )
          )
        )
        .onMount(TrackSwipe({
          drawerId,
          open,
          direction: swipeDirection,
          enabled: nestedDrawers === 0,
          snapping: snapping !== null,
          snapOffset: snapping?.offset ?? 0,
          snapMin: snapping?.min ?? 0,
          snapRange: snapping?.range ?? 0,
          height: model.height,
          rest,
          dismissed: model.dismissed,
          releases: model.releases,
          area: model.area !== null,
          nested,
          indent
        })))

    const backdrop = p.part("div", (b) =>
      b
        .attr("data-drawer-backdrop", drawerId)
        .attr("data-swiping", flag(swiping))
        .attr("data-swipe-dismiss", flag(swipeDismiss))
        .forward((node) => node.attr("style", withStyle(node.attrs.style, progressVar + ":" + rest))))

    const viewport = p.part("div", (b) =>
      props.virtualKeyboard === true
        ? b.onMount(TrackKeyboard({ open, modal: props.modal ?? true, popupId: drawerId }))
        : b)

    const content = p.part("div", (b) => b.attr(contentAttribute, ""))

    const swipeAreaPart = p.part(
      "div",
      (b, key: string, direction: DrawerSwipeDirection, disabled: boolean) => {
        const running = model.area === key
        return b
          .attr("role", "presentation")
          .attr("aria-hidden", "true")
          .attr("data-open", flag(open))
          .attr("data-closed", flag(!open))
          .attr("data-disabled", flag(disabled))
          .attr("data-swipe-direction", direction)
          .attr("data-swiping", flag(running))
          .forward((node) =>
            node.attr(
              "style",
              withStyle(
                node.attrs.style,
                "touch-action:" + (isHorizontal(direction) ? "pan-y" : "pan-x") +
                  (disabled || (open && !running) ? ";pointer-events:none" : "")
              )
            )
          )
          .onMount(TrackSwipeArea({
            key,
            drawerId,
            open,
            direction,
            drawerDirection: swipeDirection,
            disabled,
            snapOffset: snapping?.offset ?? 0,
            rest,
            nested,
            indent
          }))
      }
    )
    const swipeArea = View.wrapPart(
      swipeAreaPart,
      <B extends View.PartTarget<"div">>(options: {
        /** The area's element. */
        readonly element: B
        /** The direction a swipe on the area opens the drawer in. The opposite of the drawer's by default. */
        readonly swipeDirection?: DrawerSwipeDirection | undefined
        /** Whether a swipe on the area does nothing. */
        readonly disabled?: boolean | undefined
      }): ReturnType<B["attr"]> =>
        swipeAreaPart(
          options.element,
          p.id("swipe-area", areas++),
          options.swipeDirection ?? opposite[swipeDirection],
          options.disabled === true
        )
    )

    return {
      swiping,
      swipeDirection,
      expanded,
      nestedDrawers,
      nestedDrawerSwiping,
      popup,
      backdrop,
      viewport,
      content,
      swipeArea
    }
  }
})

type DialogParts = Component.Headless.Parts<typeof Dialog>
type CoreParts = Component.Headless.Parts<typeof DrawerCore>

/**
 * What a `Drawer`'s `view` gets: a `Dialog`'s parts and plain values, with
 * the drawer's on top.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DrawerParts = Omit<DialogParts, "popup" | "viewport"> & CoreParts & {
  readonly backdrop: DialogParts["backdrop"]
}

type Handlers<Msg> = View.Child.Options<DrawerProps, DrawerEvents, Msg>["onEmit"]

const handle = <Msg>(onEmit: Handlers<Msg>, event: DrawerEvents): Msg | undefined => {
  if (onEmit === undefined) return undefined
  if (typeof onEmit === "function") return onEmit(event)
  const handler = (onEmit as Record<string, ((event: DrawerEvents) => Msg | undefined) | undefined>)[event._tag]
  return handler?.(event)
}

const fromDialog = (event: DialogEvents): DrawerEvents =>
  event._tag === "Opened" ? DrawerEvents.Opened({ triggerId: event.triggerId, reason: "trigger-press" }) : event

const dialogPropsOf = (props: DrawerProps): DialogProps => {
  const {
    snapPoint: _snapPoint,
    snapPoints: _snapPoints,
    snapToSequentialPoints: _sequential,
    swipeDirection: _direction,
    virtualKeyboard: _keyboard,
    ...dialog
  } = props
  return dialog
}

/**
 * The type of `Drawer`: a call that draws a drawer from its parts, and the
 * component a `Scene` or a ref names.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DrawerComponent =
  & (<Msg, RV = never, RF = never>(
    h: View.Helper<Msg, unknown>,
    options:
      & View.Child.Options<DrawerProps, DrawerEvents, NoInfer<Msg>>
      & {
        /** Shown if the drawer fails, until its key changes. Without it, it is blank. */
        readonly fallback?:
          | ((result: AsyncResult.Failure<never, unknown>) => View.Content<NoInfer<Msg>, RF>)
          | undefined
        /** The drawer's whole view, from its parts. */
        readonly view: (parts: DrawerParts) => View.Content<NoInfer<Msg>, RV>
      }
  ) => ReturnType<typeof DrawerCore<Msg, RV, RF>>)
  & Omit<typeof DrawerCore, never>

// The call is the drawer's own, and the fields are the core component's, so
// a Scene, a ref or a provided copy treats the two as one component.
const asComponent = (call: (h: View.Helper<any, unknown>, options: any) => unknown): DrawerComponent => {
  Object.setPrototypeOf(call, Object.getPrototypeOf(DrawerCore))
  for (const key of Object.keys(DrawerCore)) {
    Object.defineProperty(call, key, {
      value: (DrawerCore as unknown as Record<string, unknown>)[key],
      enumerable: true,
      writable: true,
      configurable: true
    })
  }
  return call as DrawerComponent
}

/**
 * A headless drawer: a `Dialog` that slides in from an edge of the screen
 * and is swiped away. Call it as a `Dialog`, with the consumer's `h`, a `key`
 * when it needs one, `props`, `onEmit` and a `view` closure that draws it
 * from its parts.
 *
 * **Details**
 *
 * The parts stack on the `Dialog`'s: `drawer.popup`, `drawer.backdrop` and
 * `drawer.viewport` add the drawer's attributes and mounts to the
 * `Dialog`'s, and `drawer.content` and `drawer.swipeArea` are its own. The
 * popup carries the swipe's mount, so it can't take one of the consumer's.
 *
 * It renders a `Drawer` and a `Dialog` instance, so a `Scene` of the
 * consumer finds both: `childEmit(Drawer, event)` for a swipe's events and
 * `childEmit(Dialog, event)` for a trigger's, an outside press's or the
 * escape key's.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Drawer: DrawerComponent = asComponent((h, options) =>
  DrawerCore(h, {
    ...options,
    view: (drawer: CoreParts) =>
      Dialog(h, {
        key: options.key ?? options.ref?.key,
        props: dialogPropsOf(options.props),
        onEmit: (event: DialogEvents) => handle(options.onEmit, fromDialog(event)),
        view: (dialog) =>
          options.view({
            ...dialog,
            ...drawer,
            backdrop: <B extends View.PartTarget<"div">>(element: B) => {
              const out = dialog.backdrop(element)
              return out === undefined ? undefined : drawer.backdrop(out)
            },
            popup: <B extends View.PartTarget<"div">>(element: B) => drawer.popup(dialog.popup(element)),
            viewport: <B extends View.PartTarget<"div">>(element: B) => drawer.viewport(dialog.viewport(element))
          })
      })
  })
)
