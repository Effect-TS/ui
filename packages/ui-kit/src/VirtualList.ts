/**
 * A list that renders only the items near the visible part of its scroll
 * container, and leaves room for the others so the scrollbar covers the whole
 * list.
 *
 * `VirtualList` is a headless component: it keeps the rendered range, the
 * measured item sizes, the focused item and the scroll position, and a mount on
 * `list` follows scrolling, resizing and focus. Your view draws the scroll
 * container, the list and one element for each index in `items`.
 *
 * **Anatomy**
 *
 * | Part | Element |
 * | :-- | :-- |
 * | `viewport` | `<div>`, `<ul>` or `<ol>`: the element that scrolls. Leave it out and the list scrolls with `scrollContainer` or the page |
 * | `table` | `<table>`, for a list that is a `<tbody>`, or a `<div>` with `role="grid"` or `role="table"`: `aria-rowcount` |
 * | `list` | `<div>`, `<ul>`, `<ol>` or `<tbody>`, `role="list"` unless another role is set or it's a `<tbody>` |
 * | `item` | `<div>`, `<li>` or `<tr>`, `role="listitem"` unless another role is set or it's a `<tr>` |
 *
 * `item` takes `{ element, index }`. Draw one for each index in `items`, in
 * order, as children of `list`, and key each element by the item's own id.
 * `viewport` and `list` may be one element. Only a `<tbody>` list adds
 * markup: empty `<tr>` rows that stand in for the rows left out.
 *
 * **Data attributes**
 *
 * - `item`: `data-index`, the item's index, and `data-key`, its key when `keys`
 *   is given.
 * - `list`: `data-virtual-list-spacer` on each row a `<tbody>` list adds.
 *
 * **Keyboard**
 *
 * Every item says where it is in the whole set with `aria-posinset` and
 * `aria-setsize`, or a `<tr>` or `role="row"` item with `aria-rowindex` and
 * the `table` part with `aria-rowcount`. They count from `firstPosition` out
 * of `setSize`, so a page of a longer set or one whose size isn't known says
 * so. In a table, the header row takes a row index too: pass
 * `firstPosition: 2` for one header row, and count it in `setSize`. The item
 * that has the focus, or holds the element that has it, stays rendered with
 * the rows next to it wherever the list scrolls, so Tab and Shift+Tab go where
 * they would if every item were rendered.
 *
 * `viewport` sets `tabindex="0"` while its content overflows and
 * `tabindex="-1"` otherwise, allowing keyboard scrolling even without
 * focusable items. Removing the focused item moves focus to the item now at
 * its index, or the previous item if it was last. Focus goes to the item
 * itself or its first focusable descendant. If neither can receive focus,
 * including when the list is empty, focus moves to `viewport` or, without
 * that part, to the list.
 *
 * **Layout**
 *
 * Nothing about the layout is passed in: the mount reads it from the boxes of
 * the rendered items. The list is taken to be rows of items. Every item takes
 * one cell, each row has as many items as the others but the last, and the
 * items of one lane share a left edge. A row is as tall as its tallest item,
 * and the space between two rows is the same everywhere. A block, a flex
 * column and a CSS grid with equal columns are such lists, and a grid needs no
 * column count: the lanes follow its breakpoints. Items that span cells,
 * masonry and horizontal lists are not supported. Use `gap` for the space
 * between items, since a margin can collapse with the one the list writes.
 *
 * With `layout: "absolute"` the items are taken out of the flow and each is
 * placed with a `transform` in a single lane, the full width of the list, so
 * an item can animate and rendering more of them rewrites no padding. When
 * an item is measured and the size estimated for the items above changes,
 * every rendered item moves and the list scrolls by as much, so a
 * `transition` on `transform` shows that move too: pass `sizes` for the
 * items you can size up front.
 *
 * **Sizes**
 *
 * An item is `itemSize` tall, or `sizes[index]` when `sizes` is given, until
 * it's measured. An item that hasn't been measured takes the average of the
 * ones that have, when no `sizes` entry covers it. With `measure: false`
 * those numbers are exact, items aren't measured, and each item writes its
 * `block-size` with `box-sizing: border-box`, so its padding, border and
 * content can't make it taller. A CSS `min-height` above the size still
 * wins. Sizes are kept by index, or by key when `keys` is given, and dropped
 * when the list's width or its number of lanes changes, or when `dataset`
 * does.
 *
 * **Scrolling**
 *
 * When the rows above the visible ones change size, or `keys` puts items
 * before them, the mount scrolls by the difference before the browser paints,
 * so what the user sees stays in place. Content before the list that changes
 * size does the same once the list's top has scrolled past the viewport's,
 * and pushes the list down while it hasn't, as the browser's own scroll
 * anchoring does. `scrollTo` scrolls to an index, a
 * key, an offset or the end once it's rendered, and keeps it there as the
 * items around it are measured, until anything else scrolls the list. A
 * request waits for its target, such as the items of a list that is still
 * empty or the item with its key, even when the prop is dropped meanwhile,
 * until it's applied, a newer request replaces it, or the user scrolls.
 * `followEnd` keeps the end in
 * view while the user is there, and `contentAlignment: "end"` places a list
 * shorter than its viewport at the bottom, as a chat does. Neither reverses
 * the order of the elements.
 *
 * A browser that scrolls off the main thread, as Safari and Firefox do, can
 * show the rows past the rendered ones before the list renders again. So
 * after each scroll the list also renders ahead in the direction it moved, as
 * far as it moved, up to the viewport's height. A jump further than that, or
 * a `scrollTo`, renders only the rows around the new position.
 *
 * To load earlier items, such as older messages, as the user scrolls up,
 * pass `reserveStart`, space held above the first item while there are more,
 * and load a page when `Scrolled` reports a `first` near the start. Add the
 * page to the start of `keys` and the rows on screen stay put, and drop
 * `reserveStart` once the first item is the first of the set.
 *
 * **Sticky items**
 *
 * `sticky` lists item indices, such as section headers, to keep mounted.
 * The last one at or above the viewport's top stays at its own offset even
 * when surrounding items are unmounted. The prop does not pin the item;
 * positioning is up to the consumer's styles.
 *
 * **Styling**
 *
 * `list` writes `padding-block-start`, `padding-block-end` and
 * `overflow-anchor: none` inline, and the first item of a range kept apart
 * from the others writes `margin-block-start`: the padding and margin stand in for the items
 * left out, so pad an element around the list instead. A `<tbody>` list
 * writes neither and adds spacer rows instead, and with `layout: "absolute"`
 * the list writes `position: relative` and each item `position`, `inset-inline`,
 * `top` and `transform`. A `viewport` needs a bounded height and an
 * `overflow` that scrolls.
 *
 * **Limits**
 *
 * - `list` carries the component's mount, so it can't take a mount of your own.
 * - A list scrolls with its `viewport`, the element `scrollContainer` names,
 *   or the page, and not with another scrolling element around it.
 * - Without `keys`, items are known by index, so items added before the
 *   visible ones push them down.
 * - A `<tbody>` list is a single lane and can't use `layout: "absolute"`, and
 *   `layout: "absolute"` is a single lane whatever the CSS.
 * - Content before the list is watched for size and for the `class`, `style`,
 *   `hidden` and `open` attributes, and the elements around it for children.
 *   A change elsewhere that moves the list, such as a stylesheet loading, shows
 *   at the next scroll or resize.
 * - On the server, and on a host that doesn't run mounts, the first
 *   `initialCount` items are rendered, or those around a `scrollTo` target.
 *
 * **Example** (A list of a thousand rows in a scroll container)
 *
 * ```ts import.meta.vitest
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { VirtualList } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const rows = Array.from({ length: 1000 }, (_, i) => ({ id: "row-" + i, label: "Row " + i }))
 *
 * const Rows = Html.component({
 *   name: "Rows",
 *   model: Schema.Struct({}),
 *   message: Schema.Never
 * }).make({
 *   init: () => ({}),
 *   update: ($) => $.model,
 *   view: (h) =>
 *     VirtualList(h, {
 *       props: { count: rows.length, itemSize: 32, initialCount: 20 },
 *       view: (virtualList) =>
 *         virtualList.viewport(h.div.class("scroller")).children(
 *           virtualList.list(h.ul.class("rows")).children(
 *             virtualList.items.map((index) =>
 *               virtualList.item({ element: h.li.key(rows[index]!.id), index }).children(rows[index]!.label)
 *             )
 *           )
 *         )
 *     })
 * })
 *
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Rows, {}))
 * if (!html.includes("Row 19") || html.includes("Row 20<") || !html.includes('aria-setsize="1000"')) {
 *   throw new Error("expected the first 20 rows of 1000")
 * }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */

import type * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as View from "@effect/ui/View"
import * as Virtualizer from "@effect/ui/Virtualizer"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { attrSelector, defaults, ownStyle } from "./internal/attributes.ts"
import { activeOf } from "./internal/dom.ts"

const viewportAttr = "data-virtual-list-viewport"
const itemAttr = "data-virtual-list-item"
const spacerAttr = "data-virtual-list-spacer"
const scrollEndDelay = 100
const layoutAttributes = ["class", "style", "hidden", "open"]
const focusableSelector =
  "a[href],button,input,select,textarea,summary,iframe,[tabindex],[contenteditable]:not([contenteditable=\"false\"])"

/**
 * Where `scrollTo` goes: an item by index or by key, a distance in pixels
 * from the top of the list, or the end of the list.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const VirtualListScrollTarget = Virtualizer.ScrollTarget

/**
 * Where `scrollTo` goes.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type VirtualListScrollTarget = Virtualizer.ScrollTarget

/**
 * Where an item `scrollTo` goes to ends up in the viewport. `"nearest"`
 * leaves an item that is in full view where it is, and otherwise brings in its
 * nearest edge.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const VirtualListAlign = Virtualizer.Align

/**
 * Where an item `scrollTo` goes to ends up in the viewport.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type VirtualListAlign = Virtualizer.Align

/**
 * A scroll request. The list scrolls once for each request that differs from
 * the last one it received, so change `id` to go to the same target again.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const VirtualListScrollTo = Virtualizer.ScrollTo

/**
 * A scroll request.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type VirtualListScrollTo = Virtualizer.ScrollTo

/**
 * The element that scrolls the list when no `viewport` part is applied:
 * `"nearest"`, the closest ancestor whose `overflow-y` scrolls, or the closest
 * ancestor that `selector` matches. The list looks for it again each time it
 * renders, the window resizes, or the `class`, `style`, `hidden` or `open`
 * of an ancestor changes, so a shell that starts or stops scrolling takes or
 * gives back the list.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const VirtualListScrollContainer = Schema.Union([
  Schema.Literal("nearest"),
  Schema.Struct({ selector: Schema.String })
])

/**
 * The element that scrolls the list when no `viewport` part is applied.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type VirtualListScrollContainer = typeof VirtualListScrollContainer.Type

/**
 * Schema for {@link VirtualListProps}.
 *
 * **Details**
 *
 * The props of `Virtualizer.Props`, with sizes and offsets in pixels and
 * `overscan` 3 when omitted. `initialCount` is also what the server renders.
 * `layout: "absolute"` positions each item with a transform.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const VirtualListProps = Schema.Struct({
  ...Virtualizer.Props.fields,
  /** Where a list shorter than its viewport sits. `"start"` when omitted. */
  contentAlignment: Schema.optional(Schema.Literals(["start", "end"])),
  /**
   * The element that scrolls the list when no `viewport` part is applied, such
   * as a layout's `<main>` or a dialog's body. The page when omitted, or when
   * nothing matches.
   */
  scrollContainer: Schema.optional(VirtualListScrollContainer),
  /**
   * How many items the whole set has when the list holds only some of them,
   * for `aria-setsize`, or -1 when that isn't known. `count` when omitted.
   */
  setSize: Schema.optional(Schema.Number),
  /**
   * The position of the first item in the whole set, from 1, for
   * `aria-posinset`, or `aria-rowindex` for a row. 1 when omitted.
   */
  firstPosition: Schema.optional(Schema.Number)
})

/**
 * The props of a {@link VirtualList}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type VirtualListProps = typeof VirtualListProps.Type

/**
 * The events of a {@link VirtualList}.
 *
 * **Details**
 *
 * `Scrolled` reports `first` and `last`, the first and last visible items,
 * `atStart` and `atEnd`, whether the list is scrolled to its start and to
 * its end, and `scrolling`, whether it's scrolling. The end counts within
 * the `followEnd` threshold, and 1px otherwise. It also reports `offset`,
 * how far the top of the viewport is past the top of the first item, in the
 * units of an `Offset` scroll target, `height`, the viewport's height, and
 * `length`, the list's height from the top of its first item.
 *
 * It's emitted when `first`, `last`, `atStart`, `atEnd` or `scrolling`
 * changes, and with `trackScroll` also when `offset`, `height` or `length`
 * does. `scrolling` turns `true` at the first scroll event, from the user,
 * a `scrollTo` or the list keeping its rows in place, and `false` once the
 * scroll has ended and the list has stayed still for 100ms, so a burst of
 * wheel ticks reports one start and one end.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const VirtualListEvents = Virtualizer.Events

/**
 * The events of a {@link VirtualList}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type VirtualListEvents = Virtualizer.Events

interface Tracked {
  readonly offset: number
  readonly height: number
  readonly length: number
}

const TrackVirtualListArgs = {
  id: Schema.String,
  epoch: Schema.Number,
  measure: Schema.Boolean,
  inset: Schema.Number,
  first: Virtualizer.Bounds,
  last: Virtualizer.Bounds,
  threshold: Schema.NullOr(Schema.Number),
  request: Schema.NullOr(Virtualizer.ScrollRequest),
  fresh: Schema.NullOr(VirtualListScrollTo),
  waiting: Schema.Boolean,
  scrollContainer: Schema.NullOr(VirtualListScrollContainer),
  track: Schema.Boolean,
  absolute: Schema.Boolean
}

type TrackVirtualListArgs = Schema.Struct<typeof TrackVirtualListArgs>["Type"]

const TrackVirtualList = Mount.makeStream(
  "TrackVirtualList",
  { args: TrackVirtualListArgs },
  (list: HTMLElement, initial, changes) =>
    Stream.callback<Virtualizer.Message>((queue) =>
      Effect.gen(function*() {
        let args: TrackVirtualListArgs = initial
        const send = (message: Virtualizer.Message) =>
          Queue.offerUnsafe(queue, message)
        const document = list.ownerDocument
        const window = document.defaultView!

        let viewport: HTMLElement | null = null
        let listening: AbortController | undefined
        let disposed = false
        let anchor: {
          readonly id: string
          readonly top: number
          readonly placed: number
        } | null = null
        let atEnd = false
        let reported: {
          readonly start: number
          readonly height: number
          readonly atStart: boolean
          readonly atEnd: boolean
          readonly overflowing: boolean
          readonly above: boolean
        } | null = null
        let applied: VirtualListScrollTo | null = null
        let pinned: Virtualizer.ScrollRequest | null = null
        let seen = 0
        let focused: {
          readonly item: Element
          readonly ref: Virtualizer.ItemRef
        } | null = null
        let focusTimer: ReturnType<typeof setTimeout> | undefined
        let sent = ""
        let tracked: Tracked = { offset: 0, height: 0, length: 0 }
        let scrolling = false
        let endTimer: ReturnType<typeof setTimeout> | undefined
        const observed = new Set<Element>()
        const watched = new Set<Element>()

        const itemsOf = () =>
          Array.from(
            list.querySelectorAll<HTMLElement>(attrSelector(itemAttr, args.id))
          )
        const identity = (item: Element) =>
          item.getAttribute("data-key") ?? "#" + item.getAttribute("data-index")
        const refOf = (item: Element) => ({
          index: Number(item.getAttribute("data-index")),
          key: item.getAttribute("data-key")
        })

        const listTop = () =>
          list.getBoundingClientRect().top + list.clientTop -
          (list === viewport ? list.scrollTop : 0)
        const placedAt = (item: HTMLElement) => {
          const rect = item.getBoundingClientRect()
          const shift = args.absolute
            ? /translateY\((-?[\d.]+)px\)/.exec(item.style.transform)
            : null
          if (shift === null) return rect
          const top = listTop() + Number(shift[1])
          return {
            top,
            bottom: top + rect.height,
            left: rect.left,
            height: rect.height
          }
        }

        const box = () => {
          if (viewport === null) return { top: 0, height: window.innerHeight }
          return {
            top: viewport.getBoundingClientRect().top + viewport.clientTop,
            height: viewport.clientHeight
          }
        }
        const scrollTop = () =>
          viewport === null ? window.scrollY : viewport.scrollTop
        const origin = () => listTop() + args.inset
        const scrollBy = (delta: number) => {
          if (Math.abs(delta) < 0.5) return
          const top = scrollTop() + delta
          if (viewport === null) window.scrollTo({ top, behavior: "instant" })
          else viewport.scrollTo({ top, behavior: "instant" })
          seen = scrollTop()
        }
        const scroller = () =>
          viewport ?? document.scrollingElement ?? document.documentElement
        const movedByUser = () => {
          const top = scrollTop()
          const element = scroller()
          const moved = !Virtualizer.same(
            top,
            Math.min(seen, element.scrollHeight - element.clientHeight)
          )
          seen = top
          return moved
        }
        const toEnd = () => {
          if (list === viewport) {
            return list.scrollHeight - list.clientHeight - list.scrollTop
          }
          const { height, top } = box()
          return list.getBoundingClientRect().bottom - top - height
        }
        const hidden = () => {
          const rect = list.getBoundingClientRect()
          return rect.width === 0 && rect.height === 0
        }

        const placement = (top: number) =>
          list === viewport ? 0 : listTop() - top

        const capture = () => {
          const top = box().top
          const placed = placement(top)
          anchor = null
          // Above the list on the page, keep the scroll offset rather than follow a row.
          if (viewport === null && placed > 0.5) return
          for (const item of itemsOf()) {
            const rect = placedAt(item)
            if (rect.bottom > top + 0.5) {
              anchor = { id: identity(item), top: rect.top - top, placed }
              return
            }
          }
        }

        const keepAnchor = () => {
          if (anchor === null) return
          const { id, placed, top } = anchor
          const item = itemsOf().find((item) => identity(item) === id)
          if (item === undefined) return
          const view = box().top
          const moved = placedAt(item).top - view - top
          scrollBy(placed < -0.5 ? moved : moved - (placement(view) - placed))
        }

        const anchorAt = (start: number): Virtualizer.Position | null => {
          const zero = origin()
          for (const item of itemsOf()) {
            const rect = placedAt(item)
            const top = rect.top - zero
            if (top > start + 0.5) return null
            if (rect.bottom - zero > start) {
              return { ...refOf(item), offset: start - top }
            }
          }
          return null
        }

        const metrics = (): Tracked => {
          const { height, top } = box()
          const zero = origin()
          return {
            offset: top - zero,
            height,
            length: list === viewport
              ? list.scrollHeight - args.inset
              : list.getBoundingClientRect().bottom - zero
          }
        }

        const sendMetrics = (next: Tracked) => {
          tracked = next
          send(Virtualizer.Message.ScrolledViewport({ ...next, scrolling }))
        }

        const report = (scrolled: VirtualListScrollTo | null) => {
          if (hidden()) return
          const next = metrics()
          const { height, length, offset: start } = next
          const atStart = start <= Virtualizer.edgeThreshold
          atEnd = toEnd() <= (args.threshold ?? Virtualizer.edgeThreshold)
          const overflowing = viewport !== null &&
            (viewport.scrollHeight > viewport.clientHeight ||
              viewport.scrollWidth > viewport.clientWidth)
          const above = viewport === null && placement(box().top) > 0.5
          const unchanged = reported !== null &&
            Virtualizer.same(height, reported.height) &&
            atStart === reported.atStart &&
            atEnd === reported.atEnd && overflowing === reported.overflowing &&
            above === reported.above
          if (
            scrolled === null && unchanged &&
            (Virtualizer.same(start, reported!.start) ||
              (Virtualizer.within(args.first, start) &&
                Virtualizer.within(args.last, start + height)))
          ) {
            if (
              args.track && !Virtualizer.sameTracked(next, tracked)
            ) sendMetrics(next)
            return
          }
          reported = { start, height, atStart, atEnd, overflowing, above }
          tracked = next
          send(
            Virtualizer.Message.MovedViewport({
              start,
              height,
              atStart,
              atEnd,
              overflowing,
              length,
              anchor: above
                ? { index: 0, key: null, offset: start }
                : anchorAt(start),
              scrolled
            })
          )
        }

        const onScrollEnd = () => {
          clearTimeout(endTimer)
          endTimer = setTimeout(() => {
            if (!scrolling) return
            scrolling = false
            sendMetrics(hidden() ? tracked : metrics())
          }, scrollEndDelay)
        }

        const startScroll = () => {
          if ("onscrollend" in window) clearTimeout(endTimer)
          else onScrollEnd()
          if (scrolling || hidden()) return
          scrolling = true
          sendMetrics(metrics())
        }

        const measure = () => {
          if (hidden()) return
          const rect = list.getBoundingClientRect()
          const zero = origin()
          const items: Array<Virtualizer.MeasuredItem> = []
          let shape = args.epoch + ":" + Math.round(rect.width)
          let firstTop: number | undefined
          for (const item of itemsOf()) {
            const box = placedAt(item)
            const top = box.top - zero
            firstTop ??= top
            shape += "|" + identity(item) + ":" + Math.round(box.height) + ":" +
              Math.round(top - firstTop) + ":" +
              Math.round(box.left - rect.left)
            items.push({
              ...refOf(item),
              top,
              left: box.left - rect.left,
              size: box.height
            })
          }
          if (shape === sent) return
          sent = shape
          send(
            Virtualizer.Message.MeasuredItems({
              epoch: args.epoch,
              width: rect.width,
              items
            })
          )
        }

        const resizeObserver = typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => sync())
        const mutationObserver = typeof MutationObserver === "undefined"
          ? null
          : new MutationObserver(() => sync())
        const structureObserver = typeof MutationObserver === "undefined" ?
          null :
          new MutationObserver(() => {
            watchOutside()
            sync()
          })

        const observeOnly = (
          current: Set<Element>,
          next: ReadonlySet<Element>,
          options?: ResizeObserverOptions
        ) => {
          for (const element of current) {
            if (!next.has(element)) {
              resizeObserver?.unobserve(element)
              current.delete(element)
            }
          }
          for (const element of next) {
            if (!current.has(element)) {
              resizeObserver?.observe(element, options)
              current.add(element)
            }
          }
        }

        const watchOutside = () => {
          const ancestors: Array<Element> = []
          const before = new Set<Element>()
          if (viewport !== list) {
            const owner = viewport ?? document.documentElement
            for (
              let child: Element = list;
              child !== owner && child.parentElement !== null;
              child = child.parentElement
            ) {
              ancestors.push(child.parentElement)
              for (
                let sibling = child.previousElementSibling;
                sibling !== null;
                sibling = sibling.previousElementSibling
              ) {
                before.add(sibling)
              }
            }
          }
          observeOnly(watched, before)
          structureObserver?.disconnect()
          for (const element of before) {
            structureObserver?.observe(element, {
              attributes: true,
              attributeFilter: layoutAttributes
            })
          }
          for (const element of ancestors) {
            structureObserver?.observe(element, {
              childList: true,
              attributes: true,
              attributeFilter: layoutAttributes
            })
          }
        }

        const resolveViewport = (): HTMLElement | null => {
          const own = list.closest<HTMLElement>(
            attrSelector(viewportAttr, args.id)
          )
          if (own !== null) return own
          const container = args.scrollContainer
          if (container === null) return null
          if (container !== "nearest") {
            return list.parentElement?.closest<HTMLElement>(
              container.selector
            ) ?? null
          }
          for (
            let element = list.parentElement;
            element !== null && element !== document.body &&
            element !== document.documentElement;
            element = element.parentElement
          ) {
            if (
              /^(auto|scroll|overlay)$/.test(
                window.getComputedStyle(element).overflowY
              )
            ) return element
          }
          return null
        }

        const unpin = () => {
          pinned = null
        }

        const onScroll = () => {
          if (movedByUser()) {
            pinned = null
            if (args.waiting) send(Virtualizer.Message.ScrolledByUser())
          }
          startScroll()
          capture()
          report(null)
        }

        const bind = () => {
          const next = resolveViewport()
          if (listening === undefined || next !== viewport) {
            listening?.abort()
            if (viewport !== null && viewport !== list) {
              resizeObserver?.unobserve(viewport)
            }
            viewport = next
            seen = scrollTop()
            listening = new AbortController()
            const options = { signal: listening.signal, passive: true }
            const target = viewport ?? window
            for (
              const type of ["wheel", "touchmove", "keydown", "pointerdown"]
            ) {
              target.addEventListener(type, unpin, options)
            }
            ;(viewport ?? document).addEventListener(
              "scrollend",
              onScrollEnd,
              options
            )
            if (viewport === null) {
              window.addEventListener("scroll", onScroll, options)
              window.addEventListener("resize", () => sync(), options)
            } else {
              viewport.addEventListener("scroll", onScroll, options)
              if (viewport !== list) resizeObserver?.observe(viewport)
            }
            watchOutside()
          }
          observeOnly(observed, new Set(args.measure ? itemsOf() : []), {
            box: "border-box"
          })
        }

        const sync = () => {
          if (disposed) return
          bind()
          refocus()
          const request = args.request
          const fresh = args.fresh
          if (request === null) applied = null
          if (
            fresh !== null &&
            (request === null ||
              !Virtualizer.sameScrollTo(request.scrollTo, fresh))
          ) {
            send(Virtualizer.Message.RequestedScroll({ scrollTo: fresh }))
          }
          if (
            request !== null &&
            (applied === null ||
              !Virtualizer.sameScrollTo(applied, request.scrollTo))
          ) {
            applied = request.scrollTo
            pinned = request
            go(request)
            capture()
            report(request.scrollTo)
          } else {
            if (pinned !== null) go(pinned)
            else if (args.threshold !== null && atEnd) scrollBy(toEnd())
            else keepAnchor()
            capture()
            report(null)
          }
          measure()
        }

        const go = ({ index, offset, scrollTo }: Virtualizer.ScrollRequest) => {
          const view = box()
          if (index !== null) {
            const target = scrollTo.target
            const item = itemsOf().find((item) =>
              target._tag === "Key"
                ? item.getAttribute("data-key") === target.key
                : item.getAttribute("data-index") === String(index)
            )
            if (item === undefined) return
            const { bottom, top } = placedAt(item)
            scrollBy(
              Virtualizer.alignedStart(
                top,
                bottom,
                view.top,
                view.height,
                scrollTo.align ?? "start"
              ) - view.top
            )
          } else if (offset !== null) scrollBy(origin() + offset - view.top)
          else scrollBy(toEnd())
        }

        const take = (element: HTMLElement) => {
          element.focus({ preventScroll: true })
          return activeOf(document) === element
        }

        // Make the fallback focusable without adding a Tab stop or replacing
        // a consumer-provided tabindex.
        const focusList = () => {
          if (list.hasAttribute("tabindex")) {
            return list.focus({ preventScroll: true })
          }
          list.setAttribute("tabindex", "-1")
          const release = () => {
            if (list.getAttribute("tabindex") === "-1") {
              list.removeAttribute("tabindex")
            }
          }
          if (take(list)) list.addEventListener("blur", release, { once: true })
          else release()
        }

        // Restore focus after removal only if it hasn't moved to another element.
        const refocus = () => {
          if (focused === null) return
          const active = activeOf(document)
          const dropped = active === null || active === document.body ||
            active === document.documentElement
          if (!focused.item.isConnected && dropped) {
            const { index } = refOf(focused.item)
            const items = itemsOf()
            const item = items.find((item) => refOf(item).index >= index) ??
              items.at(-1)
            const candidates = item === undefined
              ? []
              : [item, ...item.querySelectorAll<HTMLElement>(focusableSelector)]
            if (viewport?.getAttribute(viewportAttr) === args.id) {
              candidates.push(viewport)
            }
            if (!candidates.some(take)) focusList()
          }
          onFocus()
        }

        const onFocus = () => {
          const item =
            activeOf(document)?.closest(attrSelector(itemAttr, args.id)) ?? null
          const next = item !== null && list.contains(item)
            ? { item, ref: refOf(item) }
            : null
          const unchanged = next?.ref.index === focused?.ref.index &&
            next?.ref.key === focused?.ref.key
          focused = next
          if (unchanged) return
          send(
            next === null
              ? Virtualizer.Message.BlurredItems()
              : Virtualizer.Message.FocusedItem(next.ref)
          )
        }

        const own = new AbortController()
        list.addEventListener("focusin", onFocus, { signal: own.signal })
        // The focus leaves one element before it reaches the next, so the item it goes to is known a moment later.
        list.addEventListener("focusout", () => {
          clearTimeout(focusTimer)
          focusTimer = setTimeout(onFocus, 0)
        }, { signal: own.signal })
        resizeObserver?.observe(list, { box: "border-box" })
        mutationObserver?.observe(list, {
          childList: true,
          attributes: true,
          attributeFilter: ["style"]
        })

        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            disposed = true
            clearTimeout(focusTimer)
            clearTimeout(endTimer)
            resizeObserver?.disconnect()
            mutationObserver?.disconnect()
            structureObserver?.disconnect()
            listening?.abort()
            own.abort()
          })
        )

        yield* Stream.runForEach(changes, (next) =>
          Effect.sync(() => {
            args = next
            sync()
          })).pipe(Effect.forkScoped)
      })
    )
)

type ItemOf<B extends View.PartTarget<"div" | "li" | "tr">> = ReturnType<
  B["attr"]
>

type Div = Html.Element<
  Virtualizer.Message,
  never,
  Html.EventsOf<"div">,
  HTMLDivElement,
  "div"
>

const step = (
  $: Component.Update<
    Virtualizer.Model,
    Virtualizer.Message,
    VirtualListEvents,
    VirtualListProps
  >,
  { events, model }: Virtualizer.Updated<Virtualizer.Model>
) => events.length === 0 ? model : $.set(model).emit(...events)

/**
 * A headless virtual list. Call it with the consumer's `h`, its `props`, and
 * a `view` closure that draws an optional `viewport`, the `list`, and an `item`
 * for each index in `items`.
 *
 * **Details**
 *
 * The parts object also carries `items`, the indices to render in order,
 * `count`, `atStart` and `atEnd`, whether the list is scrolled to its
 * start and to its end, for a button that jumps back to the end, and
 * `scrolling`, whether it's scrolling, for rows that skip costly content
 * meanwhile.
 *
 * `item({ element, index })` returns `element`. `list` and `item` write
 * `role` only when no other role is set on the element, so a `role="feed"`
 * or another kit part's role stays. `item` owns `aria-posinset`,
 * `aria-setsize`, `aria-rowindex`, `data-index` and `data-key`, and
 * `viewport` owns `tabindex`. The list's padding and an
 * item's top margin are added after the consumer's inline style.
 *
 * It emits `Scrolled` when the visible items, an edge or `scrolling`
 * changes, so a parent can load more items near either end, react when it
 * reaches one, or save the position once a scroll ends. With `trackScroll`
 * it also emits it for each change of the scroll offset.
 *
 * History restore keeps the measured sizes and the position, so the list is
 * as tall as before when the page's scroll position comes back, and not the
 * focused item.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const VirtualList = Html.component({
  name: "VirtualList",
  props: VirtualListProps,
  model: Virtualizer.Model,
  message: Virtualizer.Message,
  events: VirtualListEvents,
  restore: Virtualizer.restore
}).make({
  init: ($) => Virtualizer.init($.props),
  update: ($, message) =>
    step($, Virtualizer.update($.model, $.props, message)),
  parts: (p, model) => {
    const props = p.props
    const id = p.id("virtual-list")
    const plan = Virtualizer.plan(model, props)
    const { after, before, count, gaps, lanes, total } = plan
    const reserve = Math.max(0, props.reserveStart ?? 0)
    const fill = props.contentAlignment === "end" && model.position !== null
      ? Math.max(0, model.height - total - reserve)
      : 0
    const inset = reserve + fill
    const absolute = props.layout === "absolute"
    const first = props.firstPosition ?? 1
    const setSize = String(props.setSize ?? count)

    const itemPart = p.part(["div", "li", "tr"], (b, index: number) => {
      const tr = b.tag === "tr"
      const gap = gaps.get(index - index % lanes)
      const style = [
        props.measure === false
          ? `box-sizing:border-box;block-size:${
            props.sizes?.[index] ?? props.itemSize
          }px`
          : "",
        absolute
          ? `position:absolute;inset-inline:0;top:0;transform:translateY(${
            inset + plan.offsetOf(index)
          }px)`
          : "",
        !absolute && !tr && gap !== undefined
          ? `margin-block-start:${gap}px`
          : ""
      ].filter((declarations) => declarations !== "").join(";")
      return (b as Div)
        .attrs({
          [itemAttr]: id,
          "data-index": String(index),
          "data-key": Virtualizer.keyOf(props, index) ?? undefined
        })
        .forward((node) => {
          const row = tr || node.elementAttrs.role === "row"
          const position = String(first + index)
          const item = (tr ? node : defaults(node, { role: "listitem" }))
            .attrs({
              "aria-posinset": row ? undefined : position,
              "aria-setsize": row ? undefined : setSize,
              "aria-rowindex": row ? position : undefined
            })
          return style === "" ? item : ownStyle(style)(item)
        })
    })

    const spacer = (
      name: string,
      height: number
    ): ReadonlyArray<View.Node<never>> =>
      height <= 0 ? [] : [
        View.toNode(
          new Html.Element<never>("tr").key(spacerAttr + ":" + name).attrs({
            [spacerAttr]: "",
            "aria-hidden": "true",
            style: `height:${Math.max(0, height - plan.gap)}px`
          })
        )
      ]

    const withSpacers = (
      children: ReadonlyArray<View.Node<any>>
    ): ReadonlyArray<View.Node<any>> => [
      ...spacer("before", before + inset),
      ...children.flatMap((child) => {
        const index = child._tag === "Element" && child.attrs[itemAttr] === id
          ? Number(child.attrs["data-index"])
          : -1
        const gap = gaps.get(index)
        return gap === undefined
          ? [child]
          : [...spacer("between:" + index, gap), child]
      }),
      ...spacer("after", after)
    ]

    return {
      items: plan.items,
      count,
      atStart: model.position !== null && model.atStart,
      atEnd: model.position !== null && model.atEnd,
      scrolling: model.scrolling,
      viewport: p.part(["div", "ul", "ol"], (b) =>
        b.attrs({
          [viewportAttr]: id,
          tabindex: model.overflowing ? "0" : "-1"
        })),
      table: p.part(
        ["table", "div"],
        (b) =>
          b.attr(
            "aria-rowcount",
            props.setSize === undefined
              ? String(count + first - 1)
              : setSize
          )
      ),
      list: p.part(["div", "ul", "ol", "tbody"], (b) => {
        const table = b.tag === "tbody"
        if (table && absolute) {
          throw new Error(
            "VirtualList: a <tbody> list can't use layout: \"absolute\""
          )
        }
        return (b as Div)
          .onMount(TrackVirtualList({
            id,
            epoch: plan.epoch,
            measure: props.measure !== false,
            inset,
            first: plan.first,
            last: plan.last,
            threshold: Virtualizer.endThreshold(props),
            request: plan.request,
            fresh: plan.fresh,
            waiting: plan.waiting,
            scrollContainer: props.scrollContainer ?? null,
            track: props.trackScroll === true,
            absolute
          }))
          .forward((node) => {
            if (table) {
              const built = View.build(
                ownStyle("overflow-anchor:none")(node),
                []
              )
              return { ...built, children: withSpacers(built.children) }
            }
            const style = absolute
              ? `position:relative;padding-block-start:0px;padding-block-end:${
                inset + total
              }px`
              : `padding-block-start:${
                before + inset
              }px;padding-block-end:${after}px`
            return ownStyle(style + ";overflow-anchor:none")(
              defaults(node, { role: "list" })
            )
          })
      }),
      item: View.wrapPart(
        itemPart,
        <B extends View.PartTarget<"div" | "li" | "tr">>(
          { element, index }: { readonly element: B; readonly index: number }
        ): ItemOf<B> => itemPart(element, index) as ItemOf<B>
      )
    }
  }
})
