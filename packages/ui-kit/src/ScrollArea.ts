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
import { attrSelector, flag, noSelect, withStyle } from "./internal/attributes.ts"
import { isWebKit } from "./internal/platform.ts"

const SCROLL_TIMEOUT = 500
const SCROLL_END_DEBOUNCE = 100
const MIN_THUMB_SIZE = 16
const SCROLL_EDGE_TOLERANCE_PX = 1

const viewportAttr = "data-scroll-area-viewport"
const contentAttr = "data-scroll-area-content"
const scrollbarYAttr = "data-scroll-area-scrollbar-y"
const scrollbarXAttr = "data-scroll-area-scrollbar-x"
const thumbYAttr = "data-scroll-area-thumb-y"
const thumbXAttr = "data-scroll-area-thumb-x"
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

const Model = Schema.Struct({
  measured: Schema.Boolean,
  hovering: Schema.Boolean,
  scrollingX: Schema.Boolean,
  scrollingY: Schema.Boolean,
  hasOverflowX: Schema.Boolean,
  hasOverflowY: Schema.Boolean,
  overflowXStart: Schema.Boolean,
  overflowXEnd: Schema.Boolean,
  overflowYStart: Schema.Boolean,
  overflowYEnd: Schema.Boolean
})

const Message = UiSchema.TaggedEnum({
  MeasuredOverflow: {
    hasOverflowX: Schema.Boolean,
    hasOverflowY: Schema.Boolean,
    overflowXStart: Schema.Boolean,
    overflowXEnd: Schema.Boolean,
    overflowYStart: Schema.Boolean,
    overflowYEnd: Schema.Boolean
  },
  StartedScrolling: { orientation: ScrollAreaOrientation },
  StoppedScrolling: { orientation: ScrollAreaOrientation },
  EnteredPointer: {},
  LeftPointer: {}
})

type Message = typeof Message.Type

interface Thresholds {
  readonly xStart: number
  readonly xEnd: number
  readonly yStart: number
  readonly yEnd: number
}

const normalizeThreshold = (threshold: ScrollAreaOverflowEdgeThreshold | undefined): Thresholds => {
  if (typeof threshold === "number") {
    const value = Math.max(0, threshold || 0)
    return { xStart: value, xEnd: value, yStart: value, yEnd: value }
  }
  return {
    xStart: Math.max(0, threshold?.xStart || 0),
    xEnd: Math.max(0, threshold?.xEnd || 0),
    yStart: Math.max(0, threshold?.yStart || 0),
    yEnd: Math.max(0, threshold?.yEnd || 0)
  }
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const normalizeScrollOffset = (value: number, max: number): number => {
  if (max <= 0) return 0
  const clamped = clamp(value, 0, max)
  const startDistance = clamped
  const endDistance = max - clamped
  const nearStart = startDistance <= SCROLL_EDGE_TOLERANCE_PX
  const nearEnd = endDistance <= SCROLL_EDGE_TOLERANCE_PX
  if (nearStart && nearEnd) return startDistance <= endDistance ? 0 : max
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

const getOffset = (element: HTMLElement | null, prop: "margin" | "padding", axis: "x" | "y"): number => {
  if (element === null) return 0
  const styles = element.ownerDocument.defaultView?.getComputedStyle(element)
  if (styles === undefined) return 0
  const key = `${prop}${axis === "x" ? "Inline" : "Block"}` as const
  const start = Number.parseFloat(styles[`${key}Start`]) || 0
  // Safari misreports `marginInlineEnd` in RTL; assume symmetrical horizontal margins.
  if (axis === "x" && prop === "margin") return start * 2
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

const find = (root: HTMLElement, attr: string, id: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(attrSelector(attr, id))

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

interface OverflowReport {
  readonly hasOverflowX: boolean
  readonly hasOverflowY: boolean
  readonly overflowXStart: boolean
  readonly overflowXEnd: boolean
  readonly overflowYStart: boolean
  readonly overflowYEnd: boolean
}

const sameReport = (a: OverflowReport | null, b: OverflowReport): boolean =>
  a !== null &&
  a.hasOverflowX === b.hasOverflowX &&
  a.hasOverflowY === b.hasOverflowY &&
  a.overflowXStart === b.overflowXStart &&
  a.overflowXEnd === b.overflowXEnd &&
  a.overflowYStart === b.overflowYStart &&
  a.overflowYEnd === b.overflowYEnd

const TrackScrollArea = Mount.makeStream(
  "TrackScrollArea",
  { args: TrackScrollAreaArgs },
  (root: HTMLElement, initial, changes) =>
    Stream.callback<Message>((queue) =>
      Effect.gen(function*() {
        const view = root.ownerDocument.defaultView
        registerOverflowVars(view)

        let args: TrackScrollAreaArgs = initial
        const send = (message: Message) => Queue.offerUnsafe(queue, message)

        let hovering = false
        let touchModality = false
        let programmaticScroll = true
        let scrollingX = false
        let scrollingY = false
        let scrollPosX = 0
        let scrollPosY = 0
        let cornerWidth = 0
        let cornerHeight = 0
        let lastReport: OverflowReport | null = null
        let lastMetrics: [number, number, number, number] = [NaN, NaN, NaN, NaN]

        let timerX: ReturnType<typeof setTimeout> | null = null
        let timerY: ReturnType<typeof setTimeout> | null = null
        let scrollEndTimer: ReturnType<typeof setTimeout> | null = null
        let animTimer: ReturnType<typeof setTimeout> | null = null

        let activePointerId: number | null = null
        let dragVertical = true
        let startX = 0
        let startY = 0
        let startScrollLeft = 0
        let startScrollTop = 0
        let savedSnapType: string | null = null

        let boundViewport: HTMLElement | null = null
        let boundContent: HTMLElement | null = null
        let boundScrollbarY: HTMLElement | null = null
        let boundScrollbarX: HTMLElement | null = null
        let boundThumbY: HTMLElement | null = null
        let boundThumbX: HTMLElement | null = null
        let disposed = false

        const setHovering = (next: boolean) => {
          if (next === hovering) return
          hovering = next
          send(next ? Message.EnteredPointer() : Message.LeftPointer())
        }

        const startScrolling = (vertical: boolean) => {
          if (vertical) {
            if (!scrollingY) {
              scrollingY = true
              send(Message.StartedScrolling({ orientation: "vertical" }))
            }
            if (timerY !== null) clearTimeout(timerY)
            timerY = setTimeout(() => {
              timerY = null
              if (scrollingY) {
                scrollingY = false
                send(Message.StoppedScrolling({ orientation: "vertical" }))
              }
            }, SCROLL_TIMEOUT)
          } else {
            if (!scrollingX) {
              scrollingX = true
              send(Message.StartedScrolling({ orientation: "horizontal" }))
            }
            if (timerX !== null) clearTimeout(timerX)
            timerX = setTimeout(() => {
              timerX = null
              if (scrollingX) {
                scrollingX = false
                send(Message.StoppedScrolling({ orientation: "horizontal" }))
              }
            }, SCROLL_TIMEOUT)
          }
        }

        const stopScrolling = (vertical: boolean) => {
          if (vertical) {
            if (timerY !== null) {
              clearTimeout(timerY)
              timerY = null
            }
            if (scrollingY) {
              scrollingY = false
              send(Message.StoppedScrolling({ orientation: "vertical" }))
            }
          } else {
            if (timerX !== null) {
              clearTimeout(timerX)
              timerX = null
            }
            if (scrollingX) {
              scrollingX = false
              send(Message.StoppedScrolling({ orientation: "horizontal" }))
            }
          }
        }

        const handleScroll = (x: number, y: number) => {
          const dx = x - scrollPosX
          const dy = y - scrollPosY
          scrollPosX = x
          scrollPosY = y
          if (dy !== 0) startScrolling(true)
          if (dx !== 0) startScrolling(false)
        }

        // Disable CSS scroll snap during thumb dragging so programmatic scroll
        // assignments do not quantize back to snap points.
        const disableViewportSnap = (viewport: HTMLElement | null) => {
          if (viewport !== null && savedSnapType === null) {
            savedSnapType = viewport.style.scrollSnapType
            viewport.style.scrollSnapType = "none"
          }
        }

        const restoreViewportSnap = () => {
          if (savedSnapType !== null) {
            const viewport = find(root, viewportAttr, args.id)
            if (viewport !== null) viewport.style.scrollSnapType = savedSnapType
            savedSnapType = null
          }
        }

        const startDrag = (event: PointerEvent, vertical: boolean) => {
          if (event.button !== 0) return
          if (activePointerId !== null) {
            const activeThumb = dragVertical
              ? find(root, thumbYAttr, args.id)
              : find(root, thumbXAttr, args.id)
            if (activeThumb !== null && typeof activeThumb.hasPointerCapture === "function") {
              try {
                if (activeThumb.hasPointerCapture(activePointerId)) return
              } catch {}
            }
          }
          activePointerId = event.pointerId
          dragVertical = vertical
          startX = event.clientX
          startY = event.clientY
          const viewport = find(root, viewportAttr, args.id)
          if (viewport !== null) {
            startScrollLeft = viewport.scrollLeft
            startScrollTop = viewport.scrollTop
            disableViewportSnap(viewport)
          }
          const thumb = vertical ? find(root, thumbYAttr, args.id) : find(root, thumbXAttr, args.id)
          if (thumb !== null && typeof thumb.setPointerCapture === "function") {
            try {
              thumb.setPointerCapture(event.pointerId)
            } catch {}
          }
        }

        const endDrag = (event: PointerEvent) => {
          if (event.pointerId !== activePointerId) return
          activePointerId = null
          stopScrolling(dragVertical)
          restoreViewportSnap()
          const thumb = dragVertical ? find(root, thumbYAttr, args.id) : find(root, thumbXAttr, args.id)
          if (thumb !== null && typeof thumb.hasPointerCapture === "function") {
            try {
              if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId)
            } catch {}
          }
        }

        const onThumbPointerMove = (event: PointerEvent) => {
          if (event.pointerId !== activePointerId) return
          // Missed-release fallback: if capture was silently dropped and the
          // primary button is no longer held, clear the drag latch.
          if (event.buttons % 2 === 0) {
            endDrag(event)
            return
          }
          const viewport = find(root, viewportAttr, args.id)
          if (viewport === null) return
          const vertical = dragVertical
          const thumb = vertical ? find(root, thumbYAttr, args.id) : find(root, thumbXAttr, args.id)
          const scrollbar = vertical ? find(root, scrollbarYAttr, args.id) : find(root, scrollbarXAttr, args.id)
          if (thumb === null || scrollbar === null) return

          const axis = vertical ? "y" : "x"
          const scrollbarOffset = getOffset(scrollbar, "padding", axis)
          const thumbOffset = getOffset(thumb, "margin", axis)
          const thumbSizePx = vertical ? thumb.offsetHeight : thumb.offsetWidth
          const trackSize = vertical ? scrollbar.offsetHeight : scrollbar.offsetWidth
          const maxThumbOffset = trackSize - thumbSizePx - scrollbarOffset - thumbOffset
          const delta = vertical ? event.clientY - startY : event.clientX - startX
          const scrollRatio = maxThumbOffset <= 0 ? 0 : delta / maxThumbOffset

          const scrollableSize = vertical ? viewport.scrollHeight : viewport.scrollWidth
          const viewportSize = vertical ? viewport.clientHeight : viewport.clientWidth
          const startScroll = vertical ? startScrollTop : startScrollLeft
          const nextScroll = startScroll + scrollRatio * (scrollableSize - viewportSize)

          if (vertical) viewport.scrollTop = nextScroll
          else viewport.scrollLeft = nextScroll
          event.preventDefault()
          startScrolling(vertical)
          computeThumbPosition()
        }

        const makeTrackPointerDown = (vertical: boolean) => (event: PointerEvent) => {
          if (event.button !== 0) return
          const thumb = vertical ? find(root, thumbYAttr, args.id) : find(root, thumbXAttr, args.id)
          if (thumb !== null && thumb.contains(event.target as Node | null)) return
          const viewport = find(root, viewportAttr, args.id)
          const scrollbar = vertical ? find(root, scrollbarYAttr, args.id) : find(root, scrollbarXAttr, args.id)
          if (viewport === null || thumb === null || scrollbar === null) return

          const axis = vertical ? "y" : "x"
          const thumbOffset = getOffset(thumb, "margin", axis)
          const scrollbarOffset = getOffset(scrollbar, "padding", axis)
          const thumbSizePx = vertical ? thumb.offsetHeight : thumb.offsetWidth
          const trackRect = scrollbar.getBoundingClientRect()
          const clickPosition = vertical
            ? event.clientY - trackRect.top - thumbSizePx / 2 - scrollbarOffset + thumbOffset / 2
            : event.clientX - trackRect.left - thumbSizePx / 2 - scrollbarOffset + thumbOffset / 2

          const scrollableSize = vertical ? viewport.scrollHeight : viewport.scrollWidth
          const viewportSize = vertical ? viewport.clientHeight : viewport.clientWidth
          const trackSize = vertical ? scrollbar.offsetHeight : scrollbar.offsetWidth
          const maxThumbOffset = trackSize - thumbSizePx - scrollbarOffset - thumbOffset
          if (maxThumbOffset <= 0) return

          const scrollRatio = clickPosition / maxThumbOffset
          const maxScrollDistance = scrollableSize - viewportSize

          disableViewportSnap(viewport)
          if (vertical) viewport.scrollTop = scrollRatio * maxScrollDistance
          else if (isRtl(viewport)) viewport.scrollLeft = -(1 - scrollRatio) * maxScrollDistance
          else viewport.scrollLeft = scrollRatio * maxScrollDistance

          handleScroll(viewport.scrollLeft, viewport.scrollTop)
          computeThumbPosition()
          startDrag(event, vertical)
        }

        const makeWheel = (vertical: boolean) => (event: WheelEvent) => {
          const viewport = find(root, viewportAttr, args.id)
          if (viewport === null || event.ctrlKey) return
          const horizontal = !vertical
          const delta = horizontal ? event.deltaX : event.deltaY
          if (delta === 0) return

          const maxScroll = horizontal
            ? viewport.scrollWidth - viewport.clientWidth
            : viewport.scrollHeight - viewport.clientHeight
          const rtl = horizontal && isRtl(viewport)
          const minScroll = rtl ? -maxScroll : 0
          const maxScrollValue = rtl ? 0 : maxScroll
          const scrollValue = horizontal ? viewport.scrollLeft : viewport.scrollTop

          if ((scrollValue <= minScroll && delta < 0) || (scrollValue >= maxScrollValue && delta > 0)) return

          event.preventDefault()
          const next = clamp(scrollValue + delta, minScroll, maxScrollValue)
          if (horizontal) viewport.scrollLeft = next
          else viewport.scrollTop = next
          handleScroll(viewport.scrollLeft, viewport.scrollTop)
          computeThumbPosition()
        }

        const onScrollbarMouseDown = (event: MouseEvent) => {
          event.preventDefault()
        }

        const onTrackYPointerDown = makeTrackPointerDown(true)
        const onTrackXPointerDown = makeTrackPointerDown(false)
        const onThumbYPointerDown = (event: PointerEvent) => startDrag(event, true)
        const onThumbXPointerDown = (event: PointerEvent) => startDrag(event, false)
        const onWheelY = makeWheel(true)
        const onWheelX = makeWheel(false)

        const unbindScrollbar = (el: HTMLElement | null, vertical: boolean) => {
          if (el === null) return
          el.removeEventListener("wheel", vertical ? onWheelY : onWheelX)
          el.removeEventListener("pointerdown", vertical ? onTrackYPointerDown : onTrackXPointerDown)
          el.removeEventListener("mousedown", onScrollbarMouseDown)
          el.removeEventListener("pointerup", endDrag)
          el.removeEventListener("pointercancel", endDrag)
        }

        const bindScrollbar = (el: HTMLElement | null, vertical: boolean) => {
          if (el === null) return
          el.addEventListener("wheel", vertical ? onWheelY : onWheelX, { passive: false })
          el.addEventListener("pointerdown", vertical ? onTrackYPointerDown : onTrackXPointerDown)
          el.addEventListener("mousedown", onScrollbarMouseDown)
          el.addEventListener("pointerup", endDrag)
          el.addEventListener("pointercancel", endDrag)
        }

        const unbindThumb = (el: HTMLElement | null, vertical: boolean) => {
          if (el === null) return
          el.removeEventListener("pointerdown", vertical ? onThumbYPointerDown : onThumbXPointerDown)
          el.removeEventListener("pointermove", onThumbPointerMove)
          el.removeEventListener("pointerup", endDrag)
          el.removeEventListener("pointercancel", endDrag)
        }

        const bindThumb = (el: HTMLElement | null, vertical: boolean) => {
          if (el === null) return
          el.addEventListener("pointerdown", vertical ? onThumbYPointerDown : onThumbXPointerDown)
          el.addEventListener("pointermove", onThumbPointerMove)
          el.addEventListener("pointerup", endDrag)
          el.addEventListener("pointercancel", endDrag)
        }

        const onUserInteraction = () => {
          programmaticScroll = false
        }

        const onViewportScroll = () => {
          const viewport = find(root, viewportAttr, args.id)
          if (viewport === null) return
          computeThumbPosition()
          if (touchModality || !programmaticScroll) {
            handleScroll(viewport.scrollLeft, viewport.scrollTop)
          }
          if (scrollEndTimer !== null) clearTimeout(scrollEndTimer)
          scrollEndTimer = setTimeout(() => {
            scrollEndTimer = null
            programmaticScroll = true
          }, SCROLL_END_DEBOUNCE)
        }

        const unbindViewport = (el: HTMLElement | null) => {
          if (el === null) return
          el.removeEventListener("scroll", onViewportScroll)
          el.removeEventListener("wheel", onUserInteraction)
          el.removeEventListener("pointermove", onUserInteraction)
          el.removeEventListener("pointerenter", onUserInteraction)
          el.removeEventListener("keydown", onUserInteraction)
        }

        const bindViewport = (el: HTMLElement | null) => {
          if (el === null) return
          el.addEventListener("scroll", onViewportScroll, { passive: true })
          el.addEventListener("wheel", onUserInteraction, { passive: true })
          el.addEventListener("pointermove", onUserInteraction)
          el.addEventListener("pointerenter", onUserInteraction)
          el.addEventListener("keydown", onUserInteraction)
        }

        const resizeObserver = typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver((entries) => {
            const viewport = find(root, viewportAttr, args.id)
            if (viewport !== null && entries.length === 1 && entries[0]?.target === viewport) {
              if (
                lastMetrics[0] === viewport.clientHeight &&
                lastMetrics[1] === viewport.scrollHeight &&
                lastMetrics[2] === viewport.clientWidth &&
                lastMetrics[3] === viewport.scrollWidth
              ) return
            }
            computeThumbPosition()
          })

        const syncElements = () => {
          const nextViewport = find(root, viewportAttr, args.id)
          if (nextViewport !== boundViewport) {
            if (boundViewport !== null) resizeObserver?.unobserve(boundViewport)
            unbindViewport(boundViewport)
            boundViewport = nextViewport
            bindViewport(boundViewport)
            if (boundViewport !== null) resizeObserver?.observe(boundViewport)
          }

          const nextContent = find(root, contentAttr, args.id)
          if (nextContent !== boundContent) {
            if (boundContent !== null) resizeObserver?.unobserve(boundContent)
            boundContent = nextContent
            if (boundContent !== null) resizeObserver?.observe(boundContent)
          }

          const nextScrollbarY = find(root, scrollbarYAttr, args.id)
          if (nextScrollbarY !== boundScrollbarY) {
            unbindScrollbar(boundScrollbarY, true)
            boundScrollbarY = nextScrollbarY
            bindScrollbar(boundScrollbarY, true)
          }

          const nextScrollbarX = find(root, scrollbarXAttr, args.id)
          if (nextScrollbarX !== boundScrollbarX) {
            unbindScrollbar(boundScrollbarX, false)
            boundScrollbarX = nextScrollbarX
            bindScrollbar(boundScrollbarX, false)
          }

          const nextThumbY = find(root, thumbYAttr, args.id)
          if (nextThumbY !== boundThumbY) {
            unbindThumb(boundThumbY, true)
            boundThumbY = nextThumbY
            bindThumb(boundThumbY, true)
          }

          const nextThumbX = find(root, thumbXAttr, args.id)
          if (nextThumbX !== boundThumbX) {
            unbindThumb(boundThumbX, false)
            boundThumbX = nextThumbX
            bindThumb(boundThumbX, false)
          }
        }

        const computeThumbPosition = () => {
          if (disposed) return
          syncElements()
          const viewport = boundViewport
          if (viewport === null) return

          const scrollHeight = viewport.scrollHeight
          const scrollWidth = viewport.scrollWidth
          const clientHeight = viewport.clientHeight
          const clientWidth = viewport.clientWidth
          const scrollTop = viewport.scrollTop
          const scrollLeft = viewport.scrollLeft

          lastMetrics = [clientHeight, scrollHeight, clientWidth, scrollWidth]

          if (scrollHeight === 0 || scrollWidth === 0) {
            const empty: OverflowReport = {
              hasOverflowX: false,
              hasOverflowY: false,
              overflowXStart: false,
              overflowXEnd: false,
              overflowYStart: false,
              overflowYEnd: false
            }
            if (!sameReport(lastReport, empty)) {
              lastReport = empty
              send(Message.MeasuredOverflow(empty))
            }
            return
          }

          const hasOverflowY = clientHeight < scrollHeight
          const hasOverflowX = clientWidth < scrollWidth
          const maxScrollLeft = Math.max(0, scrollWidth - clientWidth)
          const maxScrollTop = Math.max(0, scrollHeight - clientHeight)
          const rtl = isRtl(viewport)

          const scrollLeftFromStart = hasOverflowX
            ? normalizeScrollOffset(rtl ? -scrollLeft : scrollLeft, maxScrollLeft)
            : 0
          const scrollLeftFromEnd = hasOverflowX ? maxScrollLeft - scrollLeftFromStart : 0
          const scrollTopFromStart = hasOverflowY ? normalizeScrollOffset(scrollTop, maxScrollTop) : 0
          const scrollTopFromEnd = hasOverflowY ? maxScrollTop - scrollTopFromStart : 0

          const scrollbarY = boundScrollbarY
          const scrollbarX = boundScrollbarX
          const thumbY = boundThumbY
          const thumbX = boundThumbX
          const corner = find(root, cornerAttr, args.id)

          const nextCornerWidth = hasOverflowX && hasOverflowY ? (scrollbarY?.offsetWidth || 0) : 0
          const nextCornerHeight = hasOverflowX && hasOverflowY ? (scrollbarX?.offsetHeight || 0) : 0

          const cornerNotYetSized = cornerWidth === 0 && cornerHeight === 0
          const cornerWidthOffset = cornerNotYetSized ? nextCornerWidth : 0
          const cornerHeightOffset = cornerNotYetSized ? nextCornerHeight : 0

          const ratioX = clientWidth / scrollWidth
          const ratioY = clientHeight / scrollHeight
          const scrollbarXOffset = getOffset(scrollbarX, "padding", "x")
          const scrollbarYOffset = getOffset(scrollbarY, "padding", "y")
          const thumbXOffset = getOffset(thumbX, "margin", "x")
          const thumbYOffset = getOffset(thumbY, "margin", "y")

          const idealWidth = (hasOverflowX ? clientWidth : 0) - scrollbarXOffset - thumbXOffset
          const idealHeight = (hasOverflowY ? clientHeight : 0) - scrollbarYOffset - thumbYOffset
          const maxWidth = scrollbarX !== null
            ? Math.min(scrollbarX.offsetWidth - cornerWidthOffset, idealWidth)
            : idealWidth
          const maxHeight = scrollbarY !== null
            ? Math.min(scrollbarY.offsetHeight - cornerHeightOffset, idealHeight)
            : idealHeight

          const thumbWidth = Math.max(MIN_THUMB_SIZE, maxWidth * ratioX)
          const thumbHeight = Math.max(MIN_THUMB_SIZE, maxHeight * ratioY)

          if (scrollbarY !== null) {
            scrollbarY.style.setProperty(thumbHeightVar, `${thumbHeight}px`)
            if (thumbY !== null) {
              const maxThumbOffsetY = scrollbarY.offsetHeight - thumbHeight - scrollbarYOffset - thumbYOffset
              const offsetY = applyOverscrollThumb(
                thumbY,
                thumbHeightVar,
                scrollTop,
                maxScrollTop,
                scrollHeight,
                thumbHeight,
                maxThumbOffsetY
              )
              thumbY.style.transform = `translate3d(0,${offsetY}px,0)`
            }
          }

          if (scrollbarX !== null) {
            scrollbarX.style.setProperty(thumbWidthVar, `${thumbWidth}px`)
            if (thumbX !== null) {
              const maxThumbOffsetX = scrollbarX.offsetWidth - thumbWidth - scrollbarXOffset - thumbXOffset
              const scrollFromStart = rtl ? -scrollLeft : scrollLeft
              const offsetX = applyOverscrollThumb(
                thumbX,
                thumbWidthVar,
                scrollFromStart,
                maxScrollLeft,
                scrollWidth,
                thumbWidth,
                maxThumbOffsetX
              )
              thumbX.style.transform = `translate3d(${rtl ? -offsetX : offsetX}px,0,0)`
            }
          }

          const metrics = [scrollLeftFromStart, scrollLeftFromEnd, scrollTopFromStart, scrollTopFromEnd]
          for (let i = 0; i < overflowVars.length; i++) {
            viewport.style.setProperty(overflowVars[i]!, `${metrics[i]}px`)
          }

          if (corner !== null || !hasOverflowX || !hasOverflowY) {
            cornerWidth = nextCornerWidth
            cornerHeight = nextCornerHeight
            root.style.setProperty(cornerWidthVar, `${cornerWidth}px`)
            root.style.setProperty(cornerHeightVar, `${cornerHeight}px`)
          }

          const report: OverflowReport = {
            hasOverflowX,
            hasOverflowY,
            overflowXStart: hasOverflowX && scrollLeftFromStart > args.xStart,
            overflowXEnd: hasOverflowX && scrollLeftFromEnd > args.xEnd,
            overflowYStart: hasOverflowY && scrollTopFromStart > args.yStart,
            overflowYEnd: hasOverflowY && scrollTopFromEnd > args.yEnd
          }

          if (!sameReport(lastReport, report)) {
            lastReport = report
            send(Message.MeasuredOverflow(report))
          }
        }

        const onRootPointerDown = (event: PointerEvent) => {
          touchModality = event.pointerType === "touch"
        }

        const onRootPointerEnterOrMove = (event: PointerEvent) => {
          touchModality = event.pointerType === "touch"
          if (event.pointerType !== "touch") {
            setHovering(root.contains(event.target as Node | null))
          }
        }

        const onRootPointerLeave = () => {
          setHovering(false)
        }

        root.style.setProperty(cornerWidthVar, "0px")
        root.style.setProperty(cornerHeightVar, "0px")
        root.addEventListener("pointerdown", onRootPointerDown)
        root.addEventListener("pointerenter", onRootPointerEnterOrMove)
        root.addEventListener("pointermove", onRootPointerEnterOrMove)
        root.addEventListener("pointerleave", onRootPointerLeave)

        computeThumbPosition()

        const initialViewport = find(root, viewportAttr, args.id)
        if (initialViewport !== null) {
          try {
            if (initialViewport.matches(":hover")) setHovering(true)
          } catch {}

          animTimer = setTimeout(() => {
            animTimer = null
            if (disposed || typeof initialViewport.getAnimations !== "function") return
            const animations = initialViewport.getAnimations({ subtree: true }).filter((animation) => {
              const timing = animation.effect?.getTiming()
              return timing?.duration !== Infinity && timing?.iterations !== Infinity
            })
            if (animations.length === 0) return
            Promise.allSettled(animations.map((animation) => animation.finished.then(() => undefined)))
              .then(() => computeThumbPosition())
              .catch(() => {})
          }, 0)
        }

        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            disposed = true
            resizeObserver?.disconnect()
            if (timerX !== null) clearTimeout(timerX)
            if (timerY !== null) clearTimeout(timerY)
            if (scrollEndTimer !== null) clearTimeout(scrollEndTimer)
            if (animTimer !== null) clearTimeout(animTimer)
            restoreViewportSnap()
            root.removeEventListener("pointerdown", onRootPointerDown)
            root.removeEventListener("pointerenter", onRootPointerEnterOrMove)
            root.removeEventListener("pointermove", onRootPointerEnterOrMove)
            root.removeEventListener("pointerleave", onRootPointerLeave)
            unbindViewport(boundViewport)
            unbindScrollbar(boundScrollbarY, true)
            unbindScrollbar(boundScrollbarX, false)
            unbindThumb(boundThumbY, true)
            unbindThumb(boundThumbX, false)
          })
        )

        yield* Stream.runForEach(changes, (next) =>
          Effect.sync(() => {
            args = next
            computeThumbPosition()
          })).pipe(Effect.forkScoped)
      })
    )
)

type WithRequirements<T, R2> = [R2] extends [never] ? T
  : T extends Html.Element<infer Msg, infer R, infer E, infer N, infer Tag> ? Html.Element<Msg, R | R2, E, N, Tag>
  : T extends View.ContainerBuilder<infer Msg, infer R, infer H, infer N, infer Tag> ?
    View.ContainerBuilder<Msg, R | R2, H, N, Tag>
  : T

type ScrollbarOf<B extends View.PartTarget<"div">, T extends View.PartTarget<"div">> = WithRequirements<
  ReturnType<B["attr"]>,
  View.Requirements<T>
>

const overflowData = <B extends { readonly attr: (name: string, value: string | undefined) => B }>(
  builder: B,
  model: typeof Model.Type
): B =>
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
  model: Model,
  message: Message,
  elements: Html
}).make({
  init: () => ({
    measured: false,
    hovering: false,
    scrollingX: false,
    scrollingY: false,
    hasOverflowX: false,
    hasOverflowY: false,
    overflowXStart: false,
    overflowXEnd: false,
    overflowYStart: false,
    overflowYEnd: false
  }),
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
      orientation === "vertical"
        ? { ...model, scrollingY: true }
        : { ...model, scrollingX: true },
    StoppedScrolling: (model, { orientation }) =>
      orientation === "vertical"
        ? { ...model, scrollingY: false }
        : { ...model, scrollingX: false },
    EnteredPointer: (model) => ({ ...model, hovering: true }),
    LeftPointer: (model) => ({ ...model, hovering: false })
  },
  parts: (model, p) => {
    const id = p.id("scroll-area")
    const thresholds = normalizeThreshold(p.props.overflowEdgeThreshold)
    const scrolling = model.scrollingX || model.scrollingY
    const cornerHidden = !model.hasOverflowX || !model.hasOverflowY

    const thumbPart = p.part("div", (b, orientation: ScrollAreaOrientation) => {
      const vertical = orientation === "vertical"
      const ownStyle = (vertical ? `height:var(${thumbHeightVar})` : `width:var(${thumbWidthVar})`) +
        (model.measured ? "" : ";visibility:hidden")
      return b
        .attr("data-orientation", orientation)
        .attr("data-scrolling", flag(vertical ? model.scrollingY : model.scrollingX))
        .attr(vertical ? thumbYAttr : thumbXAttr, id)
        .forward((node) => node.attr("style", withStyle(node.attrs.style, ownStyle)))
    })

    const scrollbarPart = p.part(
      "div",
      (b, orientation: ScrollAreaOrientation, thumb: View.Content<unknown, any>) => {
        const vertical = orientation === "vertical"
        const placement = vertical
          ? `top:0;bottom:var(${cornerHeightVar},0px);inset-inline-end:0`
          : `inset-inline-start:0;inset-inline-end:var(${cornerWidthVar},0px);bottom:0`
        const ownStyle = `position:absolute;touch-action:none;${noSelect};${placement}`
        return overflowData(b, model)
          .attr("aria-hidden", "true")
          .attr("data-orientation", orientation)
          .attr("data-hovering", flag(model.hovering))
          .attr("data-scrolling", flag(vertical ? model.scrollingY : model.scrollingX))
          .attr(vertical ? scrollbarYAttr : scrollbarXAttr, id)
          .forward((node) => node.attr("style", withStyle(node.attrs.style, ownStyle)))
          .children(thumb as never)
      }
    )

    const cornerPart = p.part("div", (b) =>
      b
        .attr("aria-hidden", "true")
        .attr(cornerAttr, id)
        .forward((node) =>
          node.attr(
            "style",
            withStyle(
              node.attrs.style,
              `position:absolute;bottom:0;inset-inline-end:0;width:var(${cornerWidthVar},0px);height:var(${cornerHeightVar},0px)`
            )
          )
        ))

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
        overflowData(b, model)
          .attr("role", "presentation")
          .attr("data-scrolling", flag(scrolling))
          .onMount(
            TrackScrollArea({
              id,
              hasOverflowX: model.hasOverflowX,
              hasOverflowY: model.hasOverflowY,
              ...thresholds
            })
          )
          .forward((node) => node.attr("style", withStyle(node.attrs.style, "position:relative")))),
      viewport: p.part("div", (b) =>
        overflowData(b, model)
          .attr("tabindex", model.hasOverflowX || model.hasOverflowY ? "0" : "-1")
          .attr("data-scrolling", flag(scrolling))
          .attr(viewportAttr, id)
          .forward((node) => node.attr("style", withStyle(node.attrs.style, "overflow:scroll;scrollbar-width:none")))),
      content: p.part("div", (b) =>
        overflowData(b, model)
          .attr("role", "presentation")
          .attr("data-scrolling", flag(scrolling))
          .attr(contentAttr, id)
          .forward((node) => node.attr("style", withStyle(node.attrs.style, "min-width:fit-content")))),
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
          const builtThumb = thumbPart(thumb, orientation)
          const built = scrollbarPart(element, orientation, builtThumb) as ScrollbarOf<B, T>
          const visible = keepMounted || (orientation === "vertical" ? model.hasOverflowY : model.hasOverflowX)
          return visible ? built : undefined
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
