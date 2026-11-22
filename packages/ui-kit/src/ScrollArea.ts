/**
 * A native scroll container with custom scrollbars, overflow state, and
 * edge-fade CSS variables.
 *
 * `ScrollArea` is a headless component: it keeps hover, per-axis scrolling,
 * and overflow state, measures the viewport and content, and handles scrollbar
 * wheel, track press, and thumb dragging. Your view supplies the markup and
 * styles.
 *
 * **Anatomy**
 *
 * | Part | Element |
 * | :-- | :-- |
 * | `root` | `<div>`, `role="presentation"`, `position: relative` |
 * | `viewport` | `<div>`, scrollable container (`overflow: scroll; scrollbar-width: none`) |
 * | `content` | `<div>`, `role="presentation"`, `min-width: fit-content` |
 * | `scrollbar` | `<div>` track with its `thumb` `<div>` placed inside as its first child |
 * | `corner` | `<div>` at the intersection of both scrollbars |
 *
 * `scrollbar` takes `{ element, thumb, orientation?, keepMounted? }`:
 * `element` is the track and `thumb` is the draggable handle placed inside it.
 * `orientation` defaults to `"vertical"`. `scrollbar` returns `undefined` when
 * that axis does not overflow unless `keepMounted` is `true`. `corner` returns
 * `undefined` unless both axes overflow.
 *
 * **Styling and CSS variables**
 *
 * The viewport sets `scrollbar-width: none` inline to hide native scrollbars in
 * modern browsers. On older WebKit versions that do not support
 * `scrollbar-width`, add a `::-webkit-scrollbar { display: none; }` rule in
 * your stylesheet.
 *
 * The mount writes these CSS custom properties directly to inline styles so
 * scrolling does not re-render:
 *
 * - `root`: `--scroll-area-corner-width`, `--scroll-area-corner-height`
 * - `viewport`: `--scroll-area-overflow-x-start`, `--scroll-area-overflow-x-end`,
 *   `--scroll-area-overflow-y-start`, `--scroll-area-overflow-y-end`
 * - `scrollbar`: `--scroll-area-thumb-height` (vertical) or
 *   `--scroll-area-thumb-width` (horizontal)
 *
 * On browsers that support `CSS.registerProperty` (except WebKit), the four
 * `--scroll-area-overflow-*` properties are registered with `inherits: false` so
 * updating them on scroll does not invalidate styles across the viewport
 * subtree or leak into nested scroll areas. Children inside the viewport that
 * want to read them can opt in with `--scroll-area-overflow-y-start: inherit`.
 * On WebKit, those properties still inherit, so an outer scroll area's values
 * can reach a nested one until it measures.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, except `data-orientation`:
 *
 * - `root`, `viewport`, `content`: `data-scrolling`, `data-has-overflow-x`,
 *   `data-has-overflow-y`, `data-overflow-x-start`, `data-overflow-x-end`,
 *   `data-overflow-y-start`, `data-overflow-y-end`
 * - `scrollbar`: `data-orientation` (`"vertical"` or `"horizontal"`),
 *   `data-hovering`, per-axis `data-scrolling`, and the overflow attributes above
 * - `thumb`: `data-orientation`, per-axis `data-scrolling`
 *
 * **Keyboard**
 *
 * `viewport` receives `tabindex="0"` when content overflows on either axis and
 * `tabindex="-1"` otherwise, so native keyboard scrolling (arrow keys, Page
 * Up/Down, Home/End, Space) works when focused.
 *
 * **Limits**
 *
 * - `root` carries the component's mount, so it cannot take a mount of your own.
 * - On the server, and on a host that does not run mounts, overflow is not
 *   measured.
 *
 * **Example** (A vertical scroll area with a custom scrollbar)
 *
 * ```ts import.meta.vitest
 * import { Component } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { ScrollArea } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const Panel = Component.define({
 *   name: "Panel",
 *   scoped: false,
 *   model: Schema.Struct({}),
 *   message: Schema.Never,
 *   elements: Html
 * }).make({
 *   init: () => ({}),
 *   update: (model) => model,
 *   view: (_model, h) =>
 *     ScrollArea(h, {
 *       view: (scrollArea) =>
 *         scrollArea.root(h.div.class("area")).children(
 *           scrollArea.viewport(h.div.class("viewport")).children(
 *             scrollArea.content(h.div.class("content")).children(h.p("Long text"))
 *           ),
 *           scrollArea.scrollbar({
 *             element: h.div.class("bar"),
 *             thumb: h.div.class("thumb"),
 *             keepMounted: true
 *           })
 *         )
 *     })
 * })
 *
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Panel, {}))
 * if (!html.includes('class="area"') || !html.includes('role="presentation"')) {
 *   throw new Error("expected scroll area markup")
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
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { type Attributed, attrSelector, flag, noSelect, ownStyle } from "./internal/attributes.ts"
import { override } from "./internal/dom.ts"
import { isWebKit } from "./internal/platform.ts"
import { clamp } from "./internal/range.ts"
import type { WithRequirements } from "./internal/requirements.ts"
import { finite } from "./internal/transition.ts"

const SCROLL_TIMEOUT = 500
const SCROLL_END_DEBOUNCE = 100
const MIN_THUMB_SIZE = 16
const SCROLL_EDGE_TOLERANCE_PX = 1

const viewportAttr = "data-scroll-area-viewport"
const contentAttr = "data-scroll-area-content"
const cornerAttr = "data-scroll-area-corner"

const cornerWidthVar = "--scroll-area-corner-width"
const cornerHeightVar = "--scroll-area-corner-height"
const thumbWidthVar = "--scroll-area-thumb-width"
const thumbHeightVar = "--scroll-area-thumb-height"
const overflowVars = [
  "--scroll-area-overflow-x-start",
  "--scroll-area-overflow-x-end",
  "--scroll-area-overflow-y-start",
  "--scroll-area-overflow-y-end"
] as const

/**
 * The orientation of a scrollbar.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const ScrollAreaOrientation = Schema.Literals(["vertical", "horizontal"])

/**
 * The orientation of a scrollbar.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ScrollAreaOrientation = typeof ScrollAreaOrientation.Type

const scrollbarAttr = (orientation: ScrollAreaOrientation): string =>
  orientation === "vertical" ? "data-scroll-area-scrollbar-y" : "data-scroll-area-scrollbar-x"

const thumbAttr = (orientation: ScrollAreaOrientation): string =>
  orientation === "vertical" ? "data-scroll-area-thumb-y" : "data-scroll-area-thumb-x"

/**
 * The threshold in pixels that must be passed before the overflow edge
 * attributes are applied. Pass a single number for all four edges or an object
 * to configure them individually.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const ScrollAreaOverflowEdgeThreshold = Schema.Union([
  Schema.Number,
  Schema.Struct({
    xStart: Schema.optional(Schema.Number),
    xEnd: Schema.optional(Schema.Number),
    yStart: Schema.optional(Schema.Number),
    yEnd: Schema.optional(Schema.Number)
  })
])

/**
 * The threshold in pixels that must be passed before the overflow edge
 * attributes are applied.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ScrollAreaOverflowEdgeThreshold = typeof ScrollAreaOverflowEdgeThreshold.Type

/**
 * Schema for {@link ScrollAreaProps}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const ScrollAreaProps = Schema.Struct({
  overflowEdgeThreshold: Schema.optional(ScrollAreaOverflowEdgeThreshold)
})

/**
 * The props of a {@link ScrollArea}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ScrollAreaProps = typeof ScrollAreaProps.Type

const Overflow = Schema.Struct({
  hasOverflowX: Schema.Boolean,
  hasOverflowY: Schema.Boolean,
  overflowXStart: Schema.Boolean,
  overflowXEnd: Schema.Boolean,
  overflowYStart: Schema.Boolean,
  overflowYEnd: Schema.Boolean
})

type Overflow = typeof Overflow.Type

const sameOverflow = Schema.toEquivalence(Overflow)

const noOverflow: Overflow = {
  hasOverflowX: false,
  hasOverflowY: false,
  overflowXStart: false,
  overflowXEnd: false,
  overflowYStart: false,
  overflowYEnd: false
}

const ScrollAreaModel = Schema.Struct({
  measured: Schema.Boolean,
  hovering: Schema.Boolean,
  scrollingX: Schema.Boolean,
  scrollingY: Schema.Boolean,
  ...Overflow.fields
})

type ScrollAreaModel = typeof ScrollAreaModel.Type

const ScrollAreaMessage = UiSchema.TaggedEnum({
  MeasuredOverflow: Overflow.fields,
  StartedScrolling: { orientation: ScrollAreaOrientation },
  StoppedScrolling: { orientation: ScrollAreaOrientation },
  EnteredPointer: {},
  LeftPointer: {}
})

type ScrollAreaMessage = typeof ScrollAreaMessage.Type

const thresholdsOf = (threshold: ScrollAreaOverflowEdgeThreshold | undefined) => {
  const t = typeof threshold === "number"
    ? { xStart: threshold, xEnd: threshold, yStart: threshold, yEnd: threshold }
    : threshold
  return {
    xStart: Math.max(0, t?.xStart || 0),
    xEnd: Math.max(0, t?.xEnd || 0),
    yStart: Math.max(0, t?.yStart || 0),
    yEnd: Math.max(0, t?.yEnd || 0)
  }
}

const normalizeScrollOffset = (value: number, max: number): number => {
  if (max <= 0) return 0
  const clamped = clamp(value, 0, max)
  const nearStart = clamped <= SCROLL_EDGE_TOLERANCE_PX
  const nearEnd = max - clamped <= SCROLL_EDGE_TOLERANCE_PX
  if (nearStart && nearEnd) return clamped <= max - clamped ? 0 : max
  if (nearStart) return 0
  if (nearEnd) return max
  return clamped
}

const applyOverscrollThumb = (
  thumb: HTMLElement,
  sizeVar: string,
  scrollFromStart: number,
  maxScroll: number,
  content: number,
  size: number,
  maxThumbOffset: number
): number => {
  const clamped = clamp(scrollFromStart, 0, maxScroll)
  const overscroll = scrollFromStart - clamped
  const nextSize = Math.max(MIN_THUMB_SIZE, (size * content) / (content + Math.abs(overscroll)))
  if (overscroll !== 0) thumb.style.setProperty(sizeVar, `${nextSize}px`)
  else thumb.style.removeProperty(sizeVar)
  const offset = maxScroll > 0 ? (clamped / maxScroll) * maxThumbOffset : 0
  return offset + (overscroll > 0 ? size - nextSize : 0)
}

const getOffset = (element: HTMLElement | null, prop: "margin" | "padding", vertical: boolean): number => {
  if (element === null) return 0
  const styles = element.ownerDocument.defaultView?.getComputedStyle(element)
  if (styles === undefined) return 0
  const key = `${prop}${vertical ? "Block" : "Inline"}` as const
  const start = Number.parseFloat(styles[`${key}Start`]) || 0
  // Safari misreports `marginInlineEnd` in RTL; assume symmetrical horizontal margins.
  if (!vertical && prop === "margin") return start * 2
  return start + (Number.parseFloat(styles[`${key}End`]) || 0)
}

const isRtl = (viewport: HTMLElement): boolean =>
  viewport.ownerDocument.defaultView?.getComputedStyle(viewport).direction === "rtl"

const registeredWindows = new WeakSet<Window>()

const registerOverflowVars = (view: Window | null): void => {
  // On WebKit, `inherits: false` breaks explicit `inherit` on children.
  if (view === null || registeredWindows.has(view) || isWebKit(view)) return
  registeredWindows.add(view)
  const css = (view as Window & { readonly CSS?: typeof CSS }).CSS
  if (css !== undefined && "registerProperty" in css) {
    for (const name of overflowVars) {
      try {
        css.registerProperty({ name, syntax: "<length>", inherits: false, initialValue: "0px" })
      } catch {}
    }
  }
}

const TrackScrollAreaArgs = {
  id: Schema.String,
  hasOverflowX: Schema.Boolean,
  hasOverflowY: Schema.Boolean,
  xStart: Schema.Number,
  xEnd: Schema.Number,
  yStart: Schema.Number,
  yEnd: Schema.Number
}

type TrackScrollAreaArgs = Schema.Struct<typeof TrackScrollAreaArgs>["Type"]

interface Axis {
  readonly orientation: ScrollAreaOrientation
  readonly vertical: boolean
  scrollbar: HTMLElement | null
  thumb: HTMLElement | null
  scrolling: boolean
  timer: ReturnType<typeof setTimeout> | undefined
  listening: AbortController | undefined
}

const axisOf = (orientation: ScrollAreaOrientation): Axis => ({
  orientation,
  vertical: orientation === "vertical",
  scrollbar: null,
  thumb: null,
  scrolling: false,
  timer: undefined,
  listening: undefined
})

const scrollOf = (axis: Axis, viewport: HTMLElement): number => axis.vertical ? viewport.scrollTop : viewport.scrollLeft

const setScroll = (axis: Axis, viewport: HTMLElement, value: number): void => {
  if (axis.vertical) viewport.scrollTop = value
  else viewport.scrollLeft = value
}

const maxScrollOf = (axis: Axis, viewport: HTMLElement): number =>
  axis.vertical ? viewport.scrollHeight - viewport.clientHeight : viewport.scrollWidth - viewport.clientWidth

const along = (axis: Axis, event: PointerEvent): number => axis.vertical ? event.clientY : event.clientX

const insetsOf = (axis: Axis, scrollbar: HTMLElement) => {
  const scrollbarOffset = getOffset(scrollbar, "padding", axis.vertical)
  const thumbOffset = getOffset(axis.thumb, "margin", axis.vertical)
  return {
    scrollbarOffset,
    thumbOffset,
    inset: scrollbarOffset + thumbOffset,
    track: axis.vertical ? scrollbar.offsetHeight : scrollbar.offsetWidth
  }
}

interface Track {
  readonly viewport: HTMLElement
  readonly scrollbar: HTMLElement
  readonly thumbOffset: number
  readonly scrollbarOffset: number
  readonly thumbSize: number
  readonly maxThumbOffset: number
  readonly maxScroll: number
}

const TrackScrollArea = Mount.makeStream(
  "TrackScrollArea",
  { args: TrackScrollAreaArgs },
  (root: HTMLElement, initial, changes) =>
    Stream.callback<ScrollAreaMessage>((queue) =>
      Effect.gen(function*() {
        registerOverflowVars(root.ownerDocument.defaultView)

        let args: TrackScrollAreaArgs = initial
        const send = (message: ScrollAreaMessage) => Queue.offerUnsafe(queue, message)
        const find = (attr: string) => root.querySelector<HTMLElement>(attrSelector(attr, args.id))

        const y = axisOf("vertical")
        const x = axisOf("horizontal")
        let viewport: HTMLElement | null = null
        let content: HTMLElement | null = null
        let corner: HTMLElement | null = null
        let viewportListening: AbortController | undefined
        const rootListening = new AbortController()

        let hovering = false
        let touchModality = false
        let programmaticScroll = true
        let lastLeft = 0
        let lastTop = 0
        let cornerWidth = 0
        let cornerHeight = 0
        let lastReport: Overflow | null = null
        let scrollEndTimer: ReturnType<typeof setTimeout> | undefined
        let animationTimer: ReturnType<typeof setTimeout> | undefined
        let restoreSnap: (() => void) | undefined
        let drag: {
          readonly pointerId: number
          readonly axis: Axis
          readonly start: number
          readonly startScroll: number
          readonly track: Track | null
        } | null = null
        let disposed = false

        const setHovering = (next: boolean) => {
          if (next === hovering) return
          hovering = next
          send(next ? ScrollAreaMessage.EnteredPointer() : ScrollAreaMessage.LeftPointer())
        }

        const stopScrolling = (axis: Axis) => {
          clearTimeout(axis.timer)
          axis.timer = undefined
          if (!axis.scrolling) return
          axis.scrolling = false
          send(ScrollAreaMessage.StoppedScrolling({ orientation: axis.orientation }))
        }

        const startScrolling = (axis: Axis) => {
          if (!axis.scrolling) {
            axis.scrolling = true
            send(ScrollAreaMessage.StartedScrolling({ orientation: axis.orientation }))
          }
          clearTimeout(axis.timer)
          axis.timer = setTimeout(() => stopScrolling(axis), SCROLL_TIMEOUT)
        }

        const reportScroll = () => {
          if (viewport === null) return
          const { scrollLeft, scrollTop } = viewport
          if (scrollTop !== lastTop) startScrolling(y)
          if (scrollLeft !== lastLeft) startScrolling(x)
          lastLeft = scrollLeft
          lastTop = scrollTop
        }

        // Scroll snap would quantize the drag's scroll positions back to snap points.
        const disableViewportSnap = () => {
          if (viewport !== null) restoreSnap ??= override(viewport, { "scroll-snap-type": "none" })
        }

        const restoreViewportSnap = () => {
          restoreSnap?.()
          restoreSnap = undefined
        }

        const report = (overflow: Overflow) => {
          if (lastReport !== null && sameOverflow(lastReport, overflow)) return
          lastReport = overflow
          send(ScrollAreaMessage.MeasuredOverflow(overflow))
        }

        const measure = () => {
          if (disposed) return
          sync()
          if (viewport === null) return
          const { clientHeight, clientWidth, scrollHeight, scrollLeft, scrollTop, scrollWidth } = viewport
          if (scrollHeight === 0 || scrollWidth === 0) return report(noOverflow)

          const rtl = isRtl(viewport)
          const both = clientWidth < scrollWidth && clientHeight < scrollHeight
          const nextCornerWidth = both ? y.scrollbar?.offsetWidth || 0 : 0
          const nextCornerHeight = both ? x.scrollbar?.offsetHeight || 0 : 0
          const cornerUnsized = cornerWidth === 0 && cornerHeight === 0

          const edges = (axis: Axis) => {
            const vertical = axis.vertical
            const client = vertical ? clientHeight : clientWidth
            const size = vertical ? scrollHeight : scrollWidth
            const overflow = client < size
            const maxScroll = Math.max(0, size - client)
            const fromStart = vertical ? scrollTop : rtl ? -scrollLeft : scrollLeft
            const start = overflow ? normalizeScrollOffset(fromStart, maxScroll) : 0
            const { scrollbar, thumb } = axis
            if (scrollbar !== null) {
              const { inset, track } = insetsOf(axis, scrollbar)
              const cornerOffset = cornerUnsized ? (vertical ? nextCornerHeight : nextCornerWidth) : 0
              const length = Math.min(track - cornerOffset, (overflow ? client : 0) - inset)
              const thumbSize = Math.max(MIN_THUMB_SIZE, (length * client) / size)
              const sizeVar = vertical ? thumbHeightVar : thumbWidthVar
              scrollbar.style.setProperty(sizeVar, `${thumbSize}px`)
              if (thumb !== null) {
                const maxThumbOffset = track - thumbSize - inset
                const offset = applyOverscrollThumb(
                  thumb,
                  sizeVar,
                  fromStart,
                  maxScroll,
                  size,
                  thumbSize,
                  maxThumbOffset
                )
                thumb.style.transform = vertical
                  ? `translate3d(0,${offset}px,0)`
                  : `translate3d(${rtl ? -offset : offset}px,0,0)`
              }
            }
            return { overflow, start, end: overflow ? maxScroll - start : 0 }
          }

          const edgesX = edges(x)
          const edgesY = edges(y)
          const metrics = [edgesX.start, edgesX.end, edgesY.start, edgesY.end]
          overflowVars.forEach((name, i) => viewport!.style.setProperty(name, `${metrics[i]}px`))

          if ((corner !== null || !both) && (nextCornerWidth !== cornerWidth || nextCornerHeight !== cornerHeight)) {
            cornerWidth = nextCornerWidth
            cornerHeight = nextCornerHeight
            root.style.setProperty(cornerWidthVar, `${cornerWidth}px`)
            root.style.setProperty(cornerHeightVar, `${cornerHeight}px`)
          }

          report({
            hasOverflowX: edgesX.overflow,
            hasOverflowY: edgesY.overflow,
            overflowXStart: edgesX.start > args.xStart,
            overflowXEnd: edgesX.end > args.xEnd,
            overflowYStart: edgesY.start > args.yStart,
            overflowYEnd: edgesY.end > args.yEnd
          })
        }

        const startDrag = (axis: Axis, event: PointerEvent) => {
          // A live drag holds capture; without it, the release went missing and a new press takes over.
          if (drag !== null && drag.axis.thumb?.hasPointerCapture?.(drag.pointerId) === true) return
          drag = {
            pointerId: event.pointerId,
            axis,
            start: along(axis, event),
            startScroll: viewport === null ? 0 : scrollOf(axis, viewport),
            track: trackOf(axis)
          }
          disableViewportSnap()
          try {
            axis.thumb?.setPointerCapture?.(event.pointerId)
          } catch {}
        }

        const clearDrag = () => {
          if (drag === null) return
          const { axis, pointerId } = drag
          drag = null
          stopScrolling(axis)
          restoreViewportSnap()
          if (axis.thumb?.hasPointerCapture?.(pointerId) === true) {
            axis.thumb.releasePointerCapture(pointerId)
          }
        }

        const endDrag = (event: PointerEvent) => {
          if (drag !== null && event.pointerId === drag.pointerId) clearDrag()
        }

        const trackOf = (axis: Axis): Track | null => {
          const { scrollbar, thumb } = axis
          if (viewport === null || scrollbar === null || thumb === null) return null
          const { inset, scrollbarOffset, thumbOffset, track } = insetsOf(axis, scrollbar)
          const thumbSize = axis.vertical ? thumb.offsetHeight : thumb.offsetWidth
          return {
            viewport,
            scrollbar,
            thumbOffset,
            scrollbarOffset,
            thumbSize,
            maxThumbOffset: track - thumbSize - inset,
            maxScroll: maxScrollOf(axis, viewport)
          }
        }

        const onPointerDown = (axis: Axis) => (event: PointerEvent) => {
          if (event.button !== 0) return
          if (axis.thumb?.contains(event.target as Node | null) !== true) {
            const track = trackOf(axis)
            if (track === null || track.maxThumbOffset <= 0) return
            const rect = track.scrollbar.getBoundingClientRect()
            const at = along(axis, event) - (axis.vertical ? rect.top : rect.left) - track.thumbSize / 2 -
              track.scrollbarOffset + track.thumbOffset / 2
            const ratio = at / track.maxThumbOffset
            disableViewportSnap()
            setScroll(
              axis,
              track.viewport,
              !axis.vertical && isRtl(track.viewport) ? -(1 - ratio) * track.maxScroll : ratio * track.maxScroll
            )
            reportScroll()
          }
          startDrag(axis, event)
        }

        const onPointerMove = (event: PointerEvent) => {
          if (drag === null || event.pointerId !== drag.pointerId) return
          // The primary button is up, so the release went missing.
          if (event.buttons % 2 === 0) return endDrag(event)
          const { track } = drag
          if (track === null) return
          const ratio = track.maxThumbOffset <= 0 ? 0 : (along(drag.axis, event) - drag.start) / track.maxThumbOffset
          setScroll(drag.axis, track.viewport, drag.startScroll + ratio * track.maxScroll)
          event.preventDefault()
          startScrolling(drag.axis)
        }

        const onWheel = (axis: Axis) => (event: WheelEvent) => {
          if (viewport === null || event.ctrlKey) return
          const delta = axis.vertical ? event.deltaY : event.deltaX
          if (delta === 0) return
          const maxScroll = maxScrollOf(axis, viewport)
          const rtl = !axis.vertical && isRtl(viewport)
          const min = rtl ? -maxScroll : 0
          const max = rtl ? 0 : maxScroll
          const value = scrollOf(axis, viewport)
          if ((value <= min && delta < 0) || (value >= max && delta > 0)) return
          event.preventDefault()
          setScroll(axis, viewport, clamp(value + delta, min, max))
          reportScroll()
        }

        const onUserInteraction = () => {
          programmaticScroll = false
        }

        const onViewportScroll = () => {
          measure()
          if (touchModality || !programmaticScroll) reportScroll()
          else if (viewport !== null) {
            lastLeft = viewport.scrollLeft
            lastTop = viewport.scrollTop
          }
          clearTimeout(scrollEndTimer)
          scrollEndTimer = setTimeout(() => {
            programmaticScroll = true
          }, SCROLL_END_DEBOUNCE)
        }

        const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)

        const observe = (current: HTMLElement | null, next: HTMLElement | null) => {
          if (current !== null) resizeObserver?.unobserve(current)
          if (next !== null) resizeObserver?.observe(next)
          return next
        }

        const sync = () => {
          const nextViewport = find(viewportAttr)
          if (nextViewport !== viewport) {
            viewportListening?.abort()
            viewport = observe(viewport, nextViewport)
            if (viewport !== null) {
              viewportListening = new AbortController()
              const options = { signal: viewportListening.signal, passive: true }
              viewport.addEventListener("scroll", onViewportScroll, options)
              for (const name of ["wheel", "pointermove", "pointerenter", "keydown"]) {
                viewport.addEventListener(name, onUserInteraction, options)
              }
            }
          }
          const nextContent = find(contentAttr)
          if (nextContent !== content) content = observe(content, nextContent)
          corner = find(cornerAttr)
          for (const axis of [y, x]) {
            const thumb = find(thumbAttr(axis.orientation))
            const scrollbar = find(scrollbarAttr(axis.orientation))
            if (drag !== null && drag.axis === axis && (scrollbar !== axis.scrollbar || thumb !== axis.thumb)) {
              clearDrag()
            }
            axis.thumb = thumb
            if (scrollbar === axis.scrollbar) continue
            axis.listening?.abort()
            axis.scrollbar = scrollbar
            if (scrollbar === null) continue
            axis.listening = new AbortController()
            const { signal } = axis.listening
            scrollbar.addEventListener("wheel", onWheel(axis), { signal, passive: false })
            scrollbar.addEventListener("pointerdown", onPointerDown(axis), { signal })
            scrollbar.addEventListener("pointermove", onPointerMove, { signal })
            scrollbar.addEventListener("pointerup", endDrag, { signal })
            scrollbar.addEventListener("pointercancel", endDrag, { signal })
            // A native scrollbar doesn't take focus when pressed.
            scrollbar.addEventListener("mousedown", (event) => event.preventDefault(), { signal })
          }
        }

        const onRootPointer = (event: PointerEvent) => {
          touchModality = event.pointerType === "touch"
          if (event.type !== "pointerdown" && !touchModality) setHovering(root.contains(event.target as Node | null))
        }

        const { signal } = rootListening
        for (const name of ["pointerdown", "pointerenter", "pointermove"] as const) {
          root.addEventListener(name, onRootPointer, { signal })
        }
        root.addEventListener("pointerleave", () => setHovering(false), { signal })
        root.style.setProperty(cornerWidthVar, "0px")
        root.style.setProperty(cornerHeightVar, "0px")

        measure()

        const initialViewport = viewport as HTMLElement | null
        if (initialViewport !== null) {
          try {
            if (initialViewport.matches(":hover")) setHovering(true)
          } catch {}
          animationTimer = setTimeout(() => {
            if (disposed || typeof initialViewport.getAnimations !== "function") return
            const animations = initialViewport.getAnimations({ subtree: true }).filter(finite)
            if (animations.length === 0) return
            Promise.allSettled(animations.map((animation) => animation.finished.then(() => undefined)))
              .then(measure)
              .catch(() => {})
          }, 0)
        }

        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            disposed = true
            resizeObserver?.disconnect()
            for (const timer of [x.timer, y.timer, scrollEndTimer, animationTimer]) clearTimeout(timer)
            restoreViewportSnap()
            for (const listening of [rootListening, viewportListening, x.listening, y.listening]) listening?.abort()
          })
        )

        yield* Stream.runForEach(changes, (next) =>
          Effect.sync(() => {
            args = next
            measure()
          })).pipe(Effect.forkScoped)
      })
    )
)

type ScrollbarOf<B extends View.PartTarget<"div">, T extends View.PartTarget<"div">> = WithRequirements<
  ReturnType<B["attr"]>,
  View.Requirements<T>
>

const overflowData = <B extends Attributed<B>>(builder: B, model: ScrollAreaModel): B =>
  builder
    .attr("data-has-overflow-x", flag(model.hasOverflowX))
    .attr("data-has-overflow-y", flag(model.hasOverflowY))
    .attr("data-overflow-x-start", flag(model.overflowXStart))
    .attr("data-overflow-x-end", flag(model.overflowXEnd))
    .attr("data-overflow-y-start", flag(model.overflowYStart))
    .attr("data-overflow-y-end", flag(model.overflowYEnd))

/**
 * A headless scroll area. Call it with the consumer's `h`, optional `props`,
 * and a `view` closure that draws `root`, `viewport`, `content`, one or two
 * `scrollbar` parts, and an optional `corner`.
 *
 * **Details**
 *
 * The parts object also carries `scrolling`, `scrollingX`, `scrollingY`,
 * `hovering`, `hasOverflowX`, `hasOverflowY`, `overflowXStart`,
 * `overflowXEnd`, `overflowYStart`, `overflowYEnd`, and `cornerHidden` for
 * markup that depends on state.
 *
 * `scrollbar({ element, thumb, orientation?, keepMounted? })` returns
 * `element` with `thumb` placed inside as its first child, or `undefined` when
 * that axis does not overflow unless `keepMounted` is `true`. `corner` returns
 * `undefined` unless both axes overflow. Both validate their element tags
 * before deciding whether to return `undefined`.
 *
 * The component's own attributes win over those set on a builder before the
 * part: `role` on `root` and `content`, `tabindex` on `viewport`,
 * `aria-hidden` on `scrollbar` and `corner`, and the data attributes on every
 * part. Layout and sizing inline styles are appended after the consumer's
 * inline `style`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const ScrollArea = Component.define({
  name: "ScrollArea",
  scoped: false,
  props: ScrollAreaProps,
  model: ScrollAreaModel,
  message: ScrollAreaMessage,
  elements: Html
}).make({
  init: () => ({ measured: false, hovering: false, scrollingX: false, scrollingY: false, ...noOverflow }),
  update: {
    MeasuredOverflow: (model, overflow) => ({
      ...model,
      measured: true,
      hasOverflowX: overflow.hasOverflowX,
      hasOverflowY: overflow.hasOverflowY,
      overflowXStart: overflow.overflowXStart,
      overflowXEnd: overflow.overflowXEnd,
      overflowYStart: overflow.overflowYStart,
      overflowYEnd: overflow.overflowYEnd
    }),
    StartedScrolling: (model, { orientation }) =>
      orientation === "vertical" ? { ...model, scrollingY: true } : { ...model, scrollingX: true },
    StoppedScrolling: (model, { orientation }) =>
      orientation === "vertical" ? { ...model, scrollingY: false } : { ...model, scrollingX: false },
    EnteredPointer: (model) => ({ ...model, hovering: true }),
    LeftPointer: (model) => ({ ...model, hovering: false })
  },
  parts: (model, p) => {
    const id = p.id("scroll-area")
    const scrolling = model.scrollingX || model.scrollingY
    const cornerHidden = !model.hasOverflowX || !model.hasOverflowY
    const scrollingOn = (orientation: ScrollAreaOrientation) =>
      flag(orientation === "vertical" ? model.scrollingY : model.scrollingX)
    const areaState = <B extends Attributed<B>>(builder: B): B =>
      overflowData(builder, model).attr("data-scrolling", flag(scrolling))

    const thumbPart = p.part("div", (b, orientation: ScrollAreaOrientation) =>
      b
        .attr("data-orientation", orientation)
        .attr("data-scrolling", scrollingOn(orientation))
        .attr(thumbAttr(orientation), id)
        .forward(ownStyle(
          (orientation === "vertical" ? `height:var(${thumbHeightVar})` : `width:var(${thumbWidthVar})`) +
            (model.measured ? "" : ";visibility:hidden")
        )))

    const scrollbarPart = p.part(
      "div",
      (b, orientation: ScrollAreaOrientation, thumb: View.Content<unknown, any>) =>
        overflowData(b, model)
          .attr("aria-hidden", "true")
          .attr("data-orientation", orientation)
          .attr("data-hovering", flag(model.hovering))
          .attr("data-scrolling", scrollingOn(orientation))
          .attr(scrollbarAttr(orientation), id)
          .forward(ownStyle(
            `position:absolute;touch-action:none;${noSelect};` + (orientation === "vertical"
              ? `top:0;bottom:var(${cornerHeightVar},0px);inset-inline-end:0`
              : `inset-inline-start:0;inset-inline-end:var(${cornerWidthVar},0px);bottom:0`)
          ))
          .children(thumb as never)
    )

    const cornerPart = p.part("div", (b) =>
      b
        .attr("aria-hidden", "true")
        .attr(cornerAttr, id)
        .forward(ownStyle(
          `position:absolute;bottom:0;inset-inline-end:0;width:var(${cornerWidthVar},0px);height:var(${cornerHeightVar},0px)`
        )))

    return {
      scrolling,
      scrollingX: model.scrollingX,
      scrollingY: model.scrollingY,
      hovering: model.hovering,
      hasOverflowX: model.hasOverflowX,
      hasOverflowY: model.hasOverflowY,
      overflowXStart: model.overflowXStart,
      overflowXEnd: model.overflowXEnd,
      overflowYStart: model.overflowYStart,
      overflowYEnd: model.overflowYEnd,
      cornerHidden,
      root: p.part("div", (b) =>
        areaState(b)
          .attr("role", "presentation")
          .onMount(TrackScrollArea({
            id,
            hasOverflowX: model.hasOverflowX,
            hasOverflowY: model.hasOverflowY,
            ...thresholdsOf(p.props.overflowEdgeThreshold)
          }))
          .forward(ownStyle("position:relative"))),
      viewport: p.part("div", (b) =>
        areaState(b)
          .attr("tabindex", model.hasOverflowX || model.hasOverflowY ? "0" : "-1")
          .attr(viewportAttr, id)
          .forward(ownStyle("overflow:scroll;scrollbar-width:none"))),
      content: p.part("div", (b) =>
        areaState(b)
          .attr("role", "presentation")
          .attr(contentAttr, id)
          .forward(ownStyle("min-width:fit-content"))),
      scrollbar: View.wrapPart(
        scrollbarPart,
        <B extends View.PartTarget<"div">, T extends View.PartTarget<"div">>(
          { element, keepMounted = false, orientation = "vertical", thumb }: {
            readonly element: B
            readonly thumb: T
            readonly orientation?: ScrollAreaOrientation | undefined
            readonly keepMounted?: boolean | undefined
          }
        ): ScrollbarOf<B, T> | undefined => {
          const built = scrollbarPart(element, orientation, thumbPart(thumb, orientation)) as ScrollbarOf<B, T>
          return keepMounted || (orientation === "vertical" ? model.hasOverflowY : model.hasOverflowX)
            ? built
            : undefined
        }
      ),
      corner: View.wrapPart(
        cornerPart,
        <B extends View.PartTarget<"div">>(element: B): ReturnType<B["attr"]> | undefined => {
          const built = cornerPart(element) as ReturnType<B["attr"]>
          return cornerHidden ? undefined : built
        }
      )
    }
  }
})
