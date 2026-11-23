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
 * | `table` | `<table>`, for a list that is a `<tbody>`: `aria-rowcount` |
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
 * `aria-setsize`, or a `<tr>` with `aria-rowindex` and the `table` part
 * with `aria-rowcount`. They count from `firstPosition` out of `setSize`, so
 * a page of a longer set or one whose size isn't known says so. In a table,
 * the header row takes a row index too: pass `firstPosition: 2` for one
 * header row, and count it in `setSize`. The item that has the focus, or holds the element that has
 * it, stays rendered with the rows next to it wherever the list scrolls, so
 * Tab and Shift+Tab go where they would if every item were rendered.
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
 * **Styling**
 *
 * `list` writes `padding-block-start`, `padding-block-end` and
 * `overflow-anchor: none` inline, and an item kept apart from the others
 * writes `margin-block-start`: the padding and margin stand in for the items
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
 * import { Component } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { VirtualList } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const rows = Array.from({ length: 1000 }, (_, i) => ({ id: "row-" + i, label: "Row " + i }))
 *
 * const Rows = Component.define({
 *   name: "Rows",
 *   scoped: false,
 *   model: Schema.Struct({}),
 *   message: Schema.Never,
 *   elements: Html
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

import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as UiSchema from "@effect/ui/UiSchema"
import * as UiStruct from "@effect/ui/UiStruct"
import * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { attrSelector, defaults, ownStyle } from "./internal/attributes.ts"
import { activeOf } from "./internal/dom.ts"
import { clamp } from "./internal/range.ts"

const viewportAttr = "data-virtual-list-viewport"
const itemAttr = "data-virtual-list-item"
const spacerAttr = "data-virtual-list-spacer"
const defaultOverscan = 3
const defaultEndThreshold = 1
const scrollEndDelay = 100
const layoutAttributes = ["class", "style", "hidden", "open"]

/**
 * Where `scrollTo` goes: an item by index or by key, a distance in pixels
 * from the top of the list, or the end of the list.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const VirtualListScrollTarget = UiSchema.TaggedEnum({
  Index: { index: Schema.Number },
  Key: { key: Schema.String },
  Offset: { offset: Schema.Number },
  End: {}
})

/**
 * Where `scrollTo` goes.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type VirtualListScrollTarget = typeof VirtualListScrollTarget.Type

/**
 * Where an item `scrollTo` goes to ends up in the viewport. `"nearest"`
 * leaves an item that is in full view where it is, and otherwise brings in its
 * nearest edge.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const VirtualListAlign = Schema.Literals(["start", "center", "end", "nearest"])

/**
 * Where an item `scrollTo` goes to ends up in the viewport.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type VirtualListAlign = typeof VirtualListAlign.Type

/**
 * A scroll request. The list scrolls once for each request that differs from
 * the last one it received, so change `id` to go to the same target again.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const VirtualListScrollTo = Schema.Struct({
  target: VirtualListScrollTarget,
  /** Where an item ends up. `"start"` when omitted, and unused for an offset or the end. */
  align: Schema.optional(VirtualListAlign),
  /** Tells apart two requests for the same target. */
  id: Schema.optional(Schema.Union([Schema.String, Schema.Number]))
})

/**
 * A scroll request.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type VirtualListScrollTo = typeof VirtualListScrollTo.Type

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
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const VirtualListProps = Schema.Struct({
  /** How many items the list has. Ignored when `keys` is passed, which has one key per item. 0 when omitted. */
  count: Schema.optional(Schema.Number),
  /** The height of an item in pixels until it's measured, or always with `measure: false`. */
  itemSize: Schema.Number,
  /** The height of each item by index, in place of `itemSize`. */
  sizes: Schema.optional(Schema.Array(Schema.Number)),
  /** Whether to measure the rendered items. `true` when omitted. */
  measure: Schema.optional(Schema.Boolean),
  /**
   * A stable key for each item by index, which also sets how many items the
   * list has. Sizes are kept by key, `scrollTo` can name an item by key, and
   * items added or removed before the visible ones leave them in place.
   */
  keys: Schema.optional(Schema.Array(Schema.String)),
  /**
   * How many rows to render on each side of the visible ones. 3 when omitted.
   * After a scroll, the list also renders as far ahead as that scroll moved,
   * up to the viewport's height.
   */
  overscan: Schema.optional(Schema.Number),
  /** How many items to render before the list is measured, as on the server. One row and the overscan when omitted. */
  initialCount: Schema.optional(Schema.Number),
  /** A name for the items, such as the search they answer. The list drops what it measured when it changes. */
  dataset: Schema.optional(Schema.String),
  /**
   * Scrolls to a target once it's rendered, and again for each request that
   * differs from the last. A request waits for its target until a newer one
   * replaces it or the user scrolls.
   */
  scrollTo: Schema.optional(VirtualListScrollTo),
  /**
   * Keeps the end of the list in view as it grows or resizes while the user
   * is within `threshold` pixels of it, 1 when omitted.
   */
  followEnd: Schema.optional(
    Schema.Union([Schema.Boolean, Schema.Struct({ threshold: Schema.optional(Schema.Number) })])
  ),
  /** Where a list shorter than its viewport sits. `"start"` when omitted. */
  contentAlignment: Schema.optional(Schema.Literals(["start", "end"])),
  /**
   * The element that scrolls the list when no `viewport` part is applied, such
   * as a layout's `<main>` or a dialog's body. The page when omitted, or when
   * nothing matches.
   */
  scrollContainer: Schema.optional(VirtualListScrollContainer),
  /**
   * How the items are placed. `"flow"` leaves them in the list's own layout
   * and pads the list for the rest. `"absolute"` positions each one in a
   * single lane with a transform. `"flow"` when omitted.
   */
  layout: Schema.optional(Schema.Literals(["flow", "absolute"])),
  /**
   * Space in pixels held above the first item for items still to load before
   * it, such as older messages, so scrolling up doesn't stop at the top while
   * they load. 0 when omitted.
   */
  reserveStart: Schema.optional(Schema.Number),
  /**
   * How many items the whole set has when the list holds only some of them,
   * for `aria-setsize`, or -1 when that isn't known. `count` when omitted.
   */
  setSize: Schema.optional(Schema.Number),
  /**
   * The position of the first item in the whole set, from 1, for
   * `aria-posinset`, or `aria-rowindex` in a table. 1 when omitted.
   */
  firstPosition: Schema.optional(Schema.Number),
  /**
   * Emits `Scrolled` each time the scroll offset, the viewport's height or the
   * list's length changes, and not only when the visible items, an edge or
   * `scrolling` does. `false` when omitted.
   */
  trackScroll: Schema.optional(Schema.Boolean)
})

/**
 * The props of a {@link VirtualList}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type VirtualListProps = typeof VirtualListProps.Type

const Visible = Schema.Struct({
  first: Schema.Number,
  last: Schema.Number,
  atStart: Schema.Boolean,
  atEnd: Schema.Boolean
})

const Tracked = Schema.Struct({ offset: Schema.Number, height: Schema.Number, length: Schema.Number })

type Tracked = typeof Tracked.Type

const Announced = Schema.Struct({ ...Visible.fields, ...Tracked.fields, scrolling: Schema.Boolean })

type Announced = typeof Announced.Type

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
export const VirtualListEvents = UiSchema.TaggedEnum({ Scrolled: Announced.fields })

/**
 * The events of a {@link VirtualList}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type VirtualListEvents = typeof VirtualListEvents.Type

const ItemRef = Schema.Struct({ index: Schema.Number, key: Schema.NullOr(Schema.String) })

const Position = Schema.Struct({ ...ItemRef.fields, offset: Schema.Number })

type Position = typeof Position.Type

const VirtualListModel = Schema.Struct({
  position: Schema.NullOr(Position),
  height: Schema.Number,
  atStart: Schema.Boolean,
  atEnd: Schema.Boolean,
  lanes: Schema.Number,
  gap: Schema.Number,
  width: Schema.Number,
  sizes: Schema.Record(Schema.String, Schema.Number),
  dataset: Schema.NullOr(Schema.String),
  epoch: Schema.Number,
  focused: Schema.NullOr(ItemRef),
  scroll: Schema.NullOr(Schema.Struct({ scrollTo: VirtualListScrollTo, done: Schema.Boolean })),
  offset: Schema.Number,
  length: Schema.Number,
  scrolling: Schema.Boolean,
  announced: Schema.NullOr(Announced),
  lead: Schema.Number
})

type VirtualListModel = typeof VirtualListModel.Type

const MeasuredItem = Schema.Struct({
  ...ItemRef.fields,
  top: Schema.Number,
  left: Schema.Number,
  size: Schema.Number
})

type MeasuredItem = typeof MeasuredItem.Type

const VirtualListMessage = UiSchema.TaggedEnum({
  MovedViewport: {
    start: Schema.Number,
    height: Schema.Number,
    anchor: Schema.NullOr(Position),
    atStart: Schema.Boolean,
    atEnd: Schema.Boolean,
    length: Schema.Number,
    scrolled: Schema.NullOr(VirtualListScrollTo)
  },
  RequestedScroll: { scrollTo: VirtualListScrollTo },
  ScrolledByUser: {},
  MeasuredItems: { epoch: Schema.Number, width: Schema.Number, items: Schema.Array(MeasuredItem) },
  FocusedItem: ItemRef.fields,
  BlurredItems: {},
  ScrolledViewport: { ...Tracked.fields, scrolling: Schema.Boolean }
})

type VirtualListMessage = typeof VirtualListMessage.Type

const sameScrollTo = Schema.toEquivalence(VirtualListScrollTo)

const sameVisible = Schema.toEquivalence(Visible)

const same = (a: number, b: number): boolean => Math.abs(a - b) < 0.5

const sameTracked = (a: Tracked, b: Tracked): boolean =>
  same(a.offset, b.offset) && same(a.height, b.height) && same(a.length, b.length)

const countOf = (props: VirtualListProps): number =>
  props.keys === undefined ? Math.max(0, Math.floor(props.count ?? 0)) : props.keys.length

const keyOf = (props: VirtualListProps, index: number): string | null => props.keys?.[index] ?? null

const sizeKey = (props: VirtualListProps, index: number): string => keyOf(props, index) ?? String(index)

const endThreshold = (props: VirtualListProps): number | null =>
  props.followEnd === undefined || props.followEnd === false
    ? null
    : props.followEnd === true
    ? defaultEndThreshold
    : props.followEnd.threshold ?? defaultEndThreshold

const current = (model: VirtualListModel, props: VirtualListProps): VirtualListModel => {
  const dataset = props.dataset ?? null
  return dataset === model.dataset
    ? model
    : UiStruct.evolve(model, { dataset, sizes: {}, focused: null, epoch: (epoch) => epoch + 1 })
}

const resolve = (props: VirtualListProps, ref: typeof ItemRef.Type, fallback: boolean): number | null => {
  const count = countOf(props)
  if (ref.key !== null) {
    const at = props.keys?.indexOf(ref.key) ?? -1
    if (at >= 0) return at
    if (!fallback) return null
  }
  return count === 0 ? null : clamp(Math.floor(ref.index), 0, count - 1)
}

interface Layout {
  readonly count: number
  readonly lanes: number
  readonly gap: number
  readonly rows: number
  readonly offsets: ReadonlyArray<number>
  readonly total: number
}

const layoutOf = (model: VirtualListModel, props: VirtualListProps): Layout => {
  const count = countOf(props)
  const flow = props.layout !== "absolute"
  const lanes = flow ? Math.max(1, model.lanes) : 1
  const gap = flow ? model.gap : 0
  const rows = Math.ceil(count / lanes)
  const measured = props.measure !== false
  const known = measured ? Object.values(model.sizes) : []
  const estimate = known.length === 0 ? props.itemSize : known.reduce((sum, size) => sum + size, 0) / known.length
  const offsets = [0]
  for (let row = 0; row < rows; row++) {
    let size = 0
    for (let index = row * lanes; index < Math.min(count, (row + 1) * lanes); index++) {
      const given = props.sizes?.[index]
      const item = measured ? model.sizes[sizeKey(props, index)] ?? given ?? estimate : given ?? props.itemSize
      size = Math.max(size, item)
    }
    offsets.push(offsets[row]! + size + gap)
  }
  return { count, lanes, gap, rows, offsets, total: rows === 0 ? 0 : offsets[rows]! - gap }
}

const rowAt = (layout: Layout, y: number): number => {
  let low = 0
  let high = Math.max(0, layout.rows - 1)
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (layout.offsets[middle]! <= y) low = middle
    else high = middle - 1
  }
  return low
}

const rowOf = (layout: Layout, index: number): number => Math.floor(index / layout.lanes)

interface Band {
  readonly start: number
  readonly end: number
}

const restingBand = (model: VirtualListModel, props: VirtualListProps, layout: Layout): Band | null => {
  if (model.position === null || layout.rows === 0) return null
  if (endThreshold(props) !== null && model.atEnd) {
    return { start: layout.total - model.height, end: layout.total }
  }
  const index = resolve(props, model.position, true) ?? 0
  const start = layout.offsets[rowOf(layout, index)]! + model.position.offset
  return { start, end: start + model.height }
}

const ScrollRequest = Schema.Struct({
  scrollTo: VirtualListScrollTo,
  index: Schema.NullOr(Schema.Number),
  offset: Schema.NullOr(Schema.Number)
})

type Pending = typeof ScrollRequest.Type

const sameRequest = (a: VirtualListScrollTo | undefined, b: VirtualListScrollTo | null): boolean =>
  a !== undefined && b !== null && sameScrollTo(a, b)

const latestOf = (model: VirtualListModel): VirtualListScrollTo | null => model.scroll?.scrollTo ?? null

const waitingOf = (model: VirtualListModel): VirtualListScrollTo | null =>
  model.scroll === null || model.scroll.done ? null : model.scroll.scrollTo

const freshOf = (model: VirtualListModel, props: VirtualListProps): VirtualListScrollTo | null =>
  props.scrollTo === undefined || sameRequest(props.scrollTo, latestOf(model)) ? null : props.scrollTo

const pendingOf = (scrollTo: VirtualListScrollTo | null, props: VirtualListProps, layout: Layout): Pending | null => {
  if (scrollTo === null || layout.count === 0) return null
  const target = scrollTo.target
  switch (target._tag) {
    case "Index":
      return { scrollTo, index: clamp(Math.floor(target.index), 0, layout.count - 1), offset: null }
    case "Key": {
      const index = resolve(props, { index: -1, key: target.key }, false)
      return index === null ? null : { scrollTo, index, offset: null }
    }
    case "Offset":
      return { scrollTo, index: null, offset: Math.max(0, target.offset) }
    case "End":
      return { scrollTo, index: null, offset: null }
  }
}

const alignedStart = (top: number, bottom: number, view: number, height: number, align: VirtualListAlign): number =>
  align === "start"
    ? top
    : align === "end"
    ? bottom - height
    : align === "center"
    ? (top + bottom - height) / 2
    : top < view
    ? top
    : bottom > view + height
    ? Math.min(bottom - height, top)
    : view

const pendingBand = (model: VirtualListModel, layout: Layout, pending: Pending, resting: Band | null): Band => {
  const height = model.height
  let start: number
  if (pending.index !== null) {
    const row = rowOf(layout, pending.index)
    const top = layout.offsets[row]!
    const bottom = layout.offsets[row + 1]! - layout.gap
    start = alignedStart(top, bottom, resting?.start ?? 0, height, pending.scrollTo.align ?? "start")
  } else {
    start = pending.offset ?? layout.total - height
  }
  return { start, end: start + height }
}

interface Rendering {
  readonly ranges: ReadonlyArray<readonly [number, number]>
  readonly before: number
  readonly after: number
  readonly between: number
  readonly visible: readonly [number, number] | null
}

const visibleRows = (layout: Layout, band: Band | null): readonly [number, number] | null =>
  band === null || layout.rows === 0
    ? null
    : [rowAt(layout, band.start), rowAt(layout, Math.max(band.start, band.end - 1))]

const visibleItems = (layout: Layout, band: Band | null): readonly [number, number] | null => {
  const rows = visibleRows(layout, band)
  return rows === null
    ? null
    : [rows[0] * layout.lanes, Math.min(layout.count, (rows[1] + 1) * layout.lanes) - 1]
}

const windowOf = (
  model: VirtualListModel,
  props: VirtualListProps,
  layout: Layout,
  band: Band | null,
  lead: number
): Rendering => {
  const overscan = Math.max(0, Math.floor(props.overscan ?? defaultOverscan))
  const visible = visibleRows(layout, band)
  const ahead = band === null ? null : visibleRows(layout, {
    start: band.start + Math.min(0, lead),
    end: band.end + Math.max(0, lead)
  })
  let startRow = 0
  let endRow = ahead === null
    ? props.initialCount === undefined ? overscan + 1 : Math.ceil(props.initialCount / layout.lanes)
    : ahead[1] + overscan + 1
  if (ahead !== null) startRow = Math.max(0, ahead[0] - overscan)
  endRow = Math.min(layout.rows, endRow)
  startRow = Math.min(startRow, endRow)

  const rows: Array<[number, number]> = [[startRow, endRow]]
  const focused = model.focused === null ? null : resolve(props, model.focused, false)
  if (focused !== null) {
    const row = rowOf(layout, focused)
    const kept: [number, number] = [Math.max(0, row - 1), Math.min(layout.rows, row + 2)]
    if (kept[1] < startRow) rows.unshift(kept)
    else if (kept[0] > endRow) rows.push(kept)
    else rows[0] = [Math.min(startRow, kept[0]), Math.max(endRow, kept[1])]
  }
  const last = rows[rows.length - 1]![1]
  return {
    ranges: rows.map(([start, end]) => [start * layout.lanes, Math.min(layout.count, end * layout.lanes)] as const),
    before: layout.offsets[rows[0]![0]]!,
    after: last >= layout.rows ? 0 : layout.offsets[layout.rows]! - layout.offsets[last]!,
    between: rows.length === 1 ? 0 : layout.offsets[rows[1]![0]]! - layout.offsets[rows[0]![1]]!,
    visible: visible === null ? null : [visible[0], visible[1]]
  }
}

const Bounds = Schema.NullOr(Schema.Struct({ start: Schema.NullOr(Schema.Number), end: Schema.NullOr(Schema.Number) }))

type Bounds = typeof Bounds.Type

const boundsOf = (layout: Layout, row: number): Bounds => ({
  start: row === 0 ? null : layout.offsets[row]!,
  end: row >= layout.rows - 1 ? null : layout.offsets[row + 1]!
})

const lanesOf = (items: ReadonlyArray<MeasuredItem>): number => {
  const lefts = items.map((item) => item.left).sort((a, b) => a - b)
  return lefts.filter((left, i) => i === 0 || !same(left, lefts[i - 1]!)).length
}

const measured = (
  model: VirtualListModel,
  props: VirtualListProps,
  { epoch, items, width }: typeof VirtualListMessage.cases.MeasuredItems.Type
): VirtualListModel => {
  if (epoch !== model.epoch || width === 0) return model
  let { gap, lanes } = model
  let reset = model.width !== 0 && !same(width, model.width)
  let changed = reset || model.width === 0
  const count = countOf(props)
  const flow = props.layout !== "absolute"
  const found = lanesOf(items)
  const lanesChanged = flow && items.length > 0 && found !== lanes && (found < items.length || found > lanes)
  if (lanesChanged) {
    lanes = found
    reset = changed = true
  }
  const fresh = props.measure === false ? [] : items.filter((item) => {
    const known = reset ? undefined : model.sizes[item.key ?? String(item.index)]
    return known === undefined || !same(known, item.size)
  })
  let sizes: VirtualListModel["sizes"] = reset ? {} : model.sizes
  if (fresh.length > 0) {
    sizes = { ...sizes, ...Object.fromEntries(fresh.map((item) => [item.key ?? String(item.index), item.size])) }
    changed = true
  }
  if (flow && !lanesChanged) {
    const rows = new Map<number, { top: number; bottom: number }>()
    for (const item of items) {
      const index = Math.floor(item.index / lanes)
      const row = rows.get(index)
      if (row === undefined) rows.set(index, { top: item.top, bottom: item.top + item.size })
      else {
        row.top = Math.min(row.top, item.top)
        row.bottom = Math.max(row.bottom, item.top + item.size)
      }
    }
    for (const [index, row] of rows) {
      const above = rows.get(index - 1)
      if (above === undefined) continue
      const measuredGap = Math.max(0, row.top - above.bottom)
      if (!same(measuredGap, gap)) {
        gap = measuredGap
        changed = true
      }
      break
    }
  }
  if (!changed) return model
  if (props.keys !== undefined && Object.keys(sizes).length > 2 * count + 64) {
    const live = new Set(props.keys)
    sizes = Object.fromEntries(Object.entries(sizes).filter(([key]) => live.has(key)))
  }
  return UiStruct.evolve(model, { gap, lanes, width, sizes, epoch: reset ? model.epoch + 1 : model.epoch })
}

const TrackVirtualListArgs = {
  id: Schema.String,
  epoch: Schema.Number,
  measure: Schema.Boolean,
  inset: Schema.Number,
  first: Bounds,
  last: Bounds,
  threshold: Schema.NullOr(Schema.Number),
  request: Schema.NullOr(ScrollRequest),
  fresh: Schema.NullOr(VirtualListScrollTo),
  waiting: Schema.Boolean,
  scrollContainer: Schema.NullOr(VirtualListScrollContainer),
  track: Schema.Boolean,
  absolute: Schema.Boolean
}

type TrackVirtualListArgs = Schema.Struct<typeof TrackVirtualListArgs>["Type"]

const within = (bounds: Bounds, y: number): boolean =>
  bounds !== null && (bounds.start === null || y >= bounds.start - 0.5) && (bounds.end === null || y < bounds.end + 0.5)

const TrackVirtualList = Mount.makeStream(
  "TrackVirtualList",
  { args: TrackVirtualListArgs },
  (list: HTMLElement, initial, changes) =>
    Stream.callback<VirtualListMessage>((queue) =>
      Effect.gen(function*() {
        let args: TrackVirtualListArgs = initial
        const send = (message: VirtualListMessage) => Queue.offerUnsafe(queue, message)
        const document = list.ownerDocument
        const window = document.defaultView!

        let viewport: HTMLElement | null = null
        let listening: AbortController | undefined
        let disposed = false
        let anchor: { readonly id: string; readonly top: number; readonly placed: number } | null = null
        let atEnd = false
        let reported: {
          readonly start: number
          readonly height: number
          readonly atStart: boolean
          readonly atEnd: boolean
        } | null = null
        let applied: VirtualListScrollTo | null = null
        let pinned: typeof ScrollRequest.Type | null = null
        let seen = 0
        let focused: string | null = null
        let focusTimer: ReturnType<typeof setTimeout> | undefined
        let sent = ""
        let tracked: Tracked = { offset: 0, height: 0, length: 0 }
        let scrolling = false
        let endTimer: ReturnType<typeof setTimeout> | undefined
        const observed = new Set<Element>()
        const watched = new Set<Element>()

        const itemsOf = () => Array.from(list.querySelectorAll<HTMLElement>(attrSelector(itemAttr, args.id)))
        const identity = (item: Element) => item.getAttribute("data-key") ?? "#" + item.getAttribute("data-index")
        const refOf = (item: Element) => ({
          index: Number(item.getAttribute("data-index")),
          key: item.getAttribute("data-key")
        })

        const listTop = () =>
          list.getBoundingClientRect().top + list.clientTop - (list === viewport ? list.scrollTop : 0)
        const placedAt = (item: HTMLElement) => {
          const rect = item.getBoundingClientRect()
          const shift = args.absolute ? /translateY\((-?[\d.]+)px\)/.exec(item.style.transform) : null
          if (shift === null) return rect
          const top = listTop() + Number(shift[1])
          return { top, bottom: top + rect.height, left: rect.left, height: rect.height }
        }

        const box = () => {
          if (viewport === null) return { top: 0, height: window.innerHeight }
          return { top: viewport.getBoundingClientRect().top + viewport.clientTop, height: viewport.clientHeight }
        }
        const scrollTop = () => viewport === null ? window.scrollY : viewport.scrollTop
        const origin = () => listTop() + args.inset
        const scrollBy = (delta: number) => {
          if (Math.abs(delta) < 0.5) return
          const top = scrollTop() + delta
          if (viewport === null) window.scrollTo({ top, behavior: "instant" })
          else viewport.scrollTo({ top, behavior: "instant" })
          seen = scrollTop()
        }
        const scroller = () => viewport ?? document.scrollingElement ?? document.documentElement
        const movedByUser = () => {
          const top = scrollTop()
          const element = scroller()
          const moved = !same(top, Math.min(seen, element.scrollHeight - element.clientHeight))
          seen = top
          return moved
        }
        const toEnd = () => {
          if (list === viewport) return list.scrollHeight - list.clientHeight - list.scrollTop
          const { height, top } = box()
          return list.getBoundingClientRect().bottom - top - height
        }
        const hidden = () => {
          const rect = list.getBoundingClientRect()
          return rect.width === 0 && rect.height === 0
        }

        const placement = (top: number) => list === viewport ? 0 : listTop() - top

        const capture = () => {
          const top = box().top
          const placed = placement(top)
          anchor = null
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

        const anchorAt = (start: number): Position | null => {
          const zero = origin()
          for (const item of itemsOf()) {
            const rect = placedAt(item)
            const top = rect.top - zero
            if (top > start + 0.5) return null
            if (rect.bottom - zero > start) return { ...refOf(item), offset: start - top }
          }
          return null
        }

        const metrics = (): Tracked => {
          const { height, top } = box()
          const zero = origin()
          return {
            offset: top - zero,
            height,
            length: list === viewport ? list.scrollHeight - args.inset : list.getBoundingClientRect().bottom - zero
          }
        }

        const sendMetrics = (next: Tracked) => {
          tracked = next
          send(VirtualListMessage.ScrolledViewport({ ...next, scrolling }))
        }

        const report = (scrolled: VirtualListScrollTo | null) => {
          if (hidden()) return
          const next = metrics()
          const { height, length, offset: start } = next
          const atStart = start <= defaultEndThreshold
          atEnd = toEnd() <= (args.threshold ?? defaultEndThreshold)
          const unchanged = reported !== null && same(height, reported.height) && atStart === reported.atStart &&
            atEnd === reported.atEnd
          if (
            scrolled === null && unchanged &&
            (same(start, reported!.start) || (within(args.first, start) && within(args.last, start + height)))
          ) {
            if (args.track && !sameTracked(next, tracked)) sendMetrics(next)
            return
          }
          reported = { start, height, atStart, atEnd }
          tracked = next
          send(
            VirtualListMessage.MovedViewport({
              start,
              height,
              atStart,
              atEnd,
              length,
              anchor: anchorAt(start),
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
          const items: Array<MeasuredItem> = []
          let shape = args.epoch + ":" + Math.round(rect.width)
          let firstTop: number | undefined
          for (const item of itemsOf()) {
            const box = placedAt(item)
            const top = box.top - zero
            firstTop ??= top
            shape += "|" + identity(item) + ":" + Math.round(box.height) + ":" + Math.round(top - firstTop) + ":" +
              Math.round(box.left - rect.left)
            items.push({ ...refOf(item), top, left: box.left - rect.left, size: box.height })
          }
          if (shape === sent) return
          sent = shape
          send(VirtualListMessage.MeasuredItems({ epoch: args.epoch, width: rect.width, items }))
        }

        const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => sync())
        const mutationObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => sync())
        const structureObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
          watchOutside()
          sync()
        })

        const observeOnly = (current: Set<Element>, next: ReadonlySet<Element>, options?: ResizeObserverOptions) => {
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
            structureObserver?.observe(element, { attributes: true, attributeFilter: layoutAttributes })
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
          const own = list.closest<HTMLElement>(attrSelector(viewportAttr, args.id))
          if (own !== null) return own
          const container = args.scrollContainer
          if (container === null) return null
          if (container !== "nearest") return list.parentElement?.closest<HTMLElement>(container.selector) ?? null
          for (
            let element = list.parentElement;
            element !== null && element !== document.body && element !== document.documentElement;
            element = element.parentElement
          ) {
            if (/^(auto|scroll|overlay)$/.test(window.getComputedStyle(element).overflowY)) return element
          }
          return null
        }

        const unpin = () => {
          pinned = null
        }

        const onScroll = () => {
          if (movedByUser()) {
            pinned = null
            if (args.waiting) send(VirtualListMessage.ScrolledByUser())
          }
          startScroll()
          capture()
          report(null)
        }

        const bind = () => {
          const next = resolveViewport()
          if (listening === undefined || next !== viewport) {
            listening?.abort()
            if (viewport !== null && viewport !== list) resizeObserver?.unobserve(viewport)
            viewport = next
            seen = scrollTop()
            listening = new AbortController()
            const options = { signal: listening.signal, passive: true }
            const target = viewport ?? window
            for (const type of ["wheel", "touchmove", "keydown", "pointerdown"]) {
              target.addEventListener(type, unpin, options)
            }
            ;(viewport ?? document).addEventListener("scrollend", onScrollEnd, options)
            if (viewport === null) {
              window.addEventListener("scroll", onScroll, options)
              window.addEventListener("resize", () => sync(), options)
            } else {
              viewport.addEventListener("scroll", onScroll, options)
              if (viewport !== list) resizeObserver?.observe(viewport)
            }
            watchOutside()
          }
          observeOnly(observed, new Set(args.measure ? itemsOf() : []), { box: "border-box" })
        }

        const sync = () => {
          if (disposed) return
          bind()
          const request = args.request
          const fresh = args.fresh
          if (request === null) applied = null
          if (fresh !== null && (request === null || !sameScrollTo(request.scrollTo, fresh))) {
            send(VirtualListMessage.RequestedScroll({ scrollTo: fresh }))
          }
          if (request !== null && (applied === null || !sameScrollTo(applied, request.scrollTo))) {
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

        const go = ({ index, offset, scrollTo }: typeof ScrollRequest.Type) => {
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
            scrollBy(alignedStart(top, bottom, view.top, view.height, scrollTo.align ?? "start") - view.top)
          } else if (offset !== null) scrollBy(origin() + offset - view.top)
          else scrollBy(toEnd())
        }

        const onFocus = () => {
          const item = activeOf(document)?.closest(attrSelector(itemAttr, args.id)) ?? null
          const next = item !== null && list.contains(item) ? item : null
          const id = next === null ? null : identity(next)
          if (id === focused) return
          focused = id
          send(next === null ? VirtualListMessage.BlurredItems() : VirtualListMessage.FocusedItem(refOf(next)))
        }

        const own = new AbortController()
        list.addEventListener("focusin", onFocus, { signal: own.signal })
        // The focus leaves one element before it reaches the next, so the item it goes to is known a moment later.
        list.addEventListener("focusout", () => {
          clearTimeout(focusTimer)
          focusTimer = setTimeout(onFocus, 0)
        }, { signal: own.signal })
        resizeObserver?.observe(list, { box: "border-box" })
        mutationObserver?.observe(list, { childList: true, attributes: true, attributeFilter: ["style"] })

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

type VirtualListUpdate = Component.Update<VirtualListModel, VirtualListMessage, VirtualListEvents, VirtualListProps>

const sameAnnounced = (a: Announced, b: Announced, track: boolean): boolean =>
  sameVisible(a, b) && a.scrolling === b.scrolling && (!track || sameTracked(a, b))

const announce = ($: VirtualListUpdate, next: VirtualListModel, layout = layoutOf(next, $.props)) => {
  const visible = visibleItems(layout, restingBand(next, $.props, layout))
  if (visible === null) return $.set(next)
  const announced = {
    first: visible[0],
    last: visible[1],
    atStart: next.atStart,
    atEnd: next.atEnd,
    offset: next.offset,
    height: next.height,
    length: next.length,
    scrolling: next.scrolling
  }
  return next.announced !== null && sameAnnounced(next.announced, announced, $.props.trackScroll === true)
    ? $.set(next)
    : $.set(next).evolve({ announced }).emit(VirtualListEvents.Scrolled(announced))
}

type ItemOf<B extends View.PartTarget<"div" | "li" | "tr">> = ReturnType<B["attr"]>

type Div = Html.Element<VirtualListMessage, never, Html.EventsOf<"div">, HTMLDivElement, "div">

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
 * `aria-setsize`, `data-index` and `data-key`. The list's padding and an
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
export const VirtualList = Component.define({
  name: "VirtualList",
  scoped: false,
  props: VirtualListProps,
  model: VirtualListModel,
  message: VirtualListMessage,
  events: VirtualListEvents,
  restore: (model) => UiStruct.evolve(model, { focused: null, lead: 0, scrolling: false }),
  elements: Html
}).make({
  init: ($) => ({
    position: null,
    height: 0,
    atStart: false,
    atEnd: false,
    lanes: 1,
    gap: 0,
    width: 0,
    sizes: {},
    dataset: $.props.dataset ?? null,
    epoch: 0,
    focused: null,
    scroll: $.props.scrollTo === undefined ? null : { scrollTo: $.props.scrollTo, done: false },
    offset: 0,
    length: 0,
    scrolling: false,
    announced: null,
    lead: 0
  }),
  update: {
    MovedViewport: ($, { anchor, atEnd, atStart, height, length, scrolled, start }) => {
      const model = current($.model, $.props)
      const layout = layoutOf(model, $.props)
      const row = rowAt(layout, start)
      const position = anchor ?? {
        index: row * layout.lanes,
        key: keyOf($.props, row * layout.lanes),
        offset: start - (layout.offsets[row] ?? 0)
      }
      const before = restingBand(model, $.props, layout)
      const moved = scrolled === null && before !== null ? start - before.start : 0
      const lead = Math.abs(moved) <= height ? moved : 0
      return announce(
        $,
        UiStruct.evolve(model, {
          position,
          height,
          atStart,
          atEnd,
          offset: start,
          length,
          lead,
          scroll: scrolled === null ? model.scroll : { scrollTo: scrolled, done: true }
        }),
        layout
      )
    },
    RequestedScroll: ($, { scrollTo }) =>
      sameRequest(scrollTo, latestOf($.model)) ? $.model : $.evolve({ scroll: { scrollTo, done: false } }),
    ScrolledByUser: ($) =>
      $.model.scroll === null || $.model.scroll.done
        ? $.model
        : $.evolve({ scroll: UiStruct.evolve($.model.scroll, { done: true }) }),
    MeasuredItems: ($, message) => {
      const model = current($.model, $.props)
      const next = measured(model, $.props, message)
      return next === model ? $.model : announce($, next)
    },
    FocusedItem: ($, { index, key }) => UiStruct.evolve(current($.model, $.props), { focused: { index, key } }),
    BlurredItems: ($) => UiStruct.evolve(current($.model, $.props), { focused: null }),
    ScrolledViewport: ($, { height, length, offset, scrolling }) =>
      announce($, UiStruct.evolve(current($.model, $.props), { offset, height, length, scrolling }))
  },
  parts: (p, stored) => {
    const props = p.props
    const model = current(stored, props)
    const id = p.id("virtual-list")
    const layout = layoutOf(model, props)
    const resting = restingBand(model, props, layout)
    const fresh = freshOf(model, props)
    const waiting = fresh ?? waitingOf(model)
    const pending = pendingOf(waiting, props, layout)
    const band = pending === null ? resting : pendingBand(model, layout, pending, resting)
    const { after, before, between, ranges, visible } = windowOf(
      model,
      props,
      layout,
      band,
      pending === null ? model.lead : 0
    )
    const reserve = Math.max(0, props.reserveStart ?? 0)
    const fill = props.contentAlignment === "end" && model.position !== null
      ? Math.max(0, model.height - layout.total - reserve)
      : 0
    const inset = reserve + fill
    const pushed = ranges[1]?.[0]
    const absolute = props.layout === "absolute"
    const first = props.firstPosition ?? 1
    const setSize = String(props.setSize ?? layout.count)

    const itemPart = p.part(["div", "li", "tr"], (b, index: number) => {
      const row = b.tag === "tr"
      const style = [
        props.measure === false ? `box-sizing:border-box;block-size:${props.sizes?.[index] ?? props.itemSize}px` : "",
        absolute
          ? `position:absolute;inset-inline:0;top:0;transform:translateY(${
            inset + layout.offsets[rowOf(layout, index)]!
          }px)`
          : "",
        !absolute && !row && pushed !== undefined && index >= pushed && index < pushed + layout.lanes
          ? `margin-block-start:${between}px`
          : ""
      ].filter((declarations) => declarations !== "").join(";")
      return (b as Div)
        .attrs({
          [itemAttr]: id,
          "data-index": String(index),
          "data-key": keyOf(props, index) ?? undefined,
          "aria-posinset": row ? undefined : String(first + index),
          "aria-setsize": row ? undefined : setSize,
          "aria-rowindex": row ? String(first + index) : undefined
        })
        .forward((node) => {
          const item = row ? node : defaults(node, { role: "listitem" })
          return style === "" ? item : ownStyle(style)(item)
        })
    })

    const spacer = (name: string, height: number): ReadonlyArray<View.Node<never>> =>
      height <= 0 ? [] : [
        View.toNode(
          new Html.Element<never>("tr").key(spacerAttr + ":" + name).attrs({
            [spacerAttr]: "",
            "aria-hidden": "true",
            style: `height:${Math.max(0, height - layout.gap)}px`
          })
        )
      ]

    const withSpacers = (children: ReadonlyArray<View.Node<any>>): ReadonlyArray<View.Node<any>> => [
      ...spacer("before", before + inset),
      ...children.flatMap((child) =>
        pushed !== undefined && child._tag === "Element" && child.attrs[itemAttr] === id &&
          child.attrs["data-index"] === String(pushed)
          ? [...spacer("between", between), child]
          : [child]
      ),
      ...spacer("after", after)
    ]

    return {
      items: ranges.flatMap(([start, end]) => Array.from({ length: end - start }, (_, i) => start + i)),
      count: layout.count,
      atStart: model.position !== null && model.atStart,
      atEnd: model.position !== null && model.atEnd,
      scrolling: model.scrolling,
      viewport: p.part(["div", "ul", "ol"], (b) => b.attr(viewportAttr, id)),
      table: p.part(
        ["table"],
        (b) => b.attr("aria-rowcount", props.setSize === undefined ? String(layout.count + first - 1) : setSize)
      ),
      list: p.part(["div", "ul", "ol", "tbody"], (b) => {
        const table = b.tag === "tbody"
        if (table && absolute) throw new Error("VirtualList: a <tbody> list can't use layout: \"absolute\"")
        return (b as Div)
          .onMount(TrackVirtualList({
            id,
            epoch: model.epoch,
            measure: props.measure !== false,
            inset,
            first: visible === null ? null : boundsOf(layout, visible[0]),
            last: visible === null ? null : boundsOf(layout, visible[1]),
            threshold: endThreshold(props),
            request: pending,
            fresh,
            waiting: waiting !== null,
            scrollContainer: props.scrollContainer ?? null,
            track: props.trackScroll === true,
            absolute
          }))
          .forward((node) => {
            if (table) {
              const built = View.build(ownStyle("overflow-anchor:none")(node), [])
              return { ...built, children: withSpacers(built.children) }
            }
            const style = absolute
              ? `position:relative;padding-block-start:0px;padding-block-end:${inset + layout.total}px`
              : `padding-block-start:${before + inset}px;padding-block-end:${after}px`
            return ownStyle(style + ";overflow-anchor:none")(defaults(node, { role: "list" }))
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
